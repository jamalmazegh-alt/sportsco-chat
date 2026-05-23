import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================
// Constants
// ============================================================
const CLUB_ROLES = [
  "admin",
  "coach",
  "assistant_coach",
  "staff",
  "tournament_manager",
] as const;
type ClubRole = (typeof CLUB_ROLES)[number];

const TOURNAMENT_ROLES = ["tournament_admin", "staff", "referee"] as const;
type TournamentRole = (typeof TOURNAMENT_ROLES)[number];

const rolesSchema = z
  .array(z.enum(CLUB_ROLES))
  .min(1, "At least one role required");

// ============================================================
// Helpers
// ============================================================
async function assertClubAdmin(
  supabase: any,
  clubId: string,
  callerId: string,
) {
  const { data, error } = await supabase
    .from("club_members")
    .select("roles")
    .eq("club_id", clubId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  if (!data || !Array.isArray(data.roles) || !data.roles.includes("admin")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

async function assertTournamentAdmin(
  supabaseAuth: any,
  tournamentId: string,
  callerId: string,
) {
  const { data, error } = await supabaseAuth.rpc(
    "can_manage_tournament_members",
    { _user_id: callerId, _tournament_id: tournamentId },
  );
  if (error) throw new Response(error.message, { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

async function logPermissionChange(args: {
  actorId: string | null;
  targetId: string | null;
  targetEmail: string | null;
  scope: "club" | "tournament";
  scopeId: string;
  oldRoles: string[] | null;
  newRoles: string[] | null;
  action: string;
  note?: string | null;
}) {
  await supabaseAdmin.from("permission_changes_log").insert({
    actor_id: args.actorId,
    target_id: args.targetId,
    target_email: args.targetEmail,
    scope: args.scope,
    scope_id: args.scopeId,
    old_roles: args.oldRoles,
    new_roles: args.newRoles,
    action: args.action,
    note: args.note ?? null,
  });
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const { data } = await (supabaseAdmin as any)
    .schema("auth")
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

// ============================================================
// 1) setClubMemberRoles
// ============================================================
export const setClubMemberRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { club_id: string; user_id: string; roles: ClubRole[] }) =>
      z
        .object({
          club_id: z.string().uuid(),
          user_id: z.string().uuid(),
          roles: rolesSchema,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClubAdmin(supabase, data.club_id, userId);

    // Enforce incompatible role pairs
    const INCOMPATIBLE: [string, string][] = [
      ["coach", "assistant_coach"],
      ["admin", "assistant_coach"],
      ["staff", "assistant_coach"],
    ];
    for (const [a, b] of INCOMPATIBLE) {
      if (data.roles.includes(a as any) && data.roles.includes(b as any)) {
        throw new Response(`Roles ${a} and ${b} are incompatible`, { status: 400 });
      }
    }

    // Prevent self-removing admin
    if (
      data.user_id === userId &&
      !data.roles.includes("admin")
    ) {
      throw new Response("You cannot remove your own admin role", {
        status: 400,
      });
    }

    // Read current roles
    const { data: current, error: curErr } = await supabaseAdmin
      .from("club_members")
      .select("roles")
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (curErr) throw new Response(curErr.message, { status: 500 });
    if (!current) throw new Response("Member not found", { status: 404 });

    const oldRoles: string[] = current.roles ?? [];

    // Prevent removing last admin
    if (oldRoles.includes("admin") && !data.roles.includes("admin")) {
      const { count } = await supabaseAdmin
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", data.club_id)
        .contains("roles", ["admin"]);
      if ((count ?? 0) <= 1) {
        throw new Response("Cannot remove the last admin of the club", {
          status: 400,
        });
      }
    }

    const { error: upErr } = await supabaseAdmin
      .from("club_members")
      .update({ roles: data.roles })
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id);
    if (upErr) throw new Response(upErr.message, { status: 500 });

    await logPermissionChange({
      actorId: userId,
      targetId: data.user_id,
      targetEmail: null,
      scope: "club",
      scopeId: data.club_id,
      oldRoles,
      newRoles: data.roles,
      action: "update_roles",
    });

    return { ok: true, roles: data.roles };
  });

// ============================================================
// 2) inviteClubMember
// ============================================================
export const inviteClubMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      club_id: string;
      email: string;
      first_name: string;
      last_name: string;
      roles: ClubRole[];
    }) =>
      z
        .object({
          club_id: z.string().uuid(),
          email: z.string().email().max(255),
          first_name: z.string().min(1).max(120),
          last_name: z.string().min(1).max(120),
          roles: rolesSchema,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClubAdmin(supabase, data.club_id, userId);

    const email = data.email.trim().toLowerCase();
    const existingUserId = await findAuthUserByEmail(email);

    if (existingUserId) {
      // Link directly
      const { data: existingRow } = await supabaseAdmin
        .from("club_members")
        .select("roles")
        .eq("club_id", data.club_id)
        .eq("user_id", existingUserId)
        .maybeSingle();

      if (existingRow) {
        const merged = Array.from(
          new Set([...(existingRow.roles ?? []), ...data.roles]),
        );
        const { error } = await supabaseAdmin
          .from("club_members")
          .update({ roles: merged })
          .eq("club_id", data.club_id)
          .eq("user_id", existingUserId);
        if (error) throw new Response(error.message, { status: 500 });

        await logPermissionChange({
          actorId: userId,
          targetId: existingUserId,
          targetEmail: email,
          scope: "club",
          scopeId: data.club_id,
          oldRoles: existingRow.roles ?? [],
          newRoles: merged,
          action: "merge_roles_existing_user",
        });
        return { ok: true, linked: true, user_id: existingUserId };
      } else {
        const { error } = await supabaseAdmin.from("club_members").insert({
          club_id: data.club_id,
          user_id: existingUserId,
          roles: data.roles,
          role: (data.roles.includes("admin")
            ? "admin"
            : data.roles.includes("coach")
              ? "coach"
              : "dirigeant") as any,
        });
        if (error) throw new Response(error.message, { status: 500 });

        await logPermissionChange({
          actorId: userId,
          targetId: existingUserId,
          targetEmail: email,
          scope: "club",
          scopeId: data.club_id,
          oldRoles: null,
          newRoles: data.roles,
          action: "add_existing_user",
        });
        return { ok: true, linked: true, user_id: existingUserId };
      }
    }

    // Create an invite (member_invites table) — email is handled client-side
    // via the existing player-invite template to keep parity with current UX.
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error: invErr } = await supabaseAdmin.from("member_invites").insert({
      club_id: data.club_id,
      // store the first staff-class role on legacy column (best effort)
      role: data.roles.includes("admin")
        ? "admin"
        : data.roles.includes("coach")
          ? "coach"
          : "dirigeant",
      email,
      first_name: data.first_name,
      last_name: data.last_name,
      token,
      created_by: userId,
    });
    if (invErr) throw new Response(invErr.message, { status: 500 });

    await logPermissionChange({
      actorId: userId,
      targetId: null,
      targetEmail: email,
      scope: "club",
      scopeId: data.club_id,
      oldRoles: null,
      newRoles: data.roles,
      action: "invite_new_user",
      note: `token=${token}`,
    });

    return { ok: true, linked: false, invite_token: token };
  });

// ============================================================
// 3) removeClubMember
// ============================================================
export const removeClubMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { club_id: string; user_id: string }) =>
    z
      .object({
        club_id: z.string().uuid(),
        user_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClubAdmin(supabase, data.club_id, userId);
    if (data.user_id === userId) {
      throw new Response("Cannot remove yourself", { status: 400 });
    }

    const { data: current } = await supabaseAdmin
      .from("club_members")
      .select("roles")
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!current) throw new Response("Not found", { status: 404 });

    if ((current.roles ?? []).includes("admin")) {
      const { count } = await supabaseAdmin
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", data.club_id)
        .contains("roles", ["admin"]);
      if ((count ?? 0) <= 1) {
        throw new Response("Cannot remove the last admin of the club", {
          status: 400,
        });
      }
    }

    const { error } = await supabaseAdmin
      .from("club_members")
      .delete()
      .eq("club_id", data.club_id)
      .eq("user_id", data.user_id);
    if (error) throw new Response(error.message, { status: 500 });

    await logPermissionChange({
      actorId: userId,
      targetId: data.user_id,
      targetEmail: null,
      scope: "club",
      scopeId: data.club_id,
      oldRoles: current.roles ?? [],
      newRoles: null,
      action: "remove_member",
    });

    return { ok: true };
  });

