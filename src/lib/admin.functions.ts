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

    // Fetch emails directly from auth.users (scoped to club members only — O(N_club),
    // not O(N_platform)). Uses service role to bypass RLS on auth schema.
    const emailById = new Map<string, string | null>();
    const { data: authRows } = await (supabaseAdmin as any)
      .schema("auth")
      .from("users")
      .select("id, email")
      .in("id", ids);
    for (const u of authRows ?? []) emailById.set(u.id, u.email ?? null);

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

    const u = authUser.data.user as any;
    const bannedUntil: string | null = u?.banned_until ?? null;
    const isDisabled = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

    return {
      profile,
      email: u?.email ?? null,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      memberships: memberships ?? [],
      linkedPlayers: linkedPlayers ?? [],
      parentLinks: parentLinks ?? [],
      is_disabled: isDisabled,
      banned_until: bannedUntil,
    };
  });

/**
 * Helper: enforce caller is admin of the given club.
 */
async function assertCallerAdmin(
  supabase: any,
  clubId: string,
  callerId: string
) {
  const { data } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", callerId)
    .eq("role", "admin")
    .limit(1);
  if (!data || data.length === 0) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/**
 * Admin-only: disable or re-enable a user account (auth-level).
 */
export const setUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { club_id: string; user_id: string; disabled: boolean }) =>
      z
        .object({
          club_id: z.string().uuid(),
          user_id: z.string().uuid(),
          disabled: z.boolean(),
        })
        .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.user_id === userId) {
      throw new Response("Cannot disable your own account", { status: 400 });
    }
    await assertCallerAdmin(supabase, data.club_id, userId);

    // Confirm target shares the club
    const { data: target } = await supabaseAdmin
      .from("club_members")
      .select("user_id")
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id)
      .limit(1);
    if (!target || target.length === 0) {
      throw new Response("Not found", { status: 404 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { ban_duration: data.disabled ? "876000h" : "none" } as any
    );
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true, disabled: data.disabled };
  });

/**
 * Admin-only: remove a user from the caller's club (deletes all of their
 * club_members rows for that club). Does NOT delete the auth account.
 */
export const removeUserFromClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string; user_id: string }) =>
    z
      .object({ club_id: z.string().uuid(), user_id: z.string().uuid() })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.user_id === userId) {
      throw new Response("Cannot remove yourself", { status: 400 });
    }
    await assertCallerAdmin(supabase, data.club_id, userId);
    const { error } = await supabaseAdmin
      .from("club_members")
      .delete()
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

/**
 * Admin-only: trigger a password reset email for a user in the caller's club.
 */
export const sendUserPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string; user_id: string }) =>
    z
      .object({ club_id: z.string().uuid(), user_id: z.string().uuid() })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerAdmin(supabase, data.club_id, userId);
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const email = u.user?.email;
    if (!email) throw new Response("User has no email", { status: 400 });
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
