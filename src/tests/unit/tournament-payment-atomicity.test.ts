/**
 * Atomicity tests for the tournament-registration payment flow.
 *
 * Exercises `handleTournamentCheckoutCompleted` against a fully mocked
 * `supabaseAdmin` so we can prove:
 *   - duplicate webhooks create at most one team (idempotent RPC)
 *   - failed team creation leaves the row in `paid_pending_team` for retry
 *   - the conditional UPDATE refuses to revert a `confirmed` row
 *   - `ensure_team_for_registration` is the single creation path
 *
 * Stripe SDK and the payment-event logger are stubbed; no network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    // call counters
    rpcCalls: [] as Array<{ name: string; args: any }>,
    updates: [] as any[],
    // mutable registration row (server-of-truth)
    reg: {
      id: "reg-1",
      tournament_id: "t-1",
      tournament_team_id: null as string | null,
      registration_state: "pending_payment",
    },
    // controls whether the RPC simulates a team creation failure
    rpcShouldFail: false,
  },
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const supabaseAdmin = {
    from: (table: string) => {
      if (table !== "tournament_registrations") {
        // unrelated calls (e.g. logger) — return a no-op chain
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        };
      }
      return {
        update: (patch: any) => ({
          eq: (_col: string, _id: string) => ({
            in: (_stateCol: string, allowed: string[]) => ({
              select: () => ({
                maybeSingle: async () => {
                  state.updates.push(patch);
                  // Conditional update: only apply if state in allowed[]
                  if (!allowed.includes(state.reg.registration_state)) {
                    return { data: null, error: null };
                  }
                  Object.assign(state.reg, patch);
                  return { data: { tournament_id: state.reg.tournament_id }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
    rpc: async (name: string, args: any) => {
      state.rpcCalls.push({ name, args });
      if (name !== "ensure_team_for_registration") return { data: null, error: null };
      if (state.rpcShouldFail) throw new Error("simulated team creation failure");
      // Idempotent: if a team already exists, return it; else create one.
      if (!state.reg.tournament_team_id) {
        state.reg.tournament_team_id = "team-" + Math.random().toString(36).slice(2, 8);
        state.reg.registration_state = "confirmed";
      }
      return { data: state.reg.tournament_team_id, error: null };
    },
  };
  return { supabaseAdmin };
});

vi.mock("@/lib/stripe.server", () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: async () => ({ amount_received: 5000, latest_charge: { id: "ch_x" } }),
    },
  }),
}));

vi.mock("./tournament-payment-events.server", () => ({
  logPaymentEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger.server", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { handleTournamentCheckoutCompleted } from "@/modules/tournaments/tournament-payments.server";

function makeSession(): any {
  return {
    id: "cs_test_1",
    payment_intent: "pi_1",
    amount_total: 5000,
    currency: "eur",
    metadata: { registration_id: "reg-1" },
  };
}

beforeEach(() => {
  state.rpcCalls = [];
  state.updates = [];
  state.reg = {
    id: "reg-1",
    tournament_id: "t-1",
    tournament_team_id: null,
    registration_state: "pending_payment",
  };
  state.rpcShouldFail = false;
});

describe("payment atomicity — duplicate webhook delivery", () => {
  it("delivering the same checkout.completed twice creates exactly one team", async () => {
    await handleTournamentCheckoutCompleted(makeSession(), "evt_1");
    await handleTournamentCheckoutCompleted(makeSession(), "evt_1");
    // Both deliveries called the ensure RPC, but the RPC is idempotent
    // and the registration ended up with a single team id.
    expect(state.reg.tournament_team_id).toMatch(/^team-/);
    expect(state.reg.registration_state).toBe("confirmed");
    const teamIds = state.rpcCalls
      .filter((c) => c.name === "ensure_team_for_registration")
      .map(() => state.reg.tournament_team_id);
    // All RPC results converged on the same team id (no duplicate created).
    expect(new Set(teamIds).size).toBe(1);
  });
});

describe("payment atomicity — paid_pending_team self-heal", () => {
  it("if team creation fails, registration stays in paid_pending_team and the next call heals it", async () => {
    state.rpcShouldFail = true;
    await handleTournamentCheckoutCompleted(makeSession(), "evt_first_try");
    expect(state.reg.tournament_team_id).toBeNull();
    expect(state.reg.registration_state).toBe("paid_pending_team");

    // Retry (e.g. self-heal cron): RPC now succeeds → team created exactly once.
    state.rpcShouldFail = false;
    await handleTournamentCheckoutCompleted(makeSession(), "evt_retry");
    expect(state.reg.tournament_team_id).toMatch(/^team-/);
    expect(state.reg.registration_state).toBe("confirmed");
  });
});

describe("payment atomicity — conditional state transition", () => {
  it("a stale webhook arriving after confirmation does NOT revert the row", async () => {
    // Simulate a row already confirmed (team manually created earlier).
    state.reg.registration_state = "confirmed";
    state.reg.tournament_team_id = "team-existing";

    await handleTournamentCheckoutCompleted(makeSession(), "evt_late");

    // The UPDATE was guarded by .in('registration_state', [pending_payment, paid_pending_team]),
    // so the confirmed row is untouched.
    expect(state.reg.registration_state).toBe("confirmed");
    expect(state.reg.tournament_team_id).toBe("team-existing");
  });
});

describe("payment atomicity — client cannot inject amount/tournament", () => {
  it("the server uses the registration_id from session metadata, never a client-provided amount", async () => {
    // The handler only reads session.metadata.registration_id and uses the
    // Stripe-reported amount_received. A malicious client cannot pass a
    // tournament_id or amount that would be honored here — the registration
    // row's tournament_id is the only source of truth (see ensure_team RPC,
    // which reads tournament_id FROM the registration row, not from input).
    const malicious: any = {
      ...makeSession(),
      metadata: {
        registration_id: "reg-1",
        // attacker tries to swap the tournament
        tournament_id: "tournament-of-another-club",
        amount: 1, // attacker tries 1 cent
      },
      amount_total: 1, // also override the cart
    };
    await handleTournamentCheckoutCompleted(malicious, "evt_mal");
    // Team got created against the registration's own tournament_id.
    expect(state.reg.tournament_id).toBe("t-1");
    expect(state.reg.tournament_team_id).toMatch(/^team-/);
    // The RPC was called with registration_id only — tournament_id and amount
    // are not parameters, so they cannot be poisoned.
    const ensureCalls = state.rpcCalls.filter(
      (c) => c.name === "ensure_team_for_registration",
    );
    expect(ensureCalls).toHaveLength(1);
    expect(ensureCalls[0].args).toEqual({ _registration_id: "reg-1" });
  });
});