// ============================================================
// 4) inviteTournamentMember
// ============================================================
export const inviteTournamentMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tournament_id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: TournamentRole;
    }) =>
      z
        .object({
          tournament_id: z.string().uuid(),
          email: z.string().email().max(255),
          first_name: z.string().min(1).max(120),
          last_name: z.string().min(1).max(120),
          role: z.enum(TOURNAMENT_ROLES),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertTournamentAdmin(supabase, data.tournament_id, userId);

    const email = data.email.trim().toLowerCase();
    const existingUserId = await findAuthUserByEmail(email);

    const { data: inserted, error } = await supabaseAdmin
      .from("tournament_members")
      .insert({
        tournament_id: data.tournament_id,
        user_id: existingUserId,
        email,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        invited_by: userId,
        joined_at: existingUserId ? new Date().toISOString() : null,
      })
      .select("id, invite_token")
      .single();
    if (error) throw new Response(error.message, { status: 500 });

    const { data: tournament } = await supabaseAdmin
      .from("tournaments")
      .select("name, slug")
      .eq("id", data.tournament_id)
      .maybeSingle();

    await logPermissionChange({
      actorId: userId,
      targetId: existingUserId,
      targetEmail: email,
      scope: "tournament",
      scopeId: data.tournament_id,
      oldRoles: null,
      newRoles: [data.role],
      action: existingUserId ? "add_existing_user" : "invite_new_user",
      note: existingUserId ? null : `token=${inserted?.invite_token}`,
    });

    return {
      ok: true,
      member_id: inserted!.id,
      invite_token: inserted!.invite_token,
      linked: !!existingUserId,
      tournament_name: tournament?.name ?? null,
      tournament_slug: tournament?.slug ?? null,
    };
  });

