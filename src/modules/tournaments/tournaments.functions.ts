import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify, shortRandomSuffix } from "./lib/slug";
import { distributeIntoGroups, generateRoundRobin } from "./lib/scheduling";
import { computeStandings, type Tiebreaker } from "./lib/standings";
import { generateKnockoutBracket } from "./lib/bracket";

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

export const getTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [tRes, gRes, teamRes, mRes] = await Promise.all([
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
    ]);
    if (tRes.error) throw tRes.error;
    if (!tRes.data) throw new Response("Not found", { status: 404 });
    return {
      tournament: tRes.data,
      groups: gRes.data ?? [],
      teams: teamRes.data ?? [],
      matches: mRes.data ?? [],
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
    await assertCanManage(supabase, userId, data.tournament_id);
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
        status: data.status,
      })
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
      .select("points_win, points_draw, points_loss, tiebreakers")
      .eq("id", data.tournament_id)
      .single();
    const { data: teams } = await supabase
      .from("tournament_teams")
      .select("id, group_id, name, short_name, logo_url")
      .eq("tournament_id", data.tournament_id);
    const { data: matches } = await supabase
      .from("tournament_matches")
      .select("group_id, team_a_id, team_b_id, score_a, score_b, status")
      .eq("tournament_id", data.tournament_id)
      .eq("round", "group");
    const { data: groups } = await supabase
      .from("tournament_groups")
      .select("id, name, sort_order, qualifiers_count")
      .eq("tournament_id", data.tournament_id)
      .order("sort_order");

    const tiebreakers = (t?.tiebreakers as Tiebreaker[] | null) ?? [
      "points",
      "goal_diff",
      "goals_for",
      "head_to_head",
    ];
    const pts = {
      win: t?.points_win ?? 3,
      draw: t?.points_draw ?? 1,
      loss: t?.points_loss ?? 0,
    };

    const result = (groups ?? []).map((g) => {
      const groupTeamIds = (teams ?? []).filter((te) => te.group_id === g.id).map((te) => te.id);
      const groupMatches = (matches ?? [])
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          scoreA: m.score_a,
          scoreB: m.score_b,
          status: m.status,
        }));
      const standings = computeStandings(groupTeamIds, groupMatches, pts, tiebreakers);
      const teamMap = new Map((teams ?? []).map((te) => [te.id, te]));
      return {
        group: g,
        rows: standings.map((s) => ({
          ...s,
          team: teamMap.get(s.teamId),
        })),
      };
    });
    return { standings: result };
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

    // Compute standings & take top N from each group
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
      .select("group_id, team_a_id, team_b_id, score_a, score_b, status")
      .eq("tournament_id", data.tournament_id)
      .eq("round", "group");

    const qualifiers: string[] = [];
    for (const g of groups) {
      const ids = (teams ?? []).filter((t) => t.group_id === g.id).map((t) => t.id);
      const gMatches = (matches ?? [])
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          scoreA: m.score_a,
          scoreB: m.score_b,
          status: m.status,
        }));
      const standings = computeStandings(ids, gMatches);
      qualifiers.push(...standings.slice(0, g.qualifiers_count).map((s) => s.teamId));
    }

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
        "id, name, slug, sport, category, starts_on, ends_on, location, format, status, cover_image_url, num_teams",
      )
      .eq("slug", data.slug)
      .in("status", ["published", "in_progress", "completed"])
      .maybeSingle();
    if (!t) return null;

    const [gRes, teamRes, mRes] = await Promise.all([
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
          "id, group_id, round, bracket_position, match_number, team_a_id, team_b_id, team_a_source, team_b_source, scheduled_at, field, status, score_a, score_b, winner_team_id",
        )
        .eq("tournament_id", t.id)
        .order("scheduled_at", { nullsFirst: false }),
    ]);

    return {
      tournament: t,
      groups: gRes.data ?? [],
      teams: teamRes.data ?? [],
      matches: mRes.data ?? [],
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    const { data: matches, error } = await supabase
      .from("tournament_matches")
      .select("id, round, match_number")
      .eq("tournament_id", data.tournament_id)
      .order("round")
      .order("match_number");
    if (error) throw new Response(error.message, { status: 400 });
    if (!matches || matches.length === 0) {
      return { scheduled: 0 };
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

    const updates: Promise<any>[] = [];
    let cursor = 0; // global match cursor
    for (const match of matches) {
      const slotsPerDay = validStartMins.length * numFields;
      const dayIdx = Math.floor(cursor / slotsPerDay);
      const idxInDay = cursor % slotsPerDay;
      const timeIdx = Math.floor(idxInDay / numFields);
      const fieldIdx = idxInDay % numFields;
      const minOfDay = validStartMins[timeIdx];

      const at = new Date(baseDate);
      at.setDate(at.getDate() + dayIdx);
      at.setHours(0, minOfDay, 0, 0);

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
      cursor++;
    }

    await Promise.all(updates);
    return { scheduled: matches.length };
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
