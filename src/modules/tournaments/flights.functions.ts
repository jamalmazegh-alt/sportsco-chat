/**
 * Server fns pour le moteur Flight.
 *
 * Toutes les mutations passent par `can_manage_tournament` côté serveur.
 * La lecture est gérée par RLS (lecture publique pour tournois publiés).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  qualifyTeamsToFlight,
  generateFlightBracket,
  computeOverallStandings,
  type QualRule,
  type GroupStandingInput,
  type FlightResultInput,
} from "./lib/flights";
import { computeStandings } from "./lib/standings";

// ---------- helpers

async function assertManager(supabase: any, userId: string, tournamentId: string) {
  const { data: ok, error } = await supabase.rpc("can_manage_tournament", {
    _user_id: userId,
    _tournament_id: tournamentId,
  });
  if (error) throw error;
  if (!ok) throw new Response("Forbidden", { status: 403 });
}

const qualRuleSchema: z.ZodType<QualRule> = z.union([
  z.object({
    kind: z.literal("group_position"),
    positions: z.array(z.number().int().min(1).max(32)).min(1),
  }),
  z.object({
    kind: z.literal("group_position_in"),
    group_id: z.string().uuid(),
    positions: z.array(z.number().int().min(1).max(32)).min(1),
  }),
  z.object({
    kind: z.literal("best_n_remaining"),
    n: z.number().int().min(1).max(64),
  }),
  z.object({
    kind: z.literal("manual"),
    team_ids: z.array(z.string().uuid()).min(1),
  }),
]);

const flightInputSchema = z.object({
  name: z.string().min(1).max(60),
  short_name: z.string().max(8).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  sort_order: z.number().int().min(0).max(20),
  qualification_rules: z.array(qualRuleSchema).max(10),
  enable_third_place: z.boolean(),
  enable_fifth_place: z.boolean(),
  enable_seventh_place: z.boolean(),
});

// ---------- list

export const listFlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tournament_flights")
      .select("*")
      .eq("tournament_id", data.tournament_id)
      .order("sort_order");
    if (error) throw error;
    return { flights: rows ?? [] };
  });

// ---------- batch upsert (création/édition complète d'un set de Flights)

export const saveFlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        flights: z.array(flightInputSchema).min(1).max(10),
        replace_all: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId, data.tournament_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.replace_all) {
      // Garde-fou : interdit si un match Flight a déjà commencé
      const { data: started } = await supabaseAdmin
        .from("tournament_matches")
        .select("id, status, flight_id")
        .eq("tournament_id", data.tournament_id)
        .not("flight_id", "is", null)
        .neq("status", "scheduled")
        .limit(1);
      if (started && started.length > 0) {
        throw new Response(
          "Cannot replace flights: some flight matches have already started",
          { status: 409 },
        );
      }
      // Supprime les matchs non joués des flights existants puis les flights
      await supabaseAdmin
        .from("tournament_matches")
        .delete()
        .eq("tournament_id", data.tournament_id)
        .not("flight_id", "is", null);
      await supabaseAdmin
        .from("tournament_flights")
        .delete()
        .eq("tournament_id", data.tournament_id);
    }

    const inserts = data.flights.map((f) => ({
      tournament_id: data.tournament_id,
      sort_order: f.sort_order,
      name: f.name,
      short_name: f.short_name ?? null,
      color: f.color ?? null,
      qualification_rules: f.qualification_rules as any,
      enable_third_place: f.enable_third_place,
      enable_fifth_place: f.enable_fifth_place,
      enable_seventh_place: f.enable_seventh_place,
    }));

    const { data: rows, error } = await supabaseAdmin
      .from("tournament_flights")
      .insert(inserts)
      .select("*");
    if (error) throw new Response(error.message, { status: 400 });
    return { flights: rows ?? [] };
  });

// ---------- générer les brackets de tous les Flights

export const generateAllFlightBrackets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId, data.tournament_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Charge poules, équipes, matchs de poule et flights
    const [{ data: flights }, { data: groups }, { data: teams }, { data: matches }] =
      await Promise.all([
        supabaseAdmin
          .from("tournament_flights")
          .select("*")
          .eq("tournament_id", data.tournament_id)
          .order("sort_order"),
        supabaseAdmin
          .from("tournament_groups")
          .select("*")
          .eq("tournament_id", data.tournament_id)
          .order("sort_order"),
        supabaseAdmin
          .from("tournament_teams")
          .select("*")
          .eq("tournament_id", data.tournament_id),
        supabaseAdmin
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", data.tournament_id),
      ]);

    if (!flights || flights.length === 0) {
      throw new Response("No flights configured", { status: 400 });
    }

    // Calcule le classement de chaque poule
    const groupStandings: GroupStandingInput[] = (groups ?? []).map((g: any) => {
      const groupTeamIds = (teams ?? [])
        .filter((tt: any) => tt.group_id === g.id)
        .map((tt: any) => tt.id);
      const groupMatches = (matches ?? [])
        .filter((m: any) => m.group_id === g.id && m.round === "group")
        .map((m: any) => ({
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          scoreA: m.score_a,
          scoreB: m.score_b,
          status: m.status,
        }));
      const standings = computeStandings(groupTeamIds, groupMatches);
      return {
        group_id: g.id,
        ordered_team_ids: standings.map((s: any) => s.teamId),
      };
    });

    // Vérifie que tous les matchs de poules sont joués
    const incompleteGroupMatches = (matches ?? []).filter(
      (m: any) => m.round === "group" && m.status !== "completed",
    );
    if (incompleteGroupMatches.length > 0) {
      throw new Response(
        `Cannot generate flights: ${incompleteGroupMatches.length} group matches are not completed`,
        { status: 409 },
      );
    }

    // Pour chaque Flight : qualifier les équipes puis générer le bracket
    const alreadyQualified = new Set<string>();
    const createdMatches: any[] = [];

    // Supprime les matchs précédents des flights pour repartir propre
    await supabaseAdmin
      .from("tournament_matches")
      .delete()
      .eq("tournament_id", data.tournament_id)
      .not("flight_id", "is", null);

    for (const flight of flights) {
      // Calcule le quota = somme des positions des règles + wild cards
      let quota = 0;
      for (const rule of flight.qualification_rules as QualRule[]) {
        if (rule.kind === "group_position") {
          quota += rule.positions.length * groupStandings.length;
        } else if (rule.kind === "group_position_in") {
          quota += rule.positions.length;
        } else if (rule.kind === "best_n_remaining") {
          quota += rule.n;
        } else if (rule.kind === "manual") {
          quota += rule.team_ids.length;
        }
      }
      if (quota === 0) continue;

      const qualifiedTeams = qualifyTeamsToFlight(
        groupStandings,
        alreadyQualified,
        flight.qualification_rules as QualRule[],
        quota,
      );
      for (const id of qualifiedTeams) alreadyQualified.add(id);

      if (qualifiedTeams.length < 2) continue;

      const bracket = generateFlightBracket(qualifiedTeams, {
        thirdPlace: flight.enable_third_place,
        fifthPlace: flight.enable_fifth_place,
        seventhPlace: flight.enable_seventh_place,
      });

      // Convertit en rows tournament_matches
      let matchCounter = 0;
      for (const m of bracket) {
        matchCounter++;
        const round = mapRoundToDb(m.round);
        createdMatches.push({
          tournament_id: data.tournament_id,
          flight_id: flight.id,
          round,
          placement_kind: m.placement_kind,
          bracket_position: m.bracketPosition,
          match_number: matchCounter,
          team_a_id:
            m.teamASource && "teamId" in m.teamASource
              ? m.teamASource.teamId
              : null,
          team_b_id:
            m.teamBSource && "teamId" in m.teamBSource
              ? m.teamBSource.teamId
              : null,
          team_a_source:
            m.teamASource && "fromMatch" in m.teamASource ? m.teamASource : null,
          team_b_source:
            m.teamBSource && "fromMatch" in m.teamBSource ? m.teamBSource : null,
          status: "scheduled",
        });
      }
    }

    if (createdMatches.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("tournament_matches")
        .insert(createdMatches);
      if (insErr) throw new Response(insErr.message, { status: 400 });
    }

    return { created: createdMatches.length };
  });

function mapRoundToDb(r: string): string {
  switch (r) {
    case "r32":
      return "r32";
    case "r16":
      return "r16";
    case "qf":
      return "qf";
    case "sf":
      return "sf";
    case "final":
      return "final";
    case "third_place":
      return "third_place";
    default:
      return r;
  }
}

// ---------- déplacer une équipe vers un autre Flight

export const moveTeamToFlight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        team_id: z.string().uuid(),
        from_flight_id: z.string().uuid().nullable(),
        to_flight_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId, data.tournament_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Vérifier qu'aucun match du Flight cible n'a démarré
    const { data: started } = await supabaseAdmin
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", data.tournament_id)
      .eq("flight_id", data.to_flight_id)
      .neq("status", "scheduled")
      .limit(1);
    if (started && started.length > 0) {
      throw new Response(
        "Cannot move team: target flight has matches in progress",
        { status: 409 },
      );
    }

    // Remplace l'équipe dans le bracket : on patch les matchs encore prévus
    // où l'équipe figure en A ou B, en la retirant côté origine, et on l'ajoute
    // dans le 1er slot vide du flight cible.
    if (data.from_flight_id) {
      await supabaseAdmin
        .from("tournament_matches")
        .update({ team_a_id: null } as any)
        .eq("tournament_id", data.tournament_id)
        .eq("flight_id", data.from_flight_id)
        .eq("team_a_id", data.team_id)
        .eq("status", "scheduled");
      await supabaseAdmin
        .from("tournament_matches")
        .update({ team_b_id: null } as any)
        .eq("tournament_id", data.tournament_id)
        .eq("flight_id", data.from_flight_id)
        .eq("team_b_id", data.team_id)
        .eq("status", "scheduled");
    }

    // Trouver un slot vide dans le flight cible
    const { data: targets } = await supabaseAdmin
      .from("tournament_matches")
      .select("id, team_a_id, team_b_id")
      .eq("tournament_id", data.tournament_id)
      .eq("flight_id", data.to_flight_id)
      .eq("status", "scheduled")
      .order("bracket_position");

    const slot = (targets ?? []).find((m: any) => !m.team_a_id || !m.team_b_id);
    if (!slot) {
      throw new Response("Target flight has no free slot", { status: 409 });
    }
    const patch: any = !slot.team_a_id
      ? { team_a_id: data.team_id }
      : { team_b_id: data.team_id };

    const { error: updErr } = await supabaseAdmin
      .from("tournament_matches")
      .update(patch)
      .eq("id", slot.id);
    if (updErr) throw new Response(updErr.message, { status: 400 });

    return { ok: true };
  });

// ---------- classement final global

export const getOverallStandings = createServerFn({ method: "POST" })
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: flights }, { data: matches }] = await Promise.all([
      supabaseAdmin
        .from("tournament_flights")
        .select("*")
        .eq("tournament_id", data.tournament_id)
        .order("sort_order"),
      supabaseAdmin
        .from("tournament_matches")
        .select("id, flight_id, placement_kind, winner_team_id, team_a_id, team_b_id, status")
        .eq("tournament_id", data.tournament_id)
        .not("flight_id", "is", null),
    ]);

    if (!flights) return { ranking: [] };

    const flightInputs: FlightResultInput[] = (flights as any[]).map((f) => {
      const flightMatches = (matches ?? []).filter(
        (m: any) => m.flight_id === f.id,
      );
      const final = flightMatches.find((m: any) => m.placement_kind === "final");
      const thirdPlace = flightMatches.find(
        (m: any) => m.placement_kind === "third_place",
      );
      const ordered: string[] = [];
      if (final?.winner_team_id) {
        ordered.push(final.winner_team_id);
        const runner =
          final.team_a_id === final.winner_team_id
            ? final.team_b_id
            : final.team_a_id;
        if (runner) ordered.push(runner);
      }
      if (thirdPlace?.winner_team_id) {
        ordered.push(thirdPlace.winner_team_id);
        const fourth =
          thirdPlace.team_a_id === thirdPlace.winner_team_id
            ? thirdPlace.team_b_id
            : thirdPlace.team_a_id;
        if (fourth) ordered.push(fourth);
      }
      return {
        flight_id: f.id,
        flight_name: f.name,
        sort_order: f.sort_order,
        expected_size: Math.max(ordered.length, 2),
        ordered_team_ids: ordered,
      };
    });

    return { ranking: computeOverallStandings(flightInputs) };
  });
