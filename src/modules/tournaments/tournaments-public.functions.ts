import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPublicTournament = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, name, slug, sport, custom_sport_name, category, starts_on, ends_on, location, format, status, cover_image_url, num_teams, settings, published_programme_at, registration_fee, registration_currency, field_streams",
      )
      .eq("slug", data.slug)
      .in("status", ["published", "in_progress", "completed"])
      .maybeSingle();
    if (!t) return null;

    const [gRes, teamRes, mRes, eRes, dRes, fRes] = await Promise.all([
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
          "id, group_id, round, bracket_position, match_number, team_a_id, team_b_id, team_a_source, team_b_source, scheduled_at, field, status, score_a, score_b, penalty_score_a, penalty_score_b, overtime_score_a, overtime_score_b, sets, winner_team_id, details, flight_id, placement_kind",
        )
        .eq("tournament_id", t.id)
        .order("scheduled_at", { nullsFirst: false }),
      supabaseAdmin
        .from("tournament_match_events")
        .select("id, match_id, team_id, kind, player_name, minute, created_at")
        .eq("tournament_id", t.id)
        .order("created_at"),
      supabaseAdmin
        .from("tournament_documents")
        .select("id, kind, language, file_url, generated_at")
        .eq("tournament_id", t.id)
        .eq("kind", "rules")
        .order("generated_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("tournament_flights")
        .select("id, sort_order, name, short_name, color, enable_third_place")
        .eq("tournament_id", t.id)
        .order("sort_order"),
    ]);

    return {
      tournament: t,
      groups: gRes.data ?? [],
      teams: teamRes.data ?? [],
      matches: mRes.data ?? [],
      events: eRes.data ?? [],
      rulesDocument: dRes.data?.[0] ?? null,
      flights: fRes.data ?? [],
    };
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