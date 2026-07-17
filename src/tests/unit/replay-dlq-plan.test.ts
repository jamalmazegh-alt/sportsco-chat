import { describe, it, expect } from "vitest";
import { computePlan } from "@/lib/email/replay-dlq.functions";

/**
 * Integration test for the DLQ replay planner.
 *
 * Builds a mock `supabaseAdmin` whose `.from("email_send_log")` supports the
 * chainable filter pattern used by `computePlan`. Each row in the fixture
 * table represents one `email_send_log` row; the mock returns whichever rows
 * match the accumulated `.eq()` / `.in()` / `.gt()` filters, honoring
 * `.limit()` + `.maybeSingle()`.
 *
 * This exercises the anti-duplicate guards that a black-box "does it send?"
 * test cannot prove: `skippedAlreadyDelivered`, `skippedInFlight`,
 * `skippedNoDispatch`.
 */

type Row = Record<string, any>;

function makeSupabase(rows: Row[]) {
  return {
    from(_table: string) {
      const state: {
        eqs: Array<[string, any]>;
        ins: Array<[string, any[]]>;
        gts: Array<[string, any]>;
        limit?: number;
      } = { eqs: [], ins: [], gts: [] };

      const matches = () =>
        rows.filter((r) => {
          for (const [k, v] of state.eqs) if (r[k] !== v) return false;
          for (const [k, list] of state.ins) if (!list.includes(r[k])) return false;
          for (const [k, v] of state.gts) if (!(r[k] > v)) return false;
          return true;
        });

      const builder: any = {
        select() {
          return builder;
        },
        eq(k: string, v: any) {
          state.eqs.push([k, v]);
          return builder;
        },
        in(k: string, list: any[]) {
          state.ins.push([k, list]);
          return builder;
        },
        gt(k: string, v: any) {
          state.gts.push([k, v]);
          return builder;
        },
        limit(n: number) {
          state.limit = n;
          return builder;
        },
        maybeSingle() {
          const m = matches();
          return Promise.resolve({ data: m[0] ?? null, error: null });
        },
        then(resolve: any) {
          // For the top-level `await supabaseAdmin.from(...).select(...).eq(...).eq(...).eq(...)`
          // call that returns all matching rows (no `.maybeSingle()`).
          resolve({ data: matches(), error: null });
        },
      };
      return builder;
    },
  };
}

const EVENT = "event-1";
const NT = "convocation-invite";

const dlq = (dispatch_id: string | null, recipient_id: string | null, created_at: string) => ({
  event_id: EVENT,
  notification_type: NT,
  status: "dlq",
  dispatch_id,
  recipient_id,
  recipient_email: `${recipient_id ?? "x"}@x.com`,
  created_at,
});

const sent = (dispatch_id: string, recipient_id: string, created_at: string) => ({
  event_id: EVENT,
  notification_type: NT,
  status: "sent",
  dispatch_id,
  recipient_id,
  recipient_email: `${recipient_id}@x.com`,
  created_at,
  id: `sent-${dispatch_id}-${recipient_id}`,
});

const pending = (dispatch_id: string, recipient_id: string, created_at: string) => ({
  event_id: EVENT,
  notification_type: NT,
  status: "pending",
  dispatch_id,
  recipient_id,
  recipient_email: `${recipient_id}@x.com`,
  created_at,
  id: `pending-${dispatch_id}-${recipient_id}`,
});

describe("computePlan (DLQ replay planner)", () => {
  it("marks a DLQ row as replayable when no sent/pending exists", async () => {
    const supa = makeSupabase([dlq("d1", "player:p1", "2026-01-01T00:00:00Z")]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.candidates).toBe(1);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
    expect(plan.skippedInFlight).toBe(0);
    expect(plan.skippedNoDispatch).toBe(0);
    expect(plan.rows[0].dispatch_id).toBe("d1");
    expect(plan.rows[0].recipient_id).toBe("player:p1");
  });

  it("skips a DLQ row when a sent row exists for the same dispatch+recipient", async () => {
    const supa = makeSupabase([
      dlq("d1", "player:p1", "2026-01-01T00:00:00Z"),
      sent("d1", "player:p1", "2026-01-01T00:05:00Z"),
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.candidates).toBe(1);
    expect(plan.replayable).toBe(0);
    expect(plan.skippedAlreadyDelivered).toBe(1);
    expect(plan.skippedInFlight).toBe(0);
    expect(plan.skippedNoDispatch).toBe(0);
  });

  it("skips a DLQ row when a fresher pending row is in flight", async () => {
    const supa = makeSupabase([
      dlq("d1", "player:p1", "2026-01-01T00:00:00Z"),
      pending("d1", "player:p1", "2026-01-01T00:10:00Z"),
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.replayable).toBe(0);
    expect(plan.skippedInFlight).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
  });

  it("does NOT skip when the pending row is older than the DLQ row", async () => {
    // A pending row that predates the DLQ row is not "in flight" — it's what
    // eventually died and produced the DLQ entry. Guard uses gt(created_at).
    const supa = makeSupabase([
      dlq("d1", "player:p1", "2026-01-01T00:10:00Z"),
      pending("d1", "player:p1", "2026-01-01T00:00:00Z"),
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedInFlight).toBe(0);
  });

  it("counts rows missing dispatch_id or recipient_id under skippedNoDispatch and does not replay them", async () => {
    const supa = makeSupabase([
      dlq(null, "player:p1", "2026-01-01T00:00:00Z"),
      dlq("d2", null, "2026-01-01T00:00:00Z"),
      dlq("d3", "player:p3", "2026-01-01T00:00:00Z"),
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.candidates).toBe(3);
    expect(plan.skippedNoDispatch).toBe(2);
    expect(plan.replayable).toBe(1);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].dispatch_id).toBe("d3");
  });

  it("mixes all four cases in one plan without cross-contamination", async () => {
    const supa = makeSupabase([
      // replayable
      dlq("dA", "player:pA", "2026-01-01T00:00:00Z"),
      // already delivered
      dlq("dB", "player:pB", "2026-01-01T00:00:00Z"),
      sent("dB", "player:pB", "2026-01-01T00:01:00Z"),
      // in flight
      dlq("dC", "player:pC", "2026-01-01T00:00:00Z"),
      pending("dC", "player:pC", "2026-01-01T00:02:00Z"),
      // no dispatch
      dlq(null, "player:pD", "2026-01-01T00:00:00Z"),
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.candidates).toBe(4);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(1);
    expect(plan.skippedInFlight).toBe(1);
    expect(plan.skippedNoDispatch).toBe(1);
    expect(plan.rows[0].dispatch_id).toBe("dA");
  });

  it("filters by notification_type — a DLQ row of another type is invisible", async () => {
    const supa = makeSupabase([
      { ...dlq("d1", "player:p1", "2026-01-01T00:00:00Z"), notification_type: "player-invite" },
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.candidates).toBe(0);
    expect(plan.replayable).toBe(0);
  });

  it("does not treat a sent row from a different dispatch as delivered", async () => {
    // Two different dispatches for the same recipient must be replayed
    // independently. The unique index is (dispatch_id, recipient_id, notif).
    const supa = makeSupabase([
      dlq("d1", "player:p1", "2026-01-01T00:00:00Z"),
      sent("d2", "player:p1", "2026-01-01T00:05:00Z"),
    ]);
    const plan = await computePlan(supa, EVENT, NT);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
  });
});
