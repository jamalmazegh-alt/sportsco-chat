import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * LOT 0 — Groupes personnalisés du club & resolver d'audience.
 *
 * Toutes les server fns sont staff-only côté RLS. Le membre standard
 * n'a AUCUN accès en lecture aux tables `club_groups` et `club_group_members`
 * (invariant 3 : composition des groupes staff-only).
 */

// ---- Audience spec (partagée avec Lot 1) ---------------------------------

export const AudienceSelectorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("team_players"), team_id: z.string().uuid() }),
  z.object({ type: z.literal("team_parents"), team_id: z.string().uuid() }),
  z.object({ type: z.literal("team_educators"), team_id: z.string().uuid() }),
  z.object({ type: z.literal("category_educators"), category: z.string().min(1).max(60) }),
  z.object({ type: z.literal("club_educators") }),
  z.object({ type: z.literal("club_staff") }),
  z.object({ type: z.literal("club_members") }),
  z.object({ type: z.literal("convoked_players"), event_id: z.string().uuid() }),
  z.object({ type: z.literal("convoked_parents"), event_id: z.string().uuid() }),
  z.object({ type: z.literal("club_group"), group_id: z.string().uuid() }),
  z.object({
    type: z.literal("selected_members"),
    user_ids: z.array(z.string().uuid()).max(500),
  }),
]);

export type AudienceSelector = z.infer<typeof AudienceSelectorSchema>;
export const AudienceSpecSchema = z.array(AudienceSelectorSchema).max(50);

// ---- List club groups -----------------------------------------------------

export const listClubGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ club_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: groups, error } = await supabase
      .from("club_groups")
      .select("id, name, description, is_active, created_at, updated_at, created_by")
      .eq("club_id", data.club_id)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (groups ?? []).map((g) => g.id);
    if (ids.length === 0) return { groups: [], counts: {} as Record<string, number> };

    const { data: rows } = await supabase
      .from("club_group_members")
      .select("group_id")
      .in("group_id", ids);
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) counts[r.group_id] = (counts[r.group_id] ?? 0) + 1;

    return { groups: groups ?? [], counts };
  });

// ---- Create / update / delete --------------------------------------------

export const createClubGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        club_id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("club_groups")
      .insert({
        club_id: data.club_id,
        name: data.name,
        description: data.description ?? null,
        created_by: userId,
      })
      .select("id, name, description, is_active, created_at, updated_at, created_by")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateClubGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(2000).nullish(),
        is_active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      name?: string;
      description?: string | null;
      is_active?: boolean;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    const { data: row, error } = await supabase
      .from("club_groups")
      .update(patch)
      .eq("id", data.id)
      .select("id, name, description, is_active, created_at, updated_at, created_by")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteClubGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("club_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Members -------------------------------------------------------------

export const listClubGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ group_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("club_group_members")
      .select("id, member_id, created_at")
      .eq("group_id", data.group_id);
    if (error) throw new Error(error.message);

    const memberIds = (rows ?? []).map((r) => r.member_id);
    if (memberIds.length === 0) return { members: [] };

    const { data: members } = await supabase
      .from("club_members")
      .select("id, user_id, role, roles")
      .in("id", memberIds);
    const memberById = new Map((members ?? []).map((m) => [m.id, m]));

    const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean);
    const { data: profiles } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, avatar_url")
          .in("id", userIds)
      : { data: [] as { id: string }[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const enriched = (rows ?? []).map((r) => {
      const m = memberById.get(r.member_id);
      const p = m ? profileById.get(m.user_id) : undefined;
      return {
        id: r.id,
        member_id: r.member_id,
        user_id: m?.user_id ?? null,
        role: m?.role ?? null,
        roles: m?.roles ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profile: (p as any) ?? null,
        created_at: r.created_at,
      };
    });

    return { members: enriched };
  });

export const addClubGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        group_id: z.string().uuid(),
        member_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("club_group_members")
      .insert({
        group_id: data.group_id,
        member_id: data.member_id,
        added_by: userId,
      })
      .select("id, member_id, created_at")
      .single();
    if (error) {
      // 23505 = unique_violation → already a member, idempotent
      if (error.code === "23505") return null;
      throw new Error(error.message);
    }
    return row;
  });

export const removeClubGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        group_id: z.string().uuid(),
        member_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("club_group_members")
      .delete()
      .eq("group_id", data.group_id)
      .eq("member_id", data.member_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Audience resolver preview -------------------------------------------

/**
 * Aperçu chiffré du nombre de destinataires uniques pour une spec d'audience.
 * Utilisé par le wizard Lot 1 ; exposé staff-only via la garde RLS
 * (le resolver refuse silencieusement les IDs hors du club).
 */
export const previewAudienceCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        club_id: z.string().uuid(),
        spec: AudienceSpecSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Vérifie que l'appelant est staff du club (défense en profondeur).
    const { data: staff, error: staffErr } = await supabase.rpc("is_club_staff", {
      _user_id: context.userId,
      _club_id: data.club_id,
    });
    if (staffErr) throw new Error(staffErr.message);
    if (!staff) throw new Error("forbidden");

    const { data: rows, error } = await supabase.rpc("resolve_audience_members", {
      _club_id: data.club_id,
      _spec: data.spec,
    });
    if (error) throw new Error(error.message);
    // rows = [{ user_id }]
    const list = (rows ?? []) as Array<{ user_id: string }>;
    return { count: list.length, user_ids: list.map((r) => r.user_id) };
  });
