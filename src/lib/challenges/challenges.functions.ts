/**
 * Server functions — Défis & Tests.
 *
 * All calls go through `requireSupabaseAuth`. RLS remains the primary security
 * boundary; guards here add:
 *   - explicit projection of safe columns for public/category rankings
 *   - server-side normalization of ranking_visibility for physical tests
 *     (always staff-only, regardless of what the client sent).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHALLENGE_TEMPLATES, findTemplate } from "./templates";
import type { Database } from "@/integrations/supabase/types";

type Kind = Database["public"]["Enums"]["challenge_kind"];
type Unit = Database["public"]["Enums"]["challenge_unit"];
type Direction = Database["public"]["Enums"]["challenge_direction"];
type Aggregate = Database["public"]["Enums"]["challenge_aggregate"];
type Visibility = Database["public"]["Enums"]["challenge_visibility"];
type Recurrence = Database["public"]["Enums"]["challenge_recurrence"];

const kindEnum = z.enum(["challenge", "physical_test"]) satisfies z.ZodType<Kind>;
const unitEnum = z.enum([
  "count",
  "time_seconds",
  "distance_meters",
  "stage",
  "score",
]) satisfies z.ZodType<Unit>;
const dirEnum = z.enum(["higher_better", "lower_better"]) satisfies z.ZodType<Direction>;
const aggEnum = z.enum(["cumulative", "record"]) satisfies z.ZodType<Aggregate>;
const visEnum = z.enum(["staff", "category"]) satisfies z.ZodType<Visibility>;
const recEnum = z.enum(["season", "half_season", "punctual"]) satisfies z.ZodType<Recurrence>;

async function assertClubStaff(supabase: any, userId: string, clubId: string): Promise<void> {
  const { data, error } = await supabase.rpc("is_club_staff", {
    _user_id: userId,
    _club_id: clubId,
  });
  if (error) throw new Response(error.message, { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

// ---------- list challenges (for a team / season)

export const listChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clubId: z.string().uuid(),
        teamId: z.string().uuid().optional(),
        seasonId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("challenges")
      .select("*")
      .eq("club_id", data.clubId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (data.teamId) q = q.eq("team_id", data.teamId);
    if (data.seasonId) q = q.eq("season_id", data.seasonId);
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 400 });
    return { challenges: rows ?? [] };
  });

// ---------- create challenge (from template or custom)

export const createChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        club_id: z.string().uuid(),
        team_id: z.string().uuid().nullable().optional(),
        season_id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).max(80),
        icon: z.string().trim().max(8).nullable().optional(),
        kind: kindEnum,
        unit: unitEnum,
        direction: dirEnum,
        aggregate: aggEnum,
        recurrence: recEnum,
        ranking_visibility: visEnum,
        template_key: z.string().max(60).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubStaff(context.supabase, context.userId, data.club_id);

    // Physical tests are always staff-only, no matter what the client sent.
    const visibility: Visibility =
      data.kind === "physical_test" ? "staff" : data.ranking_visibility;

    const { data: row, error } = await context.supabase
      .from("challenges")
      .insert({
        club_id: data.club_id,
        team_id: data.team_id ?? null,
        season_id: data.season_id ?? null,
        name: data.name,
        icon: data.icon ?? null,
        kind: data.kind,
        unit: data.unit,
        direction: data.direction,
        aggregate: data.aggregate,
        recurrence: data.recurrence,
        ranking_visibility: visibility,
        template_key: data.template_key ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { challenge: row };
  });

export const createChallengeFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        club_id: z.string().uuid(),
        team_id: z.string().uuid().nullable().optional(),
        season_id: z.string().uuid().nullable().optional(),
        template_key: z.string(),
        // Optional overrides for the coach — name + visibility only.
        name: z.string().trim().min(1).max(80),
        ranking_visibility: visEnum.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubStaff(context.supabase, context.userId, data.club_id);
    const tpl = findTemplate(data.template_key);
    if (!tpl) throw new Response("Unknown template", { status: 400 });

    const visibility: Visibility =
      tpl.kind === "physical_test"
        ? "staff"
        : ((data.ranking_visibility ?? tpl.ranking_visibility) as Visibility);

    const { data: row, error } = await context.supabase
      .from("challenges")
      .insert({
        club_id: data.club_id,
        team_id: data.team_id ?? null,
        season_id: data.season_id ?? null,
        name: data.name,
        icon: tpl.icon,
        kind: tpl.kind,
        unit: tpl.unit,
        direction: tpl.direction,
        aggregate: tpl.aggregate,
        recurrence: tpl.recurrence,
        ranking_visibility: visibility,
        template_key: tpl.key,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { challenge: row };
  });

export const updateChallengeVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ challengeId: z.string().uuid(), ranking_visibility: visEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("challenges")
      .select("club_id, kind")
      .eq("id", data.challengeId)
      .single();
    if (!ch) throw new Response("Not found", { status: 404 });
    if (ch.kind === "physical_test" && data.ranking_visibility === "category") {
      throw new Response("Physical tests are always staff-only", { status: 400 });
    }
    await assertClubStaff(context.supabase, context.userId, ch.club_id);
    const { error } = await context.supabase
      .from("challenges")
      .update({ ranking_visibility: data.ranking_visibility })
      .eq("id", data.challengeId);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const archiveChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ challengeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("challenges")
      .select("club_id")
      .eq("id", data.challengeId)
      .single();
    if (!ch) throw new Response("Not found", { status: 404 });
    await assertClubStaff(context.supabase, context.userId, ch.club_id);
    const { error } = await context.supabase
      .from("challenges")
      .update({ is_active: false })
      .eq("id", data.challengeId);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// ---------- passages

export const listPassages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ challengeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("challenge_passages")
      .select("*")
      .eq("challenge_id", data.challengeId)
      .order("passage_date", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });
    return { passages: rows ?? [] };
  });

export const getOrCreatePassageForEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        challengeId: z.string().uuid(),
        eventId: z.string().uuid().nullish(),
        // ISO date (YYYY-MM-DD). Used only when eventId is absent; defaults to today.
        passageDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch } = await context.supabase
      .from("challenges")
      .select("club_id")
      .eq("id", data.challengeId)
      .single();
    if (!ch) throw new Response("Not found", { status: 404 });
    await assertClubStaff(context.supabase, context.userId, ch.club_id);

    const eventId = data.eventId ?? null;

    if (eventId) {
      const { data: existing } = await context.supabase
        .from("challenge_passages")
        .select("*")
        .eq("challenge_id", data.challengeId)
        .eq("event_id", eventId)
        .maybeSingle();
      if (existing) return { passage: existing };

      const { data: row, error } = await context.supabase
        .from("challenge_passages")
        .insert({
          challenge_id: data.challengeId,
          event_id: eventId,
          created_by: context.userId,
        })
        .select()
        .single();
      if (error) throw new Response(error.message, { status: 400 });
      return { passage: row };
    }

    // Standalone passage: unique per (challenge_id, passage_date) via partial index.
    const today = new Date().toISOString().slice(0, 10);
    const passageDate = data.passageDate ?? today;

    const { data: existing } = await context.supabase
      .from("challenge_passages")
      .select("*")
      .eq("challenge_id", data.challengeId)
      .is("event_id", null)
      .eq("passage_date", passageDate)
      .maybeSingle();
    if (existing) return { passage: existing };

    const { data: row, error } = await context.supabase
      .from("challenge_passages")
      .insert({
        challenge_id: data.challengeId,
        event_id: null,
        passage_date: passageDate,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { passage: row };
  });

// ---------- results (upsert + ranking)

const entrySchema = z.object({
  player_id: z.string().uuid(),
  value: z.number().finite().nonnegative(),
});

export const upsertResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        passageId: z.string().uuid(),
        entries: z.array(entrySchema).min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Load passage + challenge to authorize
    const { data: passage } = await context.supabase
      .from("challenge_passages")
      .select("id, challenge_id, challenges:challenge_id (id, club_id)")
      .eq("id", data.passageId)
      .single();
    if (!passage) throw new Response("Not found", { status: 404 });
    const ch = (passage as any).challenges as {
      id: string;
      club_id: string;
    };
    await assertClubStaff(context.supabase, context.userId, ch.club_id);

    const rows = data.entries.map((e) => ({
      passage_id: data.passageId,
      player_id: e.player_id,
      value: e.value,
      created_by: context.userId,
    }));

    const { error } = await context.supabase
      .from("challenge_results")
      .upsert(rows, { onConflict: "passage_id,player_id" });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true, count: rows.length };
  });

/**
 * Load existing results for a given passage so the entry screen can
 * pre-fill values (used to edit / correct a previously saved score).
 * Staff-only: RLS on challenge_results filters non-staff callers.
 */