// ============================================================
// 5) assignRefereeToMatch
// ============================================================
export const assignRefereeToMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tournament_id: string;
      member_id: string;
      match_id: string;
      remove?: boolean;
    }) =>
      z
        .object({
          tournament_id: z.string().uuid(),
          member_id: z.string().uuid(),
          match_id: z.string().uuid(),
          remove: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertTournamentAdmin(supabase, data.tournament_id, userId);

    const { data: member, error: mErr } = await supabaseAdmin
      .from("tournament_members")
      .select("id, role, assigned_match_ids, user_id, email, first_name, last_name")
      .eq("id", data.member_id)
      .eq("tournament_id", data.tournament_id)
      .maybeSingle();
    if (mErr) throw new Response(mErr.message, { status: 500 });
    if (!member) throw new Response("Member not found", { status: 404 });
    if (member.role !== "referee") {
      throw new Response("Only referees can be assigned to matches", {
        status: 400,
      });
    }

    const current: string[] = member.assigned_match_ids ?? [];
    const next = data.remove
      ? current.filter((id) => id !== data.match_id)
      : Array.from(new Set([...current, data.match_id]));

    const updates: any = { assigned_match_ids: next };
    const { error: upErr } = await supabaseAdmin
      .from("tournament_members")
      .update(updates)
      .eq("id", data.member_id);
    if (upErr) throw new Response(upErr.message, { status: 500 });

    // Also keep tournament_matches.referee_user_id in sync (single primary referee)
    if (member.user_id) {
      await supabaseAdmin
        .from("tournament_matches")
        .update({
          referee_user_id: data.remove ? null : member.user_id,
          referee_name: data.remove
            ? null
            : `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || member.email,
        })
        .eq("id", data.match_id)
        .eq("tournament_id", data.tournament_id);
    }

    await logPermissionChange({
      actorId: userId,
      targetId: member.user_id,
      targetEmail: member.email,
      scope: "tournament",
      scopeId: data.tournament_id,
      oldRoles: ["referee"],
      newRoles: ["referee"],
      action: data.remove ? "unassign_match" : "assign_match",
      note: `match=${data.match_id}`,
    });

    return { ok: true, assigned_match_ids: next };
  });

// ============================================================
// 6) removeTournamentMember
// ============================================================
export const removeTournamentMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tournament_id: string; member_id: string }) =>
      z
        .object({
          tournament_id: z.string().uuid(),
          member_id: z.string().uuid(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertTournamentAdmin(supabase, data.tournament_id, userId);

    const { data: member } = await supabaseAdmin
      .from("tournament_members")
      .select("id, role, user_id, email")
      .eq("id", data.member_id)
      .eq("tournament_id", data.tournament_id)
      .maybeSingle();
    if (!member) throw new Response("Not found", { status: 404 });

    if (member.role === "tournament_admin") {
      const { count } = await supabaseAdmin
        .from("tournament_members")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", data.tournament_id)
        .eq("role", "tournament_admin");
      if ((count ?? 0) <= 1) {
        throw new Response(
          "Cannot remove the last tournament admin",
          { status: 400 },
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("tournament_members")
      .delete()
      .eq("id", data.member_id);
    if (error) throw new Response(error.message, { status: 500 });

    await logPermissionChange({
      actorId: userId,
      targetId: member.user_id,
      targetEmail: member.email,
      scope: "tournament",
      scopeId: data.tournament_id,
      oldRoles: [member.role],
      newRoles: null,
      action: "remove_member",
    });

    return { ok: true };
  });

// ============================================================
// 7) acceptTournamentInvite — authenticated (token + current user)
// ============================================================
export const acceptTournamentInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: id, error } = await supabase.rpc(
      "accept_tournament_member_invite",
      { _token: data.token, _user_id: userId },
    );
    if (error) throw new Response(error.message, { status: 500 });
    if (!id) {
      throw new Response("Invalid or already-used invite", { status: 400 });
    }

    const { data: row } = await supabaseAdmin
      .from("tournament_members")
      .select("tournament_id, role, email")
      .eq("id", id)
      .single();

    if (row) {
      await logPermissionChange({
        actorId: userId,
        targetId: userId,
        targetEmail: row.email,
        scope: "tournament",
        scopeId: row.tournament_id,
        oldRoles: null,
        newRoles: [row.role],
        action: "accept_invite",
      });
    }

    return { ok: true, member_id: id, tournament_id: row?.tournament_id };
  });

// ============================================================
// List tournament members
// ============================================================
export const listTournamentMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertTournamentAdmin(supabase, data.tournament_id, userId);
    const { data: members, error } = await supabaseAdmin
      .from("tournament_members")
      .select(
        "id, user_id, email, first_name, last_name, role, assigned_match_ids, invited_at, joined_at, invite_token",
      )
      .eq("tournament_id", data.tournament_id)
      .order("invited_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return { members: members ?? [] };
  });

// ============================================================
// Last permission change (for a target user, in a scope)
// ============================================================
export const getLastPermissionChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { scope: "club" | "tournament"; scope_id: string; target_id: string }) =>
      z
        .object({
          scope: z.enum(["club", "tournament"]),
          scope_id: z.string().uuid(),
          target_id: z.string().uuid(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("permission_changes_log")
      .select("changed_at, actor_id, action, old_roles, new_roles")
      .eq("scope", data.scope)
      .eq("scope_id", data.scope_id)
      .eq("target_id", data.target_id)
      .order("changed_at", { ascending: false })
      .limit(1);
    if (error) return { last: null };
    return { last: rows?.[0] ?? null };
  });
