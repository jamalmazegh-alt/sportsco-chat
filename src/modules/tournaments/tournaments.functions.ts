import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify, shortRandomSuffix } from "./lib/slug";
import { distributeIntoGroups, generateRoundRobin } from "./lib/scheduling";
import { computeStandings, type Tiebreaker, type MatchEventInput } from "./lib/standings";
import { generateKnockoutBracket } from "./lib/bracket";
import { mergeRules, DEFAULT_RULES } from "./lib/rules";
import { selectQualified } from "./lib/qualification";


// ---------- Schemas

const tournamentFormat = z.enum(["group", "knockout", "mixed"]);
const tournamentStatus = z.enum(["draft", "published", "in_progress", "completed", "cancelled"]);

const createSchema = z.object({
  club_id: z.string().uuid(),
  name: z.string().min(2).max(120),
  sport: z.string().min(1).max(40),
  category: z.string().max(80).optional().nullable(),
  starts_on: z.string(), // ISO date
  ends_on: z.string().optional().nullable(),
  format: tournamentFormat,
  num_teams: z.number().int().min(2).max(64),
  location: z.string().max(200).optional().nullable(),
  cover_image_url: z.string().url().optional().nullable(),
});

// ---------- Helpers

async function assertCanManage(
  supabase: any,
  userId: string,
  tournamentId: string,
): Promise<{ tournament: any }> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Not found", { status: 404 });
  const { data: ok } = await supabase.rpc("can_manage_tournament", {
    _user_id: userId,
    _tournament_id: tournamentId,
  });
  if (!ok) throw new Response("Forbidden", { status: 403 });
  return { tournament: data };
}

async function uniqueSlug(supabaseAdmin: any, base: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${shortRandomSuffix()}`;
    const { data } = await supabaseAdmin
      .from("tournaments")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${shortRandomSuffix()}`;
}

// ---------- CRUD

export const createTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { supabase, userId } = context;
    // Must be admin or dirigeant of the club
    const { data: role } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.club_id)
      .eq("user_id", userId)
      .in("role", ["admin", "dirigeant"])
      .limit(1);
    if (!role || role.length === 0) {
      throw new Response("Forbidden — admin/dirigeant required", { status: 403 });
    }

    const slug = await uniqueSlug(supabaseAdmin, slugify(data.name));
    const { data: row, error } = await supabase
      .from("tournaments")
      .insert({
        club_id: data.club_id,
        name: data.name,
        slug,
        sport: data.sport,
        category: data.category ?? null,
        starts_on: data.starts_on,
        ends_on: data.ends_on ?? null,
        format: data.format,
        num_teams: data.num_teams,
        location: data.location ?? null,
        cover_image_url: data.cover_image_url ?? null,
        created_by: userId,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { tournament: row };
  });

export const listMyTournaments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string }) =>
    z.object({ club_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("club_id", data.club_id)
      .is("archived_at", null)
      .order("starts_on", { ascending: false });
    if (error) throw error;
    return { tournaments: rows ?? [] };
  });

/**
 * List personal tournaments created by the current user without any club
 * (tournament-only organizers).
 */
export const listMyPersonalTournaments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("tournaments")
      .select("*")
      .is("club_id", null)
      .eq("created_by", userId)
      .is("archived_at", null)
      .order("starts_on", { ascending: false });
    if (error) throw error;
    return { tournaments: rows ?? [] };
  });

export const getTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [tRes, gRes, teamRes, mRes, canRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", data.tournament_id).maybeSingle(),
      supabase
        .from("tournament_groups")
        .select("*")
        .eq("tournament_id", data.tournament_id)
        .order("sort_order"),
      supabase
        .from("tournament_teams")
        .select("*")
        .eq("tournament_id", data.tournament_id)
        .order("seed", { nullsFirst: false }),
      supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", data.tournament_id)
        .order("scheduled_at", { nullsFirst: false }),
      supabase.rpc("can_manage_tournament", {
        _user_id: userId,
        _tournament_id: data.tournament_id,
      }),
    ]);
    if (tRes.error) throw tRes.error;
    if (!tRes.data) throw new Response("Not found", { status: 404 });
    return {
      tournament: tRes.data,
      groups: gRes.data ?? [],
      teams: teamRes.data ?? [],
      matches: mRes.data ?? [],
      canManage: Boolean(canRes.data),
    };
  });

export const updateTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        patch: z
          .object({
            name: z.string().min(2).max(120).optional(),
            status: tournamentStatus.optional(),
            location: z.string().max(200).nullable().optional(),
            cover_image_url: z.string().url().nullable().optional(),
            ends_on: z.string().nullable().optional(),
            settings: z.record(z.string(), z.any()).optional(),
            match_duration_min: z.number().int().min(1).max(240).optional(),
            break_min: z.number().int().min(0).max(120).optional(),
            daily_start_time: z.string().optional(),
            daily_end_time: z.string().optional(),

            fields: z.array(z.string().min(1).max(60)).max(20).optional(),

          })
          .strict(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { data: row, error } = await supabase
      .from("tournaments")
      .update(data.patch)
      .eq("id", data.tournament_id)
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { tournament: row };
  });


// ---------- Teams

const addTeamSchema = z.object({
  tournament_id: z.string().uuid(),
  team_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(120),
  short_name: z.string().max(20).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  seed: z.number().int().min(1).optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
});

export const addTournamentTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addTeamSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tournament } = await assertCanManage(supabase, userId, data.tournament_id);
    const { count } = await supabase
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", data.tournament_id);
    if (
      typeof tournament.num_teams === "number" &&
      (count ?? 0) >= tournament.num_teams
    ) {
      throw new Response(
        `Limite atteinte : ce tournoi est configuré pour ${tournament.num_teams} équipes.`,
        { status: 400 },
      );
    }
    const { data: row, error } = await supabase
      .from("tournament_teams")
      .insert({
        tournament_id: data.tournament_id,
        team_id: data.team_id ?? null,
        name: data.name,
        short_name: data.short_name ?? null,
        logo_url: data.logo_url ?? null,
        seed: data.seed ?? null,
        contact_email: data.contact_email ?? null,
        contact_phone: data.contact_phone ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { team: row };
  });