export const getPassageResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ passageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("challenge_results")
      .select("player_id, value")
      .eq("passage_id", data.passageId);
    if (error) throw new Response(error.message, { status: 400 });
    return { results: (rows ?? []) as { player_id: string; value: number }[] };
  });

/**
 * Count of results per challenge for a given event.
 * Used by the event challenges list to switch the CTA from "Saisir" to
 * "Éditer" when data has already been recorded.
 */
export const getEventChallengesEntryCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: passages, error } = await context.supabase
      .from("challenge_passages")
      .select("id, challenge_id")
      .eq("event_id", data.eventId);
    if (error) throw new Response(error.message, { status: 400 });
    const rows = (passages ?? []) as { id: string; challenge_id: string }[];
    if (rows.length === 0) return { counts: {} as Record<string, number> };
    const { data: results } = await context.supabase
      .from("challenge_results")
      .select("passage_id")
      .in(
        "passage_id",
        rows.map((r) => r.id),
      );
    const byPassage = new Map<string, number>();
    for (const r of (results ?? []) as { passage_id: string }[]) {
      byPassage.set(r.passage_id, (byPassage.get(r.passage_id) ?? 0) + 1);
    }
    const counts: Record<string, number> = {};
    for (const p of rows) {
      counts[p.challenge_id] = (counts[p.challenge_id] ?? 0) + (byPassage.get(p.id) ?? 0);
    }
    return { counts };
  });

