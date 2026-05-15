import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Admin-only: list all users that share at least one club with the caller,
 * AND where the caller is admin in that club. Includes auth email.
 */
export const listClubUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string }) =>
    z.object({ club_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin of this club (RLS-safe)
    const { data: meRows } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.club_id)
      .eq("user_id", userId)
      .eq("role", "admin")
      .limit(1);
    if (!meRows || meRows.length === 0) {
      throw new Response("Forbidden", { status: 403 });
    }

    // Fetch all members of the club
    const { data: members, error } = await supabaseAdmin
      .from("club_members")
      .select("user_id, role, created_at")
      .eq("club_id", data.club_id);
    if (error) throw error;

    const ids = Array.from(new Set((members ?? []).map((m) => m.user_id)));
    if (ids.length === 0) return { users: [] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, first_name, last_name, phone, avatar_url")
      .in("id", ids);
    const profById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    // Fetch emails via auth admin API (paginated)
    const emailById = new Map<string, string | null>();
    let page = 1;
    while (true) {
      const { data: list, error: lErr } =
        await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (lErr) break;
      for (const u of list.users ?? []) {
        if (ids.includes(u.id)) emailById.set(u.id, u.email ?? null);
      }
      if (!list.users || list.users.length < 1000) break;
      page += 1;
      if (page > 20) break;
    }

    const grouped = new Map<
      string,
      { user_id: string; roles: string[]; profile: any; email: string | null }
    >();
    for (const m of members ?? []) {
      const g =
        grouped.get(m.user_id) ?? {
          user_id: m.user_id,
          roles: [],
          profile: profById.get(m.user_id) ?? null,
          email: emailById.get(m.user_id) ?? null,
        };
      if (!g.roles.includes(m.role)) g.roles.push(m.role);
      grouped.set(m.user_id, g);
    }

    return {
      users: Array.from(grouped.values()).sort((a, b) =>
        (a.profile?.full_name ?? a.email ?? "").localeCompare(
          b.profile?.full_name ?? b.email ?? ""
        )
      ),
    };
  });

/**
 * Admin-only: full detail for one user in the caller's club, including email.
 */
export const getClubUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string; user_id: string }) =>
    z
      .object({ club_id: z.string().uuid(), user_id: z.string().uuid() })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: meRows } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.club_id)
      .eq("user_id", userId)
      .eq("role", "admin")
      .limit(1);
    if (!meRows || meRows.length === 0) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { data: targetMembership } = await supabaseAdmin
      .from("club_members")
      .select("user_id")
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id)
      .limit(1);
    if (!targetMembership || targetMembership.length === 0) {
      throw new Response("Not found", { status: 404 });
    }

    const [{ data: profile }, { data: memberships }, { data: linkedPlayers }, { data: parentLinks }, authUser] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, first_name, last_name, phone, created_at, avatar_url, phone_verified_at")
          .eq("id", data.user_id)
          .maybeSingle(),
        supabaseAdmin
          .from("club_members")
          .select("club_id, role, created_at, clubs:club_id(name)")
          .eq("user_id", data.user_id),
        supabaseAdmin
          .from("players")
          .select("id, first_name, last_name, club_id")
          .eq("user_id", data.user_id),
        supabaseAdmin
          .from("player_parents")
          .select("id, player_id, players:player_id(id, first_name, last_name, club_id)")
          .eq("parent_user_id", data.user_id),
        supabaseAdmin.auth.admin.getUserById(data.user_id),
      ]);

    return {
      profile,
      email: authUser.data.user?.email ?? null,
      last_sign_in_at: authUser.data.user?.last_sign_in_at ?? null,
      memberships: memberships ?? [],
      linkedPlayers: linkedPlayers ?? [],
      parentLinks: parentLinks ?? [],
    };
  });
