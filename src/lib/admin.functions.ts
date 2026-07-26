import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  mergeClubUsersList,
  type ClubUserListItem,
  type ClubUserProfile,
} from "@/lib/admin-club-users";

/**
 * Admin-only: list users of the club for the admin users page.
 * Sources: club_members (real roles) ∪ parents linked via player_parents
 * (even without a club_members row — lazy link_parent_memberships).
 */
export const listClubUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string }) =>
    z.object({ club_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ users: ClubUserListItem[] }> => {
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

    // Use the caller's JWT client (same Supabase project as the browser).
    // supabaseAdmin may target a different env in local dev and would return [].
    const { data: members, error } = await supabase
      .from("club_members")
      .select("user_id, role, roles, created_at")
      .eq("club_id", data.club_id);
    if (error) throw error;

    // Parents attached via player_parents but possibly missing club_members.
    // Scoped via supabaseAdmin after admin gate — JWT can usually read these
    // (admin policy on player_parents), but service-role avoids RLS edge cases
    // without widening beyond the already-authorized club_id.
    const { data: parentRows, error: parentErr } = await supabaseAdmin
      .from("player_parents")
      .select("parent_user_id, players!inner(club_id)")
      .eq("players.club_id", data.club_id)
      .not("parent_user_id", "is", null);
    if (parentErr) throw parentErr;

    const parentUserIds = Array.from(
      new Set(
        (parentRows ?? [])
          .map((r) => r.parent_user_id as string | null)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );

    const ids = Array.from(
      new Set([...(members ?? []).map((m) => m.user_id as string), ...parentUserIds]),
    );
    if (ids.length === 0) return { users: [] };

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, phone, avatar_url")
      .in("id", ids);
    const profById = new Map<string, ClubUserProfile | null>(
      (profiles ?? []).map((p) => [
        p.id as string,
        {
          id: p.id as string,
          full_name: (p.full_name as string | null) ?? null,
          first_name: (p.first_name as string | null) ?? null,
          last_name: (p.last_name as string | null) ?? null,
          phone: (p.phone as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        },
      ]),
    );

    const emailById = new Map<string, string | null>();
    try {
      const { data: authRows } = await (supabaseAdmin as any)
        .schema("auth")
        .from("users")
        .select("id, email")
        .in("id", ids);
      for (const u of authRows ?? []) emailById.set(u.id as string, (u.email as string) ?? null);
    } catch {
      // Emails optional when service-role client is misconfigured
    }

    return {
      users: mergeClubUsersList({
        members: members ?? [],
        parentUserIds,
        profilesById: profById,
        emailsById: emailById,
      }),
    };
  });

/**
 * Admin-only: full detail for one user in the caller's club, including email.
 */
export const getClubUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string; user_id: string }) =>
    z.object({ club_id: z.string().uuid(), user_id: z.string().uuid() }).parse(input),
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

    const { data: targetMembership } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id)
      .limit(1);
    const isClubMember = !!(targetMembership && targetMembership.length > 0);

    // Also accept parents linked via player_parents to a player of this club
    // (no club_members row yet — lazy membership).
    if (!isClubMember) {
      const { data: parentLink, error: linkErr } = await supabaseAdmin
        .from("player_parents")
        .select("id, players!inner(club_id)")
        .eq("parent_user_id", data.user_id)
        .eq("players.club_id", data.club_id)
        .limit(1);
      if (linkErr) throw new Response(linkErr.message, { status: 500 });
      if (!parentLink || parentLink.length === 0) {
        throw new Response("Not found", { status: 404 });
      }
    }

    const [
      { data: profile },
      { data: memberships },
      { data: linkedPlayers },
      { data: parentLinks },
      authUser,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, first_name, last_name, phone, created_at, avatar_url, phone_verified_at",
        )
        .eq("id", data.user_id)
        .maybeSingle(),
      supabase
        .from("club_members")
        .select("club_id, role, roles, created_at, clubs:club_id(name)")
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

    const u = authUser.data.user as {
      email?: string | null;
      last_sign_in_at?: string | null;
      banned_until?: string | null;
    } | null;
    const bannedUntil: string | null = u?.banned_until ?? null;
    const isDisabled = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

    return {
      profile,
      email: u?.email ?? null,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      memberships: (memberships ?? []).map(
        (m: {
          club_id: string;
          role?: string | null;
          roles?: string[] | null;
          created_at?: string | null;
          clubs?: { name?: string | null } | null;
        }) => ({
          ...m,
          roles: Array.isArray(m.roles) && m.roles.length > 0 ? m.roles : m.role ? [m.role] : [],
        }),
      ),
      linkedPlayers: linkedPlayers ?? [],
      parentLinks: parentLinks ?? [],
      isClubMember,
      is_disabled: isDisabled,
      banned_until: bannedUntil,
    };
  });

/**
 * Helper: enforce caller is admin of the given club.
 */
async function assertCallerAdmin(supabase: any, clubId: string, callerId: string) {
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
  .inputValidator((input: { club_id: string; user_id: string; disabled: boolean }) =>
    z
      .object({
        club_id: z.string().uuid(),
        user_id: z.string().uuid(),
        disabled: z.boolean(),
      })
      .parse(input),
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

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.disabled ? "876000h" : "none",
    } as any);
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
    z.object({ club_id: z.string().uuid(), user_id: z.string().uuid() }).parse(input),
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
    z.object({ club_id: z.string().uuid(), user_id: z.string().uuid() }).parse(input),
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

/**
 * Admin-only: set the staff roles (admin / coach) of a user inside the
 * caller's club. Passing both = user has both roles. At least one role must
 * remain so the user keeps a club_members row (use removeUserFromClub
 * otherwise). Player / parent / dirigeant rows are left untouched.
 */
export const setUserClubStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { club_id: string; user_id: string; is_admin: boolean; is_coach: boolean }) =>
      z
        .object({
          club_id: z.string().uuid(),
          user_id: z.string().uuid(),
          is_admin: z.boolean(),
          is_coach: z.boolean(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerAdmin(supabase, data.club_id, userId);

    if (!data.is_admin && !data.is_coach) {
      throw new Response("At least one staff role required", { status: 400 });
    }
    // Prevent an admin from demoting themselves accidentally
    if (data.user_id === userId && !data.is_admin) {
      throw new Response("You cannot remove your own admin role", { status: 400 });
    }

    const desired: ("admin" | "coach")[] = [];
    if (data.is_admin) desired.push("admin");
    if (data.is_coach) desired.push("coach");

    // Delete staff rows that are no longer desired
    const { error: delErr } = await supabaseAdmin
      .from("club_members")
      .delete()
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id)
      .in("role", ["admin", "coach"])
      .not("role", "in", `(${desired.join(",")})`);
    if (delErr) throw new Response(delErr.message, { status: 500 });

    // Upsert desired roles
    const rows = desired.map((role) => ({
      club_id: data.club_id,
      user_id: data.user_id,
      role,
    }));
    if (rows.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("club_members")
        .upsert(rows, { onConflict: "club_id,user_id,role", ignoreDuplicates: true });
      if (upErr) throw new Response(upErr.message, { status: 500 });
    }
    return { ok: true, roles: desired };
  });