export const updateTournamentTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        team_id: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).max(120).optional(),
          short_name: z.string().max(20).nullable().optional(),
          logo_url: z.string().url().nullable().optional(),
          seed: z.number().int().min(1).nullable().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { data: row, error } = await supabase
      .from("tournament_teams")
      .update(data.patch)
      .eq("id", data.team_id)
      .eq("tournament_id", data.tournament_id)
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { team: row };
  });

export const bulkAddTournamentTeams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        teams: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              short_name: z.string().max(20).nullable().optional(),
              seed: z.number().int().min(1).nullable().optional(),
              contact_email: z.string().email().nullable().optional(),
              contact_phone: z.string().max(40).nullable().optional(),
            }),
          )
          .min(1)
          .max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tournament } = await assertCanManage(supabase, userId, data.tournament_id);
    const { count } = await supabase
      .from("tournament_teams")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", data.tournament_id);
    if (
      typeof tournament.num_teams === "number" &&
      (count ?? 0) + data.teams.length > tournament.num_teams
    ) {
      const remaining = Math.max(0, tournament.num_teams - (count ?? 0));
      throw new Response(
        `Limite atteinte : ce tournoi accepte ${tournament.num_teams} équipes (${remaining} place(s) restante(s)).`,
        { status: 400 },
      );
    }
    const rows = data.teams.map((t) => ({
      tournament_id: data.tournament_id,
      name: t.name,
      short_name: t.short_name ?? null,
      seed: t.seed ?? null,
      contact_email: t.contact_email ?? null,
      contact_phone: t.contact_phone ?? null,
    }));
    const { error, data: inserted } = await supabase
      .from("tournament_teams")
      .insert(rows)
      .select("id");
    if (error) throw new Response(error.message, { status: 400 });
    return { inserted: inserted?.length ?? 0 };
  });

export const removeTournamentTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { team_id: string; tournament_id: string }) =>
    z
      .object({ team_id: z.string().uuid(), tournament_id: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { error } = await supabase
      .from("tournament_teams")
      .delete()
      .eq("id", data.team_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// ---------- Groups & fixtures auto-gen

export const autoCreateGroupsAndFixtures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        num_groups: z.number().int().min(1).max(16),
        qualifiers_per_group: z.number().int().min(1).max(8).default(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    const { data: teams, error: teamsErr } = await supabase
      .from("tournament_teams")
      .select("id, seed")
      .eq("tournament_id", data.tournament_id);
    if (teamsErr) throw teamsErr;
    if (!teams || teams.length < 2) {
      throw new Response("Au moins 2 équipes requises", { status: 400 });
    }

    // Wipe existing groups + group matches (idempotent regeneration)
    await supabase
      .from("tournament_matches")
      .delete()
      .eq("tournament_id", data.tournament_id)
      .eq("round", "group");
    await supabase
      .from("tournament_groups")
      .delete()
      .eq("tournament_id", data.tournament_id);

    // Create groups (Poule A, B, ...)
    const groupRows = [];
    for (let i = 0; i < data.num_groups; i++) {
      groupRows.push({
        tournament_id: data.tournament_id,
        name: `Poule ${String.fromCharCode(65 + i)}`,
        qualifiers_count: data.qualifiers_per_group,
        sort_order: i,
      });
    }
    const { data: groups, error: gErr } = await supabase
      .from("tournament_groups")
      .insert(groupRows)
      .select("*");
    if (gErr) throw gErr;

    // Distribute teams
    const distribution = distributeIntoGroups(teams, data.num_groups);
    const teamUpdates: Promise<any>[] = [];
    const matchRows: any[] = [];
    let matchNum = 0;

    for (let i = 0; i < groups!.length; i++) {
      const g = groups![i];
      const teamIds = distribution[i] ?? [];
      // Assign group to teams
      for (const tid of teamIds) {
        teamUpdates.push(
          supabase
            .from("tournament_teams")
            .update({ group_id: g.id })
            .eq("id", tid)
            .then(() => null) as any,
        );
      }
      // Generate fixtures
      const pairings = generateRoundRobin(teamIds);
      for (const p of pairings) {
        matchNum++;
        matchRows.push({
          tournament_id: data.tournament_id,
          group_id: g.id,
          round: "group",
          match_number: matchNum,
          team_a_id: p.teamAId,
          team_b_id: p.teamBId,
          status: "scheduled",
        });
      }
    }
    await Promise.all(teamUpdates);
    if (matchRows.length) {
      const { error: mErr } = await supabase.from("tournament_matches").insert(matchRows);
      if (mErr) throw mErr;
    }

    return { groups_created: groups!.length, matches_created: matchRows.length };
  });

// ---------- Score entry

export const recordMatchScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        score_a: z.number().int().min(0).max(999),
        score_b: z.number().int().min(0).max(999),
        penalty_score_a: z.number().int().min(0).max(99).nullable().optional(),
        penalty_score_b: z.number().int().min(0).max(99).nullable().optional(),
        sets: z
          .array(
            z.object({
              a: z.number().int().min(0).max(999),
              b: z.number().int().min(0).max(999),
            }),
          )
          .max(7)
          .optional()
          .nullable(),
        status: z.enum(["live", "completed"]).default("completed"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { data: row, error } = await supabase
      .from("tournament_matches")
      .update({
        score_a: data.score_a,
        score_b: data.score_b,
        penalty_score_a: data.penalty_score_a ?? null,
        penalty_score_b: data.penalty_score_b ?? null,
        sets: data.sets ?? null,
        status: data.status,
      } as any)
      .eq("id", data.match_id)
      .eq("tournament_id", data.tournament_id)
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { match: row };
  });


// ---------- Standings (server-computed, RLS-aware)

export const getGroupStandings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: t } = await supabase
      .from("tournaments")
      .select("points_win, points_draw, points_loss, tiebreakers, settings")
      .eq("id", data.tournament_id)
      .single();
    const { data: teams } = await supabase
      .from("tournament_teams")
      .select("id, group_id, name, short_name, logo_url")
      .eq("tournament_id", data.tournament_id);
    const { data: matches } = await supabase
      .from("tournament_matches")
      .select(
        "group_id, team_a_id, team_b_id, score_a, score_b, status, validated_at, dispute_flag",
      )
      .eq("tournament_id", data.tournament_id)
      .eq("round", "group");
    const { data: groups } = await supabase
      .from("tournament_groups")
      .select("id, name, sort_order, qualifiers_count")
      .eq("tournament_id", data.tournament_id)
      .order("sort_order");
    const { data: events } = await supabase
      .from("tournament_match_events")
      .select("match_id, team_id, kind")
      .eq("tournament_id", data.tournament_id);

    const rules = mergeRules(t?.settings ?? {});
    // DB columns win over settings for legacy compat
    const pts = {
      win: t?.points_win ?? rules.points.win,
      draw: t?.points_draw ?? rules.points.draw,
      loss: t?.points_loss ?? rules.points.loss,
      bonusWin: rules.points.bonusWin,
    };
    const tiebreakers =
      (rules.tiebreakers && rules.tiebreakers.length > 0
        ? rules.tiebreakers
        : (t?.tiebreakers as Tiebreaker[] | null)) ?? DEFAULT_RULES.tiebreakers;

    // Statuts qui doivent atteindre computeStandings (la normalisation forfait s'y fait).
    const SPECIAL_STATUSES = new Set([
      "completed",
      "forfeit_a",
      "forfeit_b",
      "no_show_a",
      "no_show_b",
      "abandoned",
    ]);
    const includeMatch = (m: { status: string; validated_at: string | null }) => {
      if (!SPECIAL_STATUSES.has(m.status)) return false;
      if (rules.matchValidation.requireValidation) {
        return !!m.validated_at;
      }
      return true;
    };

    const eventsByMatch = new Map<string, MatchEventInput[]>();
    for (const ev of events ?? []) {
      const arr = eventsByMatch.get(ev.match_id) ?? [];
      arr.push({
        matchId: ev.match_id,
        teamId: ev.team_id,
        kind: ev.kind as MatchEventInput["kind"],
      });
      eventsByMatch.set(ev.match_id, arr);
    }

    const result = (groups ?? []).map((g) => {
      const groupTeamIds = (teams ?? []).filter((te) => te.group_id === g.id).map((te) => te.id);
      const groupMatches = (matches ?? [])
        .filter((m) => m.group_id === g.id && includeMatch(m))
        .map((m: any) => ({
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          scoreA: m.score_a,
          scoreB: m.score_b,
          status: m.status,
        }));
      const groupEvents = (matches ?? [])
        .filter((m: any) => m.group_id === g.id)
        .flatMap((m: any) => eventsByMatch.get(m.id) ?? []);
      const standings = computeStandings(groupTeamIds, groupMatches, pts, tiebreakers, {
        fairPlay: rules.fairPlay,
        events: groupEvents,
        drawLotSalt: data.tournament_id,
        forfeit: rules.forfeit,
      });
      const teamMap = new Map((teams ?? []).map((te) => [te.id, te]));
      return {
        group: g,
        rows: standings.map((s) => ({
          ...s,
          team: teamMap.get(s.teamId),
        })),
      };
    });
    return { standings: result, rules };
  });


// ---------- Knockout generation from group qualifiers

export const generateKnockoutFromGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        third_place: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    const { data: t } = await supabase
      .from("tournaments")
      .select("settings, points_win, points_draw, points_loss, tiebreakers")
      .eq("id", data.tournament_id)
      .single();
    const rules = mergeRules(t?.settings ?? {});
    const pts = {
      win: t?.points_win ?? rules.points.win,
      draw: t?.points_draw ?? rules.points.draw,
      loss: t?.points_loss ?? rules.points.loss,
    };
    const tiebreakers = rules.tiebreakers.length
      ? rules.tiebreakers
      : ((t?.tiebreakers as Tiebreaker[] | null) ?? DEFAULT_RULES.tiebreakers);

    const { data: groups } = await supabase
      .from("tournament_groups")
      .select("id, qualifiers_count, sort_order")
      .eq("tournament_id", data.tournament_id)
      .order("sort_order");
    if (!groups || groups.length === 0) {
      throw new Response("Aucune poule définie", { status: 400 });
    }

    const { data: teams } = await supabase
      .from("tournament_teams")
      .select("id, group_id")
      .eq("tournament_id", data.tournament_id);
    const { data: matches } = await supabase
      .from("tournament_matches")
      .select("group_id, team_a_id, team_b_id, score_a, score_b, status, id")
      .eq("tournament_id", data.tournament_id)
      .eq("round", "group");
    const { data: events } = await supabase
      .from("tournament_match_events")
      .select("match_id, team_id, kind")
      .eq("tournament_id", data.tournament_id);

    const groupStandings = groups.map((g) => {
      const ids = (teams ?? []).filter((te) => te.group_id === g.id).map((te) => te.id);
      const gMatches = (matches ?? [])
        .filter((m) => m.group_id === g.id)
        .map((m: any) => ({
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          scoreA: m.score_a,
          scoreB: m.score_b,
          status: m.status,
        }));
      const gEvents = (matches ?? [])
        .filter((m: any) => m.group_id === g.id)
        .flatMap((m: any) =>
          (events ?? [])
            .filter((e: any) => e.match_id === m.id)
            .map((e: any) => ({
              matchId: e.match_id,
              teamId: e.team_id,
              kind: e.kind as MatchEventInput["kind"],
            })),
        );
      const rows = computeStandings(ids, gMatches, pts, tiebreakers, {
        fairPlay: rules.fairPlay,
        events: gEvents,
        drawLotSalt: data.tournament_id,
        forfeit: rules.forfeit,
      });
      return { groupId: g.id, rows };
    });

    const qualifiedPicks = selectQualified(groupStandings, rules.qualification);
    const qualifiers = qualifiedPicks.map((q) => q.teamId);

    if (qualifiers.length < 2) {
      throw new Response("Pas assez de qualifiés", { status: 400 });
    }


    const bracket = generateKnockoutBracket(qualifiers, { thirdPlace: data.third_place });

    // Wipe existing non-group matches
    await supabase
      .from("tournament_matches")
      .delete()
      .eq("tournament_id", data.tournament_id)
      .neq("round", "group");

    // Insert bracket matches (sources stored as jsonb)
    const rows = bracket.map((m, idx) => ({
      tournament_id: data.tournament_id,
      round: m.round,
      bracket_position: m.bracketPosition,
      match_number: 1000 + idx,
      team_a_id: m.teamASource && "teamId" in m.teamASource ? m.teamASource.teamId : null,
      team_b_id: m.teamBSource && "teamId" in m.teamBSource ? m.teamBSource.teamId : null,
      team_a_source: m.teamASource as any,
      team_b_source: m.teamBSource as any,
      status: "scheduled" as const,
    }));
    const { error } = await supabase.from("tournament_matches").insert(rows as any);
    if (error) throw new Response(error.message, { status: 400 });

    return { matches_created: rows.length };
  });

// ---------- Public (anonymous) read by slug — uses admin client scoped by slug

export const getPublicTournament = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, name, slug, sport, category, starts_on, ends_on, location, format, status, cover_image_url, num_teams, settings",
      )
      .eq("slug", data.slug)
      .in("status", ["published", "in_progress", "completed"])
      .maybeSingle();
    if (!t) return null;

    const [gRes, teamRes, mRes, eRes] = await Promise.all([
      supabaseAdmin
        .from("tournament_groups")
        .select("id, name, sort_order, qualifiers_count")
        .eq("tournament_id", t.id)
        .order("sort_order"),
      supabaseAdmin
        .from("tournament_teams")
        .select("id, group_id, name, short_name, logo_url, seed")
        .eq("tournament_id", t.id),
      supabaseAdmin
        .from("tournament_matches")
        .select(
          "id, group_id, round, bracket_position, match_number, team_a_id, team_b_id, team_a_source, team_b_source, scheduled_at, field, status, score_a, score_b, sets, winner_team_id",
        )
        .eq("tournament_id", t.id)
        .order("scheduled_at", { nullsFirst: false }),
      supabaseAdmin
        .from("tournament_match_events")
        .select("id, match_id, team_id, kind, player_name, minute, created_at")
        .eq("tournament_id", t.id)
        .order("created_at"),
    ]);

    return {
      tournament: t,
      groups: gRes.data ?? [],
      teams: teamRes.data ?? [],
      matches: mRes.data ?? [],
      events: eRes.data ?? [],
    };
  });



// ---------- Auto-schedule (assigns scheduled_at and field to each match)

export const autoScheduleMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        starts_on: z.string(), // ISO date e.g. 2026-06-01
        daily_start_time: z.string(), // HH:MM
        daily_end_time: z.string().optional(),
        match_duration_min: z.number().int().min(1).max(240),
        break_min: z.number().int().min(0).max(120),
        fields: z.array(z.string().min(1).max(60)).min(1).max(20),
        lunch_start_time: z.string().optional(), // HH:MM
        lunch_end_time: z.string().optional(), // HH:MM
        min_rest_min: z.number().int().min(0).max(720).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tournament } = await assertCanManage(supabase, userId, data.tournament_id);

    const rules = mergeRules(tournament.settings);
    const minRest =
      data.min_rest_min !== undefined ? data.min_rest_min : rules.forfeit.minRestMinutes;

    const { data: matches, error } = await supabase
      .from("tournament_matches")
      .select("id, round, match_number, team_a_id, team_b_id")
      .eq("tournament_id", data.tournament_id)
      .order("round")
      .order("match_number");
    if (error) throw new Response(error.message, { status: 400 });
    if (!matches || matches.length === 0) {
      return { scheduled: 0, skipped: 0 };
    }

    const toMin = (hhmm: string) => {
      const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10));
      return hh * 60 + mm;
    };

    const slotMin = data.match_duration_min + data.break_min;
    const dayStartMin = toMin(data.daily_start_time);
    const dayEndMin = data.daily_end_time ? toMin(data.daily_end_time) : 24 * 60;
    const lunchStart =
      data.lunch_start_time && data.lunch_end_time ? toMin(data.lunch_start_time) : null;
    const lunchEnd =
      data.lunch_start_time && data.lunch_end_time ? toMin(data.lunch_end_time!) : null;

    const baseDate = new Date(`${data.starts_on}T00:00:00`);
    const numFields = data.fields.length;

    // Pre-compute valid start times per day (same every day)
    const validStartMins: number[] = [];
    let t = dayStartMin;
    while (t + data.match_duration_min <= dayEndMin) {
      const matchEnd = t + data.match_duration_min;
      const overlapsLunch =
        lunchStart !== null && lunchEnd !== null && t < lunchEnd && matchEnd > lunchStart;
      if (overlapsLunch) {
        t = lunchEnd!; // jump past lunch
        continue;
      }
      validStartMins.push(t);
      t += slotMin;
    }

    if (validStartMins.length === 0) {
      throw new Response("Aucun créneau disponible avec ces réglages", { status: 400 });
    }

    // Slot-by-slot assignment with min-rest enforcement
    const remaining = [...matches];
    const lastEndByTeam = new Map<string, number>(); // epoch ms
    const updates: Promise<any>[] = [];
    const MAX_DAYS = 60;
    let scheduled = 0;

    outer: for (let dayIdx = 0; dayIdx < MAX_DAYS; dayIdx++) {
      for (const minOfDay of validStartMins) {
        for (let fieldIdx = 0; fieldIdx < numFields; fieldIdx++) {
          if (remaining.length === 0) break outer;
          const at = new Date(baseDate);
          at.setDate(at.getDate() + dayIdx);
          at.setHours(0, minOfDay, 0, 0);
          const startMs = at.getTime();

          // Find first match where both teams have rested enough
          let pickIdx = -1;
          for (let i = 0; i < remaining.length; i++) {
            const m = remaining[i] as any;
            const lastA = m.team_a_id ? lastEndByTeam.get(m.team_a_id) : undefined;
            const lastB = m.team_b_id ? lastEndByTeam.get(m.team_b_id) : undefined;
            const restMs = minRest * 60_000;
            if (lastA !== undefined && startMs - lastA < restMs) continue;
            if (lastB !== undefined && startMs - lastB < restMs) continue;
            pickIdx = i;
            break;
          }
          if (pickIdx === -1) continue; // skip slot
          const match = remaining.splice(pickIdx, 1)[0] as any;
          const endMs = startMs + data.match_duration_min * 60_000;
          if (match.team_a_id) lastEndByTeam.set(match.team_a_id, endMs);
          if (match.team_b_id) lastEndByTeam.set(match.team_b_id, endMs);

          updates.push(
            supabase
              .from("tournament_matches")
              .update({
                scheduled_at: at.toISOString(),
                field: data.fields[fieldIdx],
                duration_min: data.match_duration_min,
              })
              .eq("id", match.id)
              .then(() => null) as any,
          );
          scheduled++;
        }
      }
    }

    await Promise.all(updates);
    return { scheduled, skipped: remaining.length };
  });

// ---------- Manual match assignment (field + scheduled_at)

export const updateMatchSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        field: z.string().min(1).max(60).nullable().optional(),
        scheduled_at: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const patch: { field?: string | null; scheduled_at?: string | null } = {};
    if (data.field !== undefined) patch.field = data.field;
    if (data.scheduled_at !== undefined) patch.scheduled_at = data.scheduled_at;
    const { data: row, error } = await supabase
      .from("tournament_matches")
      .update(patch)
      .eq("id", data.match_id)
      .eq("tournament_id", data.tournament_id)
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { match: row };
  });

// ---------- Tournament rules (jsonb settings)

export const updateTournamentRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        rules: z.record(z.string(), z.any()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const merged = mergeRules(data.rules);
    const patch: Record<string, unknown> = {
      settings: merged,
      points_win: merged.points.win,
      points_draw: merged.points.draw,
      points_loss: merged.points.loss,
      tiebreakers: merged.tiebreakers,
    };
    const { error } = await supabase
      .from("tournaments")
      .update(patch as any)
      .eq("id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { rules: merged };
  });

// Persistance immédiate des sponsors (utilisée par SponsorsEditor)
const sponsorTierEnum = z.enum(["main", "gold", "silver", "partner"]);
const sponsorSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  logo_url: z.string().url().max(1000),
  website: z.string().max(500).nullable().optional(),
  tier: sponsorTierEnum,
});

export const updateTournamentSponsors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        sponsors: z.array(sponsorSchema).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tournament } = await assertCanManage(supabase, userId, data.tournament_id);
    const current = mergeRules(tournament.settings);
    const sanitized = data.sponsors.map((s) => ({
      ...s,
      website: s.website && s.website.length > 0 ? s.website : null,
    }));
    const merged = mergeRules({
      ...current,
      branding: { ...current.branding, sponsors: sanitized },
    });
    const { error } = await supabase
      .from("tournaments")
      .update({ settings: merged } as any)
      .eq("id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { sponsors: merged.branding.sponsors ?? [] };
  });



// ---------- Match validation & dispute

