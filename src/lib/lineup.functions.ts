import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SlotSchema = z.object({
  id: z.string().min(1).max(20),
  role: z.enum(["GK", "DEF", "MID", "FWD"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  player_id: z.string().uuid().nullable(),
});

const UpsertSchema = z.object({
  eventId: z.string().uuid(),
  formation: z.string().min(1).max(20),
  slots: z.array(SlotSchema).max(11),
  bench: z.array(z.string().uuid()).max(20),
  captain_player_id: z.string().uuid().nullable().optional(),
  gk_player_id: z.string().uuid().nullable().optional(),
  visibility: z.enum(["draft", "staff", "selected_players", "team"]),
  include_in_convocation: z.boolean(),
  publish: z.boolean().optional(),
});

export const getLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string }) =>
    z.object({ eventId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lineup, error } = await supabase
      .from("event_lineups")
      .select("*")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { lineup };
  });

export const upsertLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load event → team_id, club_id (via team)
    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("id, team_id, teams:team_id(club_id, sport)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!event) throw new Error("Event not found");
    const team = (event as any).teams;
    if (!team) throw new Error("Team not found");
    if (team.sport !== "football") throw new Error("Lineup only available for football");

    const payload = {
      event_id: data.eventId,
      team_id: event.team_id,
      club_id: team.club_id,
      formation: data.formation,
      slots: data.slots,
      bench: data.bench,
      captain_player_id: data.captain_player_id ?? null,
      gk_player_id: data.gk_player_id ?? null,
      visibility: data.visibility,
      include_in_convocation: data.include_in_convocation,
      published_at: data.publish ? new Date().toISOString() : undefined,
      created_by: userId,
    };

    // Strip undefined so upsert keeps existing published_at when not publishing
    const clean = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    const { data: row, error } = await supabase
      .from("event_lineups")
      .upsert(clean, { onConflict: "event_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { lineup: row };
  });

export const unpublishLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string }) =>
    z.object({ eventId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("event_lineups")
      .update({ published_at: null, visibility: "draft" })
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