/**
 * Previous best value per player for a `record` challenge, EXCLUDING the given
 * passage. Used to detect "new record" moments on the entry screen.
 */
export const getChallengePlayerBests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        challengeId: z.string().uuid(),
        excludePassageId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch, error: chErr } = await context.supabase
      .from("challenges")
      .select("id, aggregate, direction")
      .eq("id", data.challengeId)
      .single();
    if (chErr || !ch) throw new Response("Not found", { status: 404 });

    const { data: passages } = await context.supabase
      .from("challenge_passages")
      .select("id")
      .eq("challenge_id", data.challengeId);
    let passageIds = ((passages ?? []) as { id: string }[]).map((p) => p.id);
    if (data.excludePassageId) {
      passageIds = passageIds.filter((id) => id !== data.excludePassageId);
    }
    if (passageIds.length === 0) {
      return {
        aggregate: ch.aggregate as Aggregate,
        direction: ch.direction as Direction,
        bests: {} as Record<string, number>,
      };
    }
    const { data: rows } = await context.supabase
      .from("challenge_results")
      .select("player_id, value")
      .in("passage_id", passageIds);

    const higher = ch.direction === "higher_better";
    const bests: Record<string, number> = {};
    for (const r of (rows ?? []) as { player_id: string; value: number }[]) {
      const v = Number(r.value);
      const cur = bests[r.player_id];
      if (cur == null || (higher ? v > cur : v < cur)) bests[r.player_id] = v;
    }
    return {
      aggregate: ch.aggregate as Aggregate,
      direction: ch.direction as Direction,
      bests,
    };
  });

/**
 * Ranking for a challenge, aggregated per player over the whole set of
 * passages the caller can read.
 * Optionally, pass `highlightPassageId` to mark rows whose value in that
 * passage is a new personal record (only meaningful for `record` challenges).
 */
export const getChallengeRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ challengeId: z.string().uuid(), highlightPassageId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ch, error: chErr } = await context.supabase
      .from("challenges")
      .select("*")
      .eq("id", data.challengeId)
      .single();
    if (chErr || !ch) throw new Response("Not found", { status: 404 });

    // RLS filters passages the caller can see.
    const { data: passages } = await context.supabase
      .from("challenge_passages")
      .select("id, passage_date")
      .eq("challenge_id", data.challengeId);
    const passageIds = (passages ?? []).map((p) => p.id as string);
    if (passageIds.length === 0) {
      return { challenge: ch, isStaff: false, ranking: [] as any[] };
    }

    const { data: results } = await context.supabase
      .from("challenge_results")
      .select("passage_id, player_id, value")
      .in("passage_id", passageIds);

    // Determine staff status (informational only for the client UI).
    const { data: isStaff } = await context.supabase.rpc("is_club_staff", {
      _user_id: context.userId,
      _club_id: ch.club_id,
    });

    // Enrich with player display info (RLS applies again).
    const playerIds = Array.from(new Set((results ?? []).map((r: any) => r.player_id as string)));
    const { data: players } = await context.supabase
      .from("players")
      .select("id, first_name, last_name, photo_url")
      .in("id", playerIds);
    const pMap = new Map((players ?? []).map((p) => [p.id as string, p]));

    // Aggregate
    const grouped = new Map<string, { values: number[] }>();
    for (const r of (results ?? []) as any[]) {
      const g = grouped.get(r.player_id as string) ?? { values: [] };
      g.values.push(Number(r.value));
      grouped.set(r.player_id as string, g);
    }

    const higher = ch.direction === "higher_better";

    // New-record detection for a highlighted passage.
    const isRecordChallenge = ch.aggregate === "record";
    let newRecordPlayerIds = new Set<string>();
    if (
      isRecordChallenge &&
      data.highlightPassageId &&
      passageIds.includes(data.highlightPassageId)
    ) {
      const historical = new Map<string, number>();
      for (const r of (results ?? []) as any[]) {
        if (r.passage_id === data.highlightPassageId) continue;
        const v = Number(r.value);
        const cur = historical.get(r.player_id as string);
        if (cur == null || (higher ? v > cur : v < cur)) {
          historical.set(r.player_id as string, v);
        }
      }
      for (const r of (results ?? []) as any[]) {
        if (r.passage_id !== data.highlightPassageId) continue;
        const v = Number(r.value);
        const prev = historical.get(r.player_id as string);
        if (prev == null || (higher ? v > prev : v < prev)) {
          newRecordPlayerIds.add(r.player_id as string);
        }
      }
    }

    const ranking = Array.from(grouped.entries())
      .map(([player_id, { values }]) => {
        const score =
          ch.aggregate === "cumulative"
            ? values.reduce((s, v) => s + v, 0)
            : higher
              ? Math.max(...values)
              : Math.min(...values);
        return {
          player_id,
          player: pMap.get(player_id) ?? null,
          score: round2(score),
          count: values.length,
          is_new_record: newRecordPlayerIds.has(player_id),
        };
      })
      .sort((a, b) => (higher ? b.score - a.score : a.score - b.score));

    return { challenge: ch, isStaff: !!isStaff, ranking };
  });

// ---------- Player stats (per-challenge timeline + aggregate)

export const getPlayerChallengeStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ playerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS enforces visibility: staff, the player himself, or a linked parent.
    const { data: results, error } = await context.supabase
      .from("challenge_results")
      .select(
        "id, value, created_at, passage_id, challenge_passages!inner(passage_date, challenge_id, challenges!inner(id, club_id, name, icon, kind, unit, direction, aggregate, ranking_visibility))",
      )
      .eq("player_id", data.playerId)
      .order("created_at", { ascending: true });
    if (error) throw new Response(error.message, { status: 400 });

    // Determine which challenges the caller is staff on (used for UI hints only).
    const staffClubs = new Set<string>();
    const rowsAny = (results ?? []) as any[];
    const clubIds = Array.from(
      new Set(rowsAny.map((r) => r.challenge_passages.challenges.club_id)),
    );
    for (const clubId of clubIds) {
      const { data: ok } = await context.supabase.rpc("is_club_staff", {
        _user_id: context.userId,
        _club_id: clubId,
      });
      if (ok) staffClubs.add(clubId);
    }

    const perChallenge = new Map<
      string,
      { challenge: any; points: { date: string; value: number }[] }
    >();
    for (const r of rowsAny) {
      const ch = r.challenge_passages.challenges;
      const entry = perChallenge.get(ch.id) ?? { challenge: ch, points: [] };
      entry.points.push({
        date: r.challenge_passages.passage_date,
        value: Number(r.value),
      });
      perChallenge.set(ch.id, entry);
    }

    const items = Array.from(perChallenge.values()).map(({ challenge, points }) => {
      const higher = challenge.direction === "higher_better";
      const aggregate =
        challenge.aggregate === "cumulative"
          ? points.reduce((s, p) => s + p.value, 0)
          : higher
            ? Math.max(...points.map((p) => p.value))
            : Math.min(...points.map((p) => p.value));
      const isStaff = staffClubs.has(challenge.club_id);
      return {
        challenge,
        points,
        aggregate: round2(aggregate),
        isStaff,
      };
    });

    return { items };
  });

// ---------- templates (client-safe helper)

export const listChallengeTemplates = createServerFn({ method: "GET" }).handler(async () => {
  return { templates: CHALLENGE_TEMPLATES };
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
