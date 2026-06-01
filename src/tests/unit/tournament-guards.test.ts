/**
 * Unit tests for tournament freeze + match-edit guards.
 *
 * Same mocking pattern as `authz.test.ts`: `supabaseAdmin` and the
 * request-scoped `context.supabase` are stubbed via `vi.hoisted` so the
 * tests run pure (no DB, no network).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- supabaseAdmin mock (hoisted) ----------------------------------
const { tournamentRow, matchRow } = vi.hoisted(() => ({
  tournamentRow: { value: null as null | { status: string } },
  matchRow: {
    value: null as null | {
      id: string;
      tournament_id: string;
      referee_user_id: string | null;
      validated_at: string | null;
    },
  },
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const from = (table: string) => {
    if (table === "tournaments") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: tournamentRow.value, error: null }),
          }),
        }),
      };
    }
    if (table === "tournament_matches") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: matchRow.value, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected admin .from(${table})`);
  };
  return { supabaseAdmin: { from } };
});

import {
  assertTournamentMutable,
  assertCanEditMatchScore,
} from "@/lib/tournament-guards.server";

// ---------- fake context.supabase with controllable RPC -------------------
function makeCtx(rpcResult: boolean | null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
  } as any;
}

async function expectStatus(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toMatchObject({ status });
}

beforeEach(() => {
  tournamentRow.value = null;
  matchRow.value = null;
});

// =========================================================================
describe("assertTournamentMutable", () => {
  it("allows structural changes on a draft tournament", async () => {
    tournamentRow.value = { status: "draft" };
    await expect(
      assertTournamentMutable("t-1", "structure"),
    ).resolves.toBeUndefined();
  });

  it("allows structural changes on a published (not yet started) tournament", async () => {
    tournamentRow.value = { status: "published" };
    await expect(
      assertTournamentMutable("t-1", "structure"),
    ).resolves.toBeUndefined();
  });

  it("blocks structural changes once tournament is in_progress (409)", async () => {
    tournamentRow.value = { status: "in_progress" };
    await expectStatus(assertTournamentMutable("t-1", "structure"), 409);
  });

  it("blocks structural changes when tournament is completed (409)", async () => {
    tournamentRow.value = { status: "completed" };
    await expectStatus(assertTournamentMutable("t-1", "structure"), 409);
  });

  it("allows score updates even when tournament is in_progress", async () => {
    tournamentRow.value = { status: "in_progress" };
    await expect(
      assertTournamentMutable("t-1", "scores"),
    ).resolves.toBeUndefined();
  });

  it("allows logistics updates even when tournament is in_progress", async () => {
    tournamentRow.value = { status: "in_progress" };
    await expect(
      assertTournamentMutable("t-1", "logistics"),
    ).resolves.toBeUndefined();
  });

  it("returns 404 when the tournament does not exist", async () => {
    tournamentRow.value = null;
    await expectStatus(assertTournamentMutable("nope", "structure"), 404);
  });
});

// =========================================================================
describe("assertCanEditMatchScore — referee role", () => {
  it("allows referee assigned to the match", async () => {
    matchRow.value = {
      id: "m1",
      tournament_id: "t1",
      referee_user_id: "ref-1",
      validated_at: null,
    };
    await expect(
      assertCanEditMatchScore({
        supabase: makeCtx(false),
        userId: "ref-1",
        matchId: "m1",
        role: "referee",
      }),
    ).resolves.toMatchObject({ match: { id: "m1" } });
  });

  it("rejects referee trying to edit a match they are NOT assigned to (cross-match 403)", async () => {
    matchRow.value = {
      id: "m1",
      tournament_id: "t1",
      referee_user_id: "ref-other",
      validated_at: null,
    };
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(false),
        userId: "ref-1",
        matchId: "m1",
        role: "referee",
      }),
      403,
    );
  });

  it("rejects referee on a validated/locked match (409)", async () => {
    matchRow.value = {
      id: "m1",
      tournament_id: "t1",
      referee_user_id: "ref-1",
      validated_at: "2025-01-01T00:00:00Z",
    };
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(false),
        userId: "ref-1",
        matchId: "m1",
        role: "referee",
      }),
      409,
    );
  });

  it("rejects unauthenticated callers (401)", async () => {
    matchRow.value = {
      id: "m1",
      tournament_id: "t1",
      referee_user_id: "ref-1",
      validated_at: null,
    };
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(false),
        userId: "",
        matchId: "m1",
        role: "referee",
      }),
      401,
    );
  });
});

// =========================================================================
describe("assertCanEditMatchScore — organizer role (cross-tenant)", () => {
  beforeEach(() => {
    matchRow.value = {
      id: "m1",
      tournament_id: "tournament-of-club-A",
      referee_user_id: null,
      validated_at: null,
    };
  });

  it("allows organizer whose can_manage_tournament returns true", async () => {
    await expect(
      assertCanEditMatchScore({
        supabase: makeCtx(true),
        userId: "organizer-A",
        matchId: "m1",
        role: "organizer",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects organizer of club B trying to manage club A's tournament (403)", async () => {
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(false),
        userId: "organizer-B",
        matchId: "m1",
        role: "organizer",
      }),
      403,
    );
  });

  it("rejects staff of a different tournament (403)", async () => {
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(false),
        userId: "staff-other-tournament",
        matchId: "m1",
        role: "organizer",
      }),
      403,
    );
  });

  it("rejects public user (no userId → 401)", async () => {
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(true),
        userId: "",
        matchId: "m1",
        role: "organizer",
      }),
      401,
    );
  });

  it("organizer editing a locked match WITHOUT reason → 400", async () => {
    matchRow.value = {
      id: "m1",
      tournament_id: "tournament-of-club-A",
      referee_user_id: null,
      validated_at: "2025-01-01T00:00:00Z",
    };
    await expectStatus(
      assertCanEditMatchScore({
        supabase: makeCtx(true),
        userId: "organizer-A",
        matchId: "m1",
        role: "organizer",
        correctionReason: "  ",
      }),
      400,
    );
  });

  it("organizer editing a locked match WITH reason → allowed (audit trail expected)", async () => {
    matchRow.value = {
      id: "m1",
      tournament_id: "tournament-of-club-A",
      referee_user_id: null,
      validated_at: "2025-01-01T00:00:00Z",
    };
    await expect(
      assertCanEditMatchScore({
        supabase: makeCtx(true),
        userId: "organizer-A",
        matchId: "m1",
        role: "organizer",
        correctionReason: "Score sheet recount per referee dispute",
      }),
    ).resolves.toBeDefined();
  });
});
