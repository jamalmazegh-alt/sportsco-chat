/**
 * Server functions for team_championships (per-team named championships).
 *
 * All authorization is enforced by RLS on the table (see migration
 * team_championships policies) — the queries here rely on the user's bearer
 * token via requireSupabaseAuth.
 *
 * Client MUST NEVER send `club_id`: the DB trigger
 * team_championships_enforce_club_team overrides it from teams.club_id.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const NameSchema = z.string().trim().min(1, "name-required").max(120, "name-too-long");

const SeasonSchema = z.string().trim().max(60).nullable().optional();

export const listTeamChampionships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ teamId: uuid, includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("team_championships" as never)
      .select("id, team_id, club_id, name, season_label, is_active, created_at, updated_at")
      .eq("team_id", data.teamId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (!data.includeArchived) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      team_id: string;
      club_id: string;
      name: string;
      season_label: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>;
  });

export const createTeamChampionship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ teamId: uuid, name: NameSchema, seasonLabel: SeasonSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // We intentionally do NOT send club_id — the DB trigger derives it from
    // teams.club_id and rejects any mismatch/forgery.
    const { data: row, error } = await supabase
      .from("team_championships" as never)
      .insert({
        team_id: data.teamId,
        club_id: "00000000-0000-0000-0000-000000000000", // overridden by trigger
        name: data.name,
        season_label: data.seasonLabel?.trim() ? data.seasonLabel.trim() : null,
        is_active: true,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("duplicate");
      throw new Error(error.message);
    }
    return { id: (row as { id: string }).id };
  });

export const updateTeamChampionship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        name: NameSchema.optional(),
        seasonLabel: SeasonSchema,
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.seasonLabel !== undefined) {
      patch.season_label = data.seasonLabel?.trim() ? data.seasonLabel.trim() : null;
    }
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase
      .from("team_championships" as never)
      .update(patch as never)
      .eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("duplicate");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTeamChampionship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("team_championships" as never)
      .delete()
      .eq("id", data.id);
    if (error) {
      // Trigger raises 'championship_in_use' when referenced by any event
      if (error.message?.includes("championship_in_use")) {
        throw new Error("championship_in_use");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });
