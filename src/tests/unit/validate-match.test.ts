import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateMatchHandler,
  validateMatchBracketHooks,
} from "@/modules/tournaments/tournaments.functions";

const TOURNAMENT_A = "11111111-1111-1111-1111-111111111111";
const TOURNAMENT_B = "22222222-2222-2222-2222-222222222222";
const MATCH_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const applyBracketProgressionSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger.server", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/email/send.server", () => ({
  enqueueTransactionalEmailServer: vi.fn(),
}));

type MatchRow = {
  id: string;
  tournament_id: string;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
};

function makeSupabase(opts: {
  canValidate: boolean;
  match: MatchRow | null;
  updateError?: string | null;
}) {
  const updateCalls: Array<{ matchId: string; tournamentId: string }> = [];

  const client = {
    rpc: vi.fn(async (name: string) => {
      if (name === "can_validate_match") {
        return { data: opts.canValidate, error: null };
      }
      return { data: null, error: null };
    }),
    from: (table: string) => {
      if (table !== "tournament_matches") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.match, error: null }),
            not: () => ({
              gt: () => ({
                or: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: (_col: string, matchId: string) => ({
            eq: (_col2: string, tournamentId: string) => {
              updateCalls.push({ matchId, tournamentId });
              return Promise.resolve({
                error: opts.updateError ? { message: opts.updateError } : null,
              });
            },
          }),
        }),
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    updateCalls,
  };
}

async function expectResponseStatus(promise: Promise<unknown>, status: number): Promise<Response> {
  try {
    await promise;
    throw new Error(`expected Response ${status}`);
  } catch (err) {
    expect(err).toBeInstanceOf(Response);
    const res = err as Response;
    expect(res.status).toBe(status);
    return res;
  }
}

const baseMatch: MatchRow = {
  id: MATCH_A,
  tournament_id: TOURNAMENT_A,
  match_number: 1,
  team_a_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  team_b_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
};

beforeEach(() => {
  applyBracketProgressionSpy.mockReset();
  applyBracketProgressionSpy.mockResolvedValue(undefined);
  vi.spyOn(validateMatchBracketHooks, "applyBracketProgression").mockImplementation(
    applyBracketProgressionSpy,
  );
});

describe("validateMatchHandler", () => {
  it("validates when match ∈ A and tournament_id is omitted — progression only in A", async () => {
    const { client, updateCalls } = makeSupabase({ canValidate: true, match: baseMatch });

    const result = await validateMatchHandler({
      data: { match_id: MATCH_A, validated: true },
      context: { supabase: client, userId: USER_ID },
    });

    expect(result).toEqual({ ok: true });
    expect(updateCalls).toEqual([{ matchId: MATCH_A, tournamentId: TOURNAMENT_A }]);
    expect(applyBracketProgressionSpy).toHaveBeenCalledTimes(1);
    expect(applyBracketProgressionSpy).toHaveBeenCalledWith(TOURNAMENT_A);
  });

  it("validates when tournament_id equals derived tournament A", async () => {
    const { client } = makeSupabase({ canValidate: true, match: baseMatch });

    await validateMatchHandler({
      data: { match_id: MATCH_A, tournament_id: TOURNAMENT_A, validated: true },
      context: { supabase: client, userId: USER_ID },
    });

    expect(applyBracketProgressionSpy).toHaveBeenCalledWith(TOURNAMENT_A);
  });

  it("rejects divergent tournament_id with 400 — applyBracketProgression never called", async () => {
    const { client, updateCalls } = makeSupabase({ canValidate: true, match: baseMatch });

    const res = await expectResponseStatus(
      validateMatchHandler({
        data: { match_id: MATCH_A, tournament_id: TOURNAMENT_B, validated: true },
        context: { supabase: client, userId: USER_ID },
      }),
      400,
    );
    expect(await res.text()).toBe("tournament_mismatch");

    expect(applyBracketProgressionSpy).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("returns 403 when caller cannot validate the match", async () => {
    const { client, updateCalls } = makeSupabase({ canValidate: false, match: baseMatch });

    await expectResponseStatus(
      validateMatchHandler({
        data: { match_id: MATCH_A, tournament_id: TOURNAMENT_A, validated: true },
        context: { supabase: client, userId: USER_ID },
      }),
      403,
    );

    expect(applyBracketProgressionSpy).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("returns 500 bracket_progression_failed when progression throws — not ok:true", async () => {
    applyBracketProgressionSpy.mockRejectedValueOnce(new Error("db down"));
    const { client, updateCalls } = makeSupabase({ canValidate: true, match: baseMatch });

    const res = await expectResponseStatus(
      validateMatchHandler({
        data: { match_id: MATCH_A, validated: true },
        context: { supabase: client, userId: USER_ID },
      }),
      500,
    );
    expect(JSON.parse(await res.text())).toEqual({ error: "bracket_progression_failed" });
    expect(updateCalls).toEqual([{ matchId: MATCH_A, tournamentId: TOURNAMENT_A }]);
    expect(applyBracketProgressionSpy).toHaveBeenCalledWith(TOURNAMENT_A);
  });
});