export const validateMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        validated: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Allow organizer, co-organizer OR assigned referee for this match.
    const { data: canValidate } = await (supabase as any).rpc("can_validate_match", {
      _user_id: userId,
      _match_id: data.match_id,
    });
    if (!canValidate) throw new Response("Forbidden", { status: 403 });
    const { error } = await supabase
      .from("tournament_matches")
      .update({
        validated_at: data.validated ? new Date().toISOString() : null,
        validated_by: data.validated ? userId : null,
      })
      .eq("id", data.match_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const setMatchDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        dispute: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { error } = await supabase
      .from("tournament_matches")
      .update({ dispute_flag: data.dispute })
      .eq("id", data.match_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

const MATCH_STATUS_ENUM = [
  "scheduled",
  "live",
  "completed",
  "cancelled",
  "forfeit_a",
  "forfeit_b",
  "no_show_a",
  "no_show_b",
  "abandoned",
] as const;

export const setMatchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        status: z.enum(MATCH_STATUS_ENUM),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status === "scheduled" || data.status === "live") {
      patch.validated_at = null;
      patch.validated_by = null;
    }
    const { error } = await supabase
      .from("tournament_matches")
      .update(patch as any)
      .eq("id", data.match_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// ---------- Match events (cards, goals)


export const recordMatchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        team_id: z.string().uuid().nullable().optional(),
        kind: z.enum([
          "goal",
          "own_goal",
          "assist",
          "yellow_card",
          "red_card",
          "second_yellow",
          "penalty",
          "foul",
        ]),
        player_name: z.string().max(120).nullable().optional(),
        minute: z.number().int().min(0).max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { data: row, error } = await supabase
      .from("tournament_match_events")
      .insert({
        tournament_id: data.tournament_id,
        match_id: data.match_id,
        team_id: data.team_id ?? null,
        kind: data.kind,
        player_name: data.player_name ?? null,
        minute: data.minute ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { event: row };
  });

export const deleteMatchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        event_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    const { error } = await supabase
      .from("tournament_match_events")
      .delete()
      .eq("id", data.event_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const listMatchEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tournament_match_events")
      .select("*")
      .eq("tournament_id", data.tournament_id)
      .order("created_at");
    if (error) throw error;
    return { events: rows ?? [] };
  });

// ---------- Tournament documents (rules PDF)

export const generateRulesPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tournament } = await assertCanManage(supabase, userId, data.tournament_id);
    const { mergeRules } = await import("./lib/rules");
    const { buildRulesPdf } = await import("./lib/rules-pdf");
    const rules = mergeRules(tournament.settings);
    const bytes = await buildRulesPdf(
      {
        name: tournament.name,
        sport: tournament.sport,
        category: tournament.category,
        starts_on: tournament.starts_on,
        ends_on: tournament.ends_on,
        location: tournament.location,
        format: tournament.format,
        num_teams: tournament.num_teams,
      },
      rules,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ts = Date.now();
    const path = `${tournament.id}/rules-${rules.language}-${ts}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("tournament-documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Response(upErr.message, { status: 500 });
    const { data: pub } = supabaseAdmin.storage
      .from("tournament-documents")
      .getPublicUrl(path);
    const file_url = pub.publicUrl;
    const { data: row, error: insErr } = await supabaseAdmin
      .from("tournament_documents")
      .insert({
        tournament_id: tournament.id,
        kind: "rules",
        language: rules.language,
        file_url,
        storage_path: path,
        generated_by: userId,
      })
      .select("*")
      .single();
    if (insErr) throw new Response(insErr.message, { status: 500 });
    return { document: row };
  });

export const listTournamentDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tournament_documents")
      .select("*")
      .eq("tournament_id", data.tournament_id)
      .order("generated_at", { ascending: false });
    if (error) throw error;
    return { documents: rows ?? [] };
  });

// ---------- Team roster (players)

const playerInput = z.object({
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  jersey_number: z.number().int().min(0).max(999).nullable().optional(),
  position: z.string().max(40).nullable().optional(),
  is_captain: z.boolean().optional(),
  birth_date: z.string().nullable().optional(),
  license_number: z.string().max(60).nullable().optional(),
});

export const listTeamPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tournament_team_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tournament_team_players")
      .select("*")
      .eq("tournament_team_id", data.tournament_team_id)
      .order("jersey_number", { nullsFirst: false })
      .order("last_name");
    if (error) throw error;
    return { players: rows ?? [] };
  });

export const upsertTeamPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_team_id: z.string().uuid(),
        player_id: z.string().uuid().optional(),
        patch: playerInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // fetch tournament_id from team
    const { data: tt, error: tErr } = await supabase
      .from("tournament_teams")
      .select("tournament_id")
      .eq("id", data.tournament_team_id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!tt) throw new Error("Team not found");

    const payload = {
      tournament_team_id: data.tournament_team_id,
      tournament_id: tt.tournament_id,
      first_name: data.patch.first_name.trim(),
      last_name: data.patch.last_name.trim(),
      jersey_number: data.patch.jersey_number ?? null,
      position: data.patch.position?.trim() || null,
      is_captain: !!data.patch.is_captain,
      birth_date: data.patch.birth_date || null,
      license_number: data.patch.license_number?.trim() || null,
    };

    if (data.player_id) {
      const { data: row, error } = await supabase
        .from("tournament_team_players")
        .update(payload)
        .eq("id", data.player_id)
        .select()
        .single();
      if (error) throw error;
      return { player: row };
    } else {
      const { data: row, error } = await supabase
        .from("tournament_team_players")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { player: row };
    }
  });

export const deleteTeamPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ player_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("tournament_team_players")
      .delete()
      .eq("id", data.player_id);
    if (error) throw error;
    return { ok: true };
  });

export const bulkImportTeamPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_team_id: z.string().uuid(),
        replace: z.boolean().optional(),
        players: z.array(playerInput).min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tt, error: tErr } = await supabase
      .from("tournament_teams")
      .select("tournament_id")
      .eq("id", data.tournament_team_id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!tt) throw new Error("Team not found");

    if (data.replace) {
      const { error: delErr } = await supabase
        .from("tournament_team_players")
        .delete()
        .eq("tournament_team_id", data.tournament_team_id);
      if (delErr) throw delErr;
    }

    const rows = data.players.map((p) => ({
      tournament_team_id: data.tournament_team_id,
      tournament_id: tt.tournament_id,
      first_name: p.first_name.trim(),
      last_name: p.last_name.trim(),
      jersey_number: p.jersey_number ?? null,
      position: p.position?.trim() || null,
      is_captain: !!p.is_captain,
      birth_date: p.birth_date || null,
      license_number: p.license_number?.trim() || null,
    }));

    const { data: inserted, error } = await supabase
      .from("tournament_team_players")
      .insert(rows)
      .select("id");
    if (error) throw error;
    return { inserted: inserted?.length ?? 0 };
  });

// ---------- Tournament registrations (PR9)

const registrationPlayerSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  jersey_number: z.number().int().min(0).max(999).nullable().optional(),
  position: z.string().max(40).nullable().optional(),
  is_captain: z.boolean().optional(),
});

export const listTournamentRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        status: z
          .enum(["pending", "approved", "rejected", "cancelled"])
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);
    let q = supabase
      .from("tournament_registrations")
      .select("*")
      .eq("tournament_id", data.tournament_id)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { registrations: rows ?? [] };
  });

export const decideRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registration_id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        decision_note: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: reg, error: regErr } = await supabase
      .from("tournament_registrations")
      .select("*")
      .eq("id", data.registration_id)
      .maybeSingle();
    if (regErr) throw regErr;
    if (!reg) throw new Response("Inscription introuvable", { status: 404 });

    await assertCanManage(supabase, userId, reg.tournament_id);

    if (reg.status !== "pending") {
      throw new Response("Cette inscription a déjà été traitée", { status: 400 });
    }

    if (data.action === "reject") {
      const { error } = await supabase
        .from("tournament_registrations")
        .update({
          status: "rejected",
          decision_note: data.decision_note ?? null,
          decided_at: new Date().toISOString(),
          decided_by: userId,
        })
        .eq("id", data.registration_id);
      if (error) throw error;
      return { ok: true };
    }

    // approve → create tournament_team + roster
    const { data: team, error: teamErr } = await supabase
      .from("tournament_teams")
      .insert({
        tournament_id: reg.tournament_id,
        name: reg.team_name,
        short_name: reg.short_name,
        contact_email: reg.contact_email,
        contact_phone: reg.contact_phone,
      })
      .select("id")
      .single();
    if (teamErr) throw teamErr;

    const players = Array.isArray(reg.players) ? (reg.players as any[]) : [];
    if (players.length > 0) {
      const rows = players
        .filter(
          (p) =>
            p && typeof p.first_name === "string" && typeof p.last_name === "string",
        )
        .map((p) => ({
          tournament_team_id: team.id,
          tournament_id: reg.tournament_id,
          first_name: String(p.first_name).slice(0, 80),
          last_name: String(p.last_name).slice(0, 80),
          jersey_number:
            typeof p.jersey_number === "number" ? p.jersey_number : null,
          position: p.position ? String(p.position).slice(0, 40) : null,
          is_captain: !!p.is_captain,
        }));
      if (rows.length > 0) {
        const { error: pErr } = await supabase
          .from("tournament_team_players")
          .insert(rows);
        if (pErr) console.error("Failed to insert roster", pErr);
      }
    }

    const { error: updErr } = await supabase
      .from("tournament_registrations")
      .update({
        status: "approved",
        tournament_team_id: team.id,
        decision_note: data.decision_note ?? null,
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq("id", data.registration_id);
    if (updErr) throw updErr;

    return { ok: true, tournament_team_id: team.id };
  });

// ---------- Tirage au sort (Draw): applique une composition fournie par le client (auto/progressif/manuel)

const drawGroupsSchema = z.object({
  tournament_id: z.string().uuid(),
  mode: z.literal("groups"),
  num_groups: z.number().int().min(1).max(16),
  qualifiers_per_group: z.number().int().min(1).max(8).default(2),
  assignments: z
    .array(
      z.object({
        team_id: z.string().uuid(),
        group_index: z.number().int().min(0).max(15),
      }),
    )
    .min(2)
    .max(64),
});

const drawKnockoutSchema = z.object({
  tournament_id: z.string().uuid(),
  mode: z.literal("knockout"),
  bracket_order: z.array(z.string().uuid()).min(2).max(32),
  third_place: z.boolean().default(false),
});

export const applyTeamDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.union([drawGroupsSchema, drawKnockoutSchema]).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tournament } = await assertCanManage(supabase, userId, data.tournament_id);

    const { data: teams, error: teamsErr } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", data.tournament_id);
    if (teamsErr) throw teamsErr;
    const teamIds = new Set((teams ?? []).map((t: any) => t.id));
    if (teamIds.size < 2) {
      throw new Response("Au moins 2 équipes requises", { status: 400 });
    }

    if (data.mode === "groups") {
      if (tournament.format === "knockout") {
        throw new Response(
          "Ce tournoi est en élimination directe, choisis le mode bracket.",
          { status: 400 },
        );
      }
      for (const a of data.assignments) {
        if (!teamIds.has(a.team_id)) {
          throw new Response("Équipe inconnue dans le tirage", { status: 400 });
        }
        if (a.group_index >= data.num_groups) {
          throw new Response("Index de poule invalide", { status: 400 });
        }
      }

      // Wipe existing groups + group matches
      await supabase
        .from("tournament_matches")
        .delete()
        .eq("tournament_id", data.tournament_id)
        .eq("round", "group");
      await supabase
        .from("tournament_groups")
        .delete()
        .eq("tournament_id", data.tournament_id);

      // Create groups
      const groupRows = [];
      for (let i = 0; i < data.num_groups; i++) {
        groupRows.push({
          tournament_id: data.tournament_id,
          name: `Poule ${String.fromCharCode(65 + i)}`,
          qualifiers_count: data.qualifiers_per_group,
          sort_order: i,
        });
      }
      const { data: groups, error: gErr } = await supabase
        .from("tournament_groups")
        .insert(groupRows)
        .select("*");
      if (gErr) throw gErr;

      const groupsByIdx = (groups ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
      const teamUpdates: Promise<any>[] = [];
      const matchRows: any[] = [];
      let matchNum = 0;

      for (let i = 0; i < groupsByIdx.length; i++) {
        const g = groupsByIdx[i];
        const ids = data.assignments.filter((a) => a.group_index === i).map((a) => a.team_id);
        for (const tid of ids) {
          teamUpdates.push(
            supabase
              .from("tournament_teams")
              .update({ group_id: g.id })
              .eq("id", tid)
              .then(() => null) as any,
          );
        }
        const pairings = generateRoundRobin(ids);
        for (const p of pairings) {
          matchNum++;
          matchRows.push({
            tournament_id: data.tournament_id,
            group_id: g.id,
            round: "group",
            match_number: matchNum,
            team_a_id: p.teamAId,
            team_b_id: p.teamBId,
            status: "scheduled",
          });
        }
      }
      await Promise.all(teamUpdates);
      if (matchRows.length) {
        const { error: mErr } = await supabase.from("tournament_matches").insert(matchRows);
        if (mErr) throw mErr;
      }
      return { groups_created: groupsByIdx.length, matches_created: matchRows.length };
    }

    // mode === "knockout"
    if (tournament.format === "group") {
      throw new Response(
        "Ce tournoi est en poules, choisis le mode poules.",
        { status: 400 },
      );
    }
    for (const id of data.bracket_order) {
      if (!teamIds.has(id)) {
        throw new Response("Équipe inconnue dans le tirage", { status: 400 });
      }
    }
    const bracket = generateKnockoutBracket(data.bracket_order, {
      thirdPlace: data.third_place,
    });

    // Wipe existing non-group matches
    await supabase
      .from("tournament_matches")
      .delete()
      .eq("tournament_id", data.tournament_id)
      .neq("round", "group");

    const rows = bracket.map((m, idx) => ({
      tournament_id: data.tournament_id,
      round: m.round,
      bracket_position: m.bracketPosition,
      match_number: 1000 + idx,
      team_a_id: m.teamASource && "teamId" in m.teamASource ? m.teamASource.teamId : null,
      team_b_id: m.teamBSource && "teamId" in m.teamBSource ? m.teamBSource.teamId : null,
      team_a_source: m.teamASource as any,
      team_b_source: m.teamBSource as any,
      status: "scheduled" as const,
    }));
    if (rows.length) {
      const { error } = await supabase.from("tournament_matches").insert(rows as any);
      if (error) throw new Response(error.message, { status: 400 });
    }
    return { matches_created: rows.length };
  });


// ============================================================
// Collaborators (co-organizers & referees) + referee assignment
// ============================================================

const emailSchema = z.string().trim().email().max(254);

export const listTournamentCollaborators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only tournament managers can list collaborators
    await assertCanManage(supabase, userId, data.tournament_id);
    const { data: rows, error } = await (supabase as any)
      .from("tournament_collaborators")
      .select(
        "id, role, email, display_name, user_id, invitation_token, invited_at, accepted_at, revoked_at",
      )
      .eq("tournament_id", data.tournament_id)
      .order("invited_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });
    return { collaborators: rows ?? [] };
  });

export const inviteTournamentCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        role: z.enum(["co_organizer", "referee"]),
        email: emailSchema,
        display_name: z.string().trim().max(120).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only the "real" owner (admin/dirigeant/creator) can invite, not a co-orga.
    const { data: isOwner } = await (supabase as any).rpc("is_tournament_owner", {
      _user_id: userId,
      _tournament_id: data.tournament_id,
    });
    if (!isOwner) throw new Response("Forbidden", { status: 403 });

    const email = data.email.toLowerCase();
    // Upsert: re-inviting same email/role reactivates it
    const { data: existing } = await (supabase as any)
      .from("tournament_collaborators")
      .select("id, accepted_at, revoked_at, invitation_token")
      .eq("tournament_id", data.tournament_id)
      .eq("role", data.role)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await (supabase as any)
        .from("tournament_collaborators")
        .update({
          display_name: data.display_name ?? null,
          revoked_at: null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Response(error.message, { status: 400 });
      return { collaborator: updated };
    }

    const { data: row, error } = await (supabase as any)
      .from("tournament_collaborators")
      .insert({
        tournament_id: data.tournament_id,
        role: data.role,
        email,
        display_name: data.display_name ?? null,
        invited_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Response(error.message, { status: 400 });

    // Best-effort: send invitation email
    try {
      const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: tournament }, { data: inviter }] = await Promise.all([
        supabaseAdmin
          .from("tournaments")
          .select("name")
          .eq("id", data.tournament_id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, full_name")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      const inviterName =
        (inviter as any)?.full_name ||
        [(inviter as any)?.first_name, (inviter as any)?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        null;
      const baseUrl = process.env.SITE_URL || "https://app.clubero.app";
      await enqueueTransactionalEmailServer({
        templateName: "tournament-invite",
        recipientEmail: email,
        idempotencyKey: `tournament-invite-${row.id}`,
        templateData: {
          displayName: data.display_name ?? null,
          tournamentName: (tournament as any)?.name ?? null,
          roleLabel: data.role === "co_organizer" ? "co-organisateur" : "arbitre",
          inviterName,
          inviteUrl: `${baseUrl}/tournament-invite/${row.invitation_token}`,
        },
      });
    } catch (e) {
      // Email is best-effort; the link remains copiable from the UI.
      console.error("[tournament-invite email] failed", e);
    }

    return { collaborator: row };
  });

export const revokeTournamentCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        collaborator_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isOwner } = await (supabase as any).rpc("is_tournament_owner", {
      _user_id: userId,
      _tournament_id: data.tournament_id,
    });
    if (!isOwner) throw new Response("Forbidden", { status: 403 });

    const { error } = await (supabase as any)
      .from("tournament_collaborators")
      .delete()
      .eq("id", data.collaborator_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const acceptTournamentInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await (supabase as any).rpc(
      "accept_tournament_invite",
      { _token: data.token },
    );
    if (error) throw new Response(error.message, { status: 400 });
    return { result };
  });

export const getTournamentInviteByToken = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc(
      "get_tournament_invite_by_token",
      { _token: data.token },
    );
    if (error) throw new Response(error.message, { status: 400 });
    return { invite: result };
  });

// ----- Referee assignment per match -----

export const assignMatchReferee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        match_id: z.string().uuid(),
        // Either pick an existing accepted referee account, or just write a free-text name.
        referee_user_id: z.string().uuid().nullable().optional(),
        referee_name: z.string().trim().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    // If a user is provided, ensure they are an accepted referee for this tournament.
    if (data.referee_user_id) {
      const { data: ref } = await (supabase as any)
        .from("tournament_collaborators")
        .select("id, accepted_at, revoked_at")
        .eq("tournament_id", data.tournament_id)
        .eq("role", "referee")
        .eq("user_id", data.referee_user_id)
        .maybeSingle();
      if (!ref || !ref.accepted_at || ref.revoked_at) {
        throw new Response("Referee not part of this tournament", { status: 400 });
      }
    }

    const { error } = await (supabase as any)
      .from("tournament_matches")
      .update({
        referee_user_id: data.referee_user_id ?? null,
        referee_name: data.referee_name ?? null,
      })
      .eq("id", data.match_id)
      .eq("tournament_id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });
