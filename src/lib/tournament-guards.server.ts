/**
 * Tournament freeze + match-edit guards.
 *
 * These guards complement `assertCanManage` (which enforces cross-tenant
 * isolation via the `can_manage_tournament` RPC). They add the
 * "tournament is started/completed → structure is frozen" rule, plus the
 * referee/organizer rules around match scores.
 *
 * Pure server-side. Throw a `Response` so server functions and server
 * routes can let it bubble up.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TournamentMutationScope =
  | "structure" // teams, format, groups, ranking rules, match generation/deletion
  | "scores" // referee submitting / organizer correcting scores
  | "logistics"; // pitch, time, referee assignment

const FROZEN_STATUSES = new Set(["in_progress", "completed", "cancelled"]);

/**
 * Throws 409 if `scope === 'structure'` and the tournament has started.
 * `scores` and `logistics` are always allowed (subject to other guards).
 */
export async function assertTournamentMutable(
  tournamentId: string,
  scope: TournamentMutationScope,
): Promise<void> {
  if (scope !== "structure") return;
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Tournament not found", { status: 404 });
  if (FROZEN_STATUSES.has(data.status as string)) {
    throw new Response(
      `Tournament is ${data.status}; structure is frozen`,
      { status: 409 },
    );
  }
}

export type MatchEditRole = "referee" | "organizer";

export interface MatchEditContext {
  supabase: SupabaseClient;
  userId: string;
  matchId: string;
  role: MatchEditRole;
  /** Required when editing an already-validated match as an organizer. */
  correctionReason?: string | null;
}

/**
 * Authorizes a match-score submit/edit.
 *
 * - referee: must be assigned to *this* match (cross-match attempts → 403)
 *   and the match must not yet be validated.
 * - organizer: must pass `can_manage_tournament` for the match's tournament.
 *   If the match is already validated, a non-empty `correctionReason` is
 *   required (caller is expected to persist it to the audit log).
 *
 * Returns the match row so callers don't re-fetch.
 */
export async function assertCanEditMatchScore(
  ctx: MatchEditContext,
): Promise<{
  match: {
    id: string;
    tournament_id: string;
    referee_user_id: string | null;
    validated_at: string | null;
  };
}> {
  const { supabase, userId, matchId, role, correctionReason } = ctx;
  if (!userId) throw new Response("Unauthorized", { status: 401 });

  const { data: match, error } = await supabaseAdmin
    .from("tournament_matches")
    .select("id, tournament_id, referee_user_id, validated_at")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!match) throw new Response("Match not found", { status: 404 });

  if (role === "referee") {
    if (match.referee_user_id !== userId) {
      throw new Response("Forbidden", { status: 403 });
    }
    if (match.validated_at) {
      // Validated/locked matches are read-only for referees.
      throw new Response("Match is locked", { status: 409 });
    }
    return { match };
  }

  // organizer path — cross-tenant via the same RPC the rest of the module uses.
  const { data: ok, error: rpcErr } = await supabase.rpc(
    "can_manage_tournament",
    { _user_id: userId, _tournament_id: match.tournament_id },
  );
  if (rpcErr) throw new Response("Internal error", { status: 500 });
  if (!ok) throw new Response("Forbidden", { status: 403 });

  if (match.validated_at) {
    const reason = (correctionReason ?? "").trim();
    if (!reason) {
      throw new Response(
        "A correction reason is required to edit a locked match",
        { status: 400 },
      );
    }
  }
  return { match };
}

/**
 * Authorizes locking/validating a match result. Organizer-only.
 */
export async function assertCanLockMatch(ctx: {
  supabase: SupabaseClient;
  userId: string;
  matchId: string;
}): Promise<void> {
  await assertCanEditMatchScore({ ...ctx, role: "organizer" });
}
