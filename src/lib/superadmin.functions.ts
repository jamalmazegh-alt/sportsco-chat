import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server-side guard: throws 403 unless the caller is a registered super admin.
 * Every super admin server function MUST start with this check.
 */
async function assertSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/** Best-effort audit logger. Never throws to the caller. */
async function logAction(opts: {
  actor: string;
  action: string;
  target_type?: string;
  target_id?: string;
  club_id?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("superadmin_audit_logs").insert({
      actor_user_id: opts.actor,
      action: opts.action,
      target_type: opts.target_type ?? null,
      target_id: opts.target_id ?? null,
      club_id: opts.club_id ?? null,
      metadata: (opts.metadata ?? null) as never,
    });
  } catch (err) {
    console.error("[superadmin] audit log failed", err);
  }
}

/** Returns whether the caller is a super admin. Safe to call from any user. */
export const checkSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("super_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { isSuperAdmin: !!data };
  });

/** Global platform counters for the dashboard. */
export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    // Use user-scoped client so auth.uid() is available inside the SECURITY DEFINER RPC
    const { data, error } = await context.supabase.rpc("get_platform_stats");
    if (error) throw new Error(error.message);
    return { stats: (data ?? {}) as Record<string, number | string> };
  });

/** Paginated list of clubs with subscription + owner info. */
export const listAllClubs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let query = supabaseAdmin
      .from("clubs")
      .select("id, name, created_at, created_by, logo_url, archived_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.search) {
      query = query.ilike("name", `%${data.search}%`);
    }

    const { data: clubs, error, count } = await query;
    if (error) throw new Error(error.message);

    const clubIds = (clubs ?? []).map((c) => c.id);

    // Subscriptions
    const { data: subs } = clubIds.length
      ? await supabaseAdmin
          .from("subscriptions")
          .select(
            "club_id, status, plan, trial_end, current_period_end, cancel_at_period_end",
          )
          .in("club_id", clubIds)
      : { data: [] as never[] };

    // Member counts
    const { data: members } = clubIds.length
      ? await supabaseAdmin
          .from("club_members")
          .select("club_id")
          .in("club_id", clubIds)
      : { data: [] as never[] };

    const subByClub = new Map((subs ?? []).map((s) => [s.club_id, s]));
    const memberCounts = new Map<string, number>();
    (members ?? []).forEach((m) => {
      memberCounts.set(m.club_id, (memberCounts.get(m.club_id) ?? 0) + 1);
    });

    return {
      total: count ?? 0,
      items: (clubs ?? []).map((c) => ({
        ...c,
        subscription: subByClub.get(c.id) ?? null,
        member_count: memberCounts.get(c.id) ?? 0,
      })),
    };
  });

/** Detailed view for one club. */
export const getClubDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ club_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    await logAction({
      actor: context.userId,
      action: "view_club",
      target_type: "club",
      target_id: data.club_id,
      club_id: data.club_id,
    });

    const [{ data: club }, { data: sub }, { data: members }, { data: teams }] =
      await Promise.all([
        supabaseAdmin.from("clubs").select("*").eq("id", data.club_id).single(),
        supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("club_id", data.club_id)
          .maybeSingle(),
        supabaseAdmin
          .from("club_members")
          .select("user_id, role, created_at")
          .eq("club_id", data.club_id),
        supabaseAdmin
          .from("teams")
          .select("id, name, sport, created_at, deleted_at")
          .eq("club_id", data.club_id),
      ]);

    const userIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, first_name, last_name, phone")
          .in("id", userIds)
      : { data: [] as never[] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return {
      club,
      subscription: sub,
      teams: teams ?? [],
      members: (members ?? []).map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) ?? null,
      })),
    };
  });

/** Global user search by email/name/phone. */
export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(50).default(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let q = supabaseAdmin
      .from("profiles")
      .select("id, full_name, first_name, last_name, phone, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(
        `full_name.ilike.${s},first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s}`,
      );
    }

    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    return { items: profiles ?? [] };
  });

/** Recent audit entries for the activity feed. */
export const listSuperadminLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error, count } = await supabaseAdmin
      .from("superadmin_audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { total: count ?? 0, items: rows ?? [] };
  });

/** Subscriptions list for the Billing tab. */
export const listSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z
          .enum(["trialing", "active", "past_due", "canceled", "incomplete"])
          .optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let q = supabaseAdmin
      .from("subscriptions")
      .select(
        "id, club_id, status, plan, trial_end, current_period_end, cancel_at_period_end, canceled_at, stripe_customer_id, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(data.limit);

    if (data.status) q = q.eq("status", data.status);

    const { data: subs, error } = await q;
    if (error) throw new Error(error.message);

    const clubIds = Array.from(new Set((subs ?? []).map((s) => s.club_id)));
    const { data: clubs } = clubIds.length
      ? await supabaseAdmin
          .from("clubs")
          .select("id, name")
          .in("id", clubIds)
      : { data: [] as never[] };
    const nameById = new Map((clubs ?? []).map((c) => [c.id, c.name]));

    return {
      items: (subs ?? []).map((s) => ({
        ...s,
        club_name: nameById.get(s.club_id) ?? "—",
      })),
    };
  });

/** Disable (ban) a user via the Supabase Admin API. */
export const disableUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("You cannot disable your own account.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { ban_duration: "876000h" },
    );
    if (error) throw new Error(error.message);
    await logAction({
      actor: context.userId,
      action: "disable_user",
      target_type: "user",
      target_id: data.user_id,
      metadata: data.reason ? { reason: data.reason } : undefined,
    });
    return { ok: true };
  });

/** Reactivate (unban) a previously disabled user. */
export const reactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { ban_duration: "none" },
    );
    if (error) throw new Error(error.message);
    await logAction({
      actor: context.userId,
      action: "reactivate_user",
      target_type: "user",
      target_id: data.user_id,
    });
    return { ok: true };
  });

/** Generate a password reset link for a user. Returns the link to the super admin. */
export const generatePasswordResetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: u, error: ue } =
      await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (ue || !u?.user?.email) {
      throw new Error("User has no email on file.");
    }
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);
    await logAction({
      actor: context.userId,
      action: "generate_password_reset",
      target_type: "user",
      target_id: data.user_id,
      metadata: { email: u.user.email },
    });
    return {
      email: u.user.email,
      action_link: link.properties?.action_link ?? null,
    };
  });

/** Archive (soft-delete) a club — hides it from members. */
export const archiveClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        club_id: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("clubs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.club_id);
    if (error) throw new Error(error.message);
    await logAction({
      actor: context.userId,
      action: "archive_club",
      target_type: "club",
      target_id: data.club_id,
      club_id: data.club_id,
      metadata: data.reason ? { reason: data.reason } : undefined,
    });
    return { ok: true };
  });

/** Restore an archived club. */
export const unarchiveClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ club_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("clubs")
      .update({ archived_at: null })
      .eq("id", data.club_id);
    if (error) throw new Error(error.message);
    await logAction({
      actor: context.userId,
      action: "unarchive_club",
      target_type: "club",
      target_id: data.club_id,
      club_id: data.club_id,
    });
    return { ok: true };
  });

/** Lightweight auth-level status for a user (banned/email confirmed). */
export const getUserAuthStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(
      data.user_id,
    );
    if (error) throw new Error(error.message);
    const banned_until =
      (u?.user as { banned_until?: string | null } | null)?.banned_until ?? null;
    return {
      email: u?.user?.email ?? null,
      banned_until,
      is_banned: banned_until
        ? new Date(banned_until).getTime() > Date.now()
        : false,
      last_sign_in_at: u?.user?.last_sign_in_at ?? null,
      created_at: u?.user?.created_at ?? null,
    };
  });

/** Aggregate support snapshot for a user — clubs, teams, players linked. */
export const getUserSupportSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    await logAction({
      actor: context.userId,
      action: "view_user_support_summary",
      target_type: "user",
      target_id: data.user_id,
    });

    const [{ data: profile }, { data: memberships }, { data: teamRoles }, { data: playerSelf }, { data: parentLinks }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, first_name, last_name, phone, preferred_language, created_at")
          .eq("id", data.user_id)
          .maybeSingle(),
        supabaseAdmin
          .from("club_members")
          .select("club_id, role, created_at")
          .eq("user_id", data.user_id),
        supabaseAdmin
          .from("team_members")
          .select("team_id, role, player_id")
          .eq("user_id", data.user_id),
        supabaseAdmin
          .from("players")
          .select("id, first_name, last_name, club_id")
          .eq("user_id", data.user_id),
        supabaseAdmin
          .from("player_parents")
          .select("player_id, can_respond")
          .eq("parent_user_id", data.user_id),
      ]);

    const clubIds = Array.from(new Set((memberships ?? []).map((m) => m.club_id)));
    const { data: clubs } = clubIds.length
      ? await supabaseAdmin
          .from("clubs")
          .select("id, name, archived_at")
          .in("id", clubIds)
      : { data: [] as never[] };
    const clubMap = new Map((clubs ?? []).map((c) => [c.id, c]));

    return {
      profile: profile ?? null,
      clubs: (memberships ?? []).map((m) => ({
        ...m,
        club: clubMap.get(m.club_id) ?? null,
      })),
      team_roles: teamRoles ?? [],
      player_profiles: playerSelf ?? [],
      parent_of: parentLinks ?? [],
    };
  });

/**
 * Generate a one-time magic sign-in link as the target user (impersonation).
 * The super admin opens this link in a private window to access the user's
 * account for support purposes. A reason is REQUIRED and recorded in the audit log.
 */
export const generateImpersonationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        reason: z.string().trim().min(10).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("You cannot impersonate yourself.");
    }
    // Block impersonation of other super admins
    const { data: targetSuper } = await supabaseAdmin
      .from("super_admins")
      .select("user_id")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (targetSuper) {
      throw new Error("Cannot impersonate another super admin.");
    }

    const { data: u, error: ue } =
      await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (ue || !u?.user?.email) {
      throw new Error("Target user has no email on file.");
    }

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);

    await logAction({
      actor: context.userId,
      action: "impersonate_user",
      target_type: "user",
      target_id: data.user_id,
      metadata: { reason: data.reason, email: u.user.email },
    });

    return {
      email: u.user.email,
      action_link: link.properties?.action_link ?? null,
      expires_in_seconds: 3600,
    };
  });

/** Support snapshot for a club — admins, recent events, subscription. */
export const getClubSupportSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ club_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    await logAction({
      actor: context.userId,
      action: "view_club_support_summary",
      target_type: "club",
      target_id: data.club_id,
      club_id: data.club_id,
    });

    const [{ data: club }, { data: sub }, { data: admins }, { data: recentEvents }] =
      await Promise.all([
        supabaseAdmin
          .from("clubs")
          .select("id, name, created_at, created_by, archived_at, logo_url")
          .eq("id", data.club_id)
          .maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("status, plan, trial_end, current_period_end, cancel_at_period_end, stripe_customer_id")
          .eq("club_id", data.club_id)
          .maybeSingle(),
        supabaseAdmin
          .from("club_members")
          .select("user_id, role, created_at")
          .eq("club_id", data.club_id)
          .in("role", ["admin", "dirigeant"]),
        supabaseAdmin
          .from("events")
          .select("id, title, type, starts_at, team_id, deleted_at")
          .in(
            "team_id",
            (
              await supabaseAdmin
                .from("teams")
                .select("id")
                .eq("club_id", data.club_id)
            ).data?.map((t) => t.id) ?? [],
          )
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    const adminIds = (admins ?? []).map((a) => a.user_id);
    const { data: adminProfiles } = adminIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", adminIds)
      : { data: [] as never[] };
    const pMap = new Map((adminProfiles ?? []).map((p) => [p.id, p]));

    return {
      club,
      subscription: sub,
      admins: (admins ?? []).map((a) => ({
        ...a,
        profile: pMap.get(a.user_id) ?? null,
      })),
      recent_events: recentEvents ?? [],
    };
  });

// ============================================================================
// Phase 5: rich operational endpoints
// ============================================================================

/** Rich user list: profile + email + last sign-in + clubs + roles + subscriptions. */
export const listAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        page: z.number().int().min(1).max(50).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    // Pull a page of auth users (we need email + last_sign_in_at + banned_until).
    const { data: authPage, error: authErr } =
      await supabaseAdmin.auth.admin.listUsers({
        page: data.page,
        perPage: data.limit,
      });
    if (authErr) throw new Error(authErr.message);
    const authUsers = authPage?.users ?? [];

    let candidateIds = authUsers.map((u) => u.id);

    // Optional search: filter via profiles (name/phone) OR auth email match.
    if (data.search) {
      const s = `%${data.search}%`;
      const { data: matches } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(
          `full_name.ilike.${s},first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s}`,
        )
        .limit(200);
      const matchIds = new Set((matches ?? []).map((m) => m.id));
      const emailMatch = data.search.toLowerCase();
      candidateIds = authUsers
        .filter(
          (u) =>
            matchIds.has(u.id) ||
            (u.email ?? "").toLowerCase().includes(emailMatch),
        )
        .map((u) => u.id);
    }

    if (candidateIds.length === 0) {
      return { items: [], total: authPage?.total ?? 0, page: data.page };
    }

    const [{ data: profiles }, { data: memberships }, { data: teamMembers }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select(
            "id, full_name, first_name, last_name, phone, avatar_url, preferred_language, created_at",
          )
          .in("id", candidateIds),
        supabaseAdmin
          .from("club_members")
          .select("user_id, club_id, role")
          .in("user_id", candidateIds),
        supabaseAdmin
          .from("team_members")
          .select("user_id, team_id, role")
          .in("user_id", candidateIds),
      ]);

    const clubIds = Array.from(
      new Set((memberships ?? []).map((m) => m.club_id)),
    );
    const teamIds = Array.from(
      new Set((teamMembers ?? []).map((m) => m.team_id)),
    );

    const [{ data: clubs }, { data: teams }, { data: subs }] = await Promise.all([
      clubIds.length
        ? supabaseAdmin
            .from("clubs")
            .select("id, name, logo_url, archived_at")
            .in("id", clubIds)
        : Promise.resolve({ data: [] as never[] }),
      teamIds.length
        ? supabaseAdmin
            .from("teams")
            .select("id, name, club_id")
            .in("id", teamIds)
        : Promise.resolve({ data: [] as never[] }),
      clubIds.length
        ? supabaseAdmin
            .from("subscriptions")
            .select("club_id, status, plan, trial_end, current_period_end")
            .in("club_id", clubIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const clubMap = new Map((clubs ?? []).map((c) => [c.id, c]));
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const subByClub = new Map((subs ?? []).map((s) => [s.club_id, s]));

    const membershipsByUser = new Map<
      string,
      Array<{ club_id: string; role: string }>
    >();
    (memberships ?? []).forEach((m) => {
      const arr = membershipsByUser.get(m.user_id) ?? [];
      arr.push({ club_id: m.club_id, role: m.role });
      membershipsByUser.set(m.user_id, arr);
    });
    const teamsByUser = new Map<string, Array<{ team_id: string; role: string }>>();
    (teamMembers ?? []).forEach((tm) => {
      if (!tm.user_id) return;
      const arr = teamsByUser.get(tm.user_id) ?? [];
      arr.push({ team_id: tm.team_id, role: tm.role });
      teamsByUser.set(tm.user_id, arr);
    });

    const items = authUsers
      .filter((u) => candidateIds.includes(u.id))
      .map((u) => {
        const profile = profileMap.get(u.id) ?? null;
        const memberRows = membershipsByUser.get(u.id) ?? [];
        const teamRows = teamsByUser.get(u.id) ?? [];
        const clubsForUser = memberRows.map((m) => ({
          club_id: m.club_id,
          role: m.role,
          name: clubMap.get(m.club_id)?.name ?? null,
          logo_url: clubMap.get(m.club_id)?.logo_url ?? null,
          subscription_status:
            subByClub.get(m.club_id)?.status ?? null,
        }));
        const teamsForUser = teamRows.map((t) => ({
          team_id: t.team_id,
          role: t.role,
          name: teamMap.get(t.team_id)?.name ?? null,
          club_id: teamMap.get(t.team_id)?.club_id ?? null,
        }));
        const banned_until =
          (u as { banned_until?: string | null }).banned_until ?? null;
        return {
          id: u.id,
          email: u.email ?? null,
          phone: profile?.phone ?? null,
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          preferred_language: profile?.preferred_language ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          is_banned: banned_until
            ? new Date(banned_until).getTime() > Date.now()
            : false,
          clubs: clubsForUser,
          teams: teamsForUser,
          primary_role: clubsForUser[0]?.role ?? teamsForUser[0]?.role ?? null,
          primary_club_name: clubsForUser[0]?.name ?? null,
        };
      });

    return { items, total: authPage?.total ?? items.length, page: data.page };
  });

/** Detailed view of a single user: profile, auth, clubs, teams, players, recent activity. */
export const getUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    await logAction({
      actor: context.userId,
      action: "view_user_detail",
      target_type: "user",
      target_id: data.user_id,
    });

    const [
      { data: authRes },
      { data: profile },
      { data: memberships },
      { data: teamRoles },
      { data: playerSelf },
      { data: parentLinks },
      { data: recentLogs },
    ] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.user_id),
      supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", data.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("club_members")
        .select("club_id, role, created_at")
        .eq("user_id", data.user_id),
      supabaseAdmin
        .from("team_members")
        .select("team_id, role, player_id, created_at")
        .eq("user_id", data.user_id),
      supabaseAdmin
        .from("players")
        .select("id, first_name, last_name, club_id, jersey_number")
        .eq("user_id", data.user_id),
      supabaseAdmin
        .from("player_parents")
        .select("player_id, can_respond")
        .eq("parent_user_id", data.user_id),
      supabaseAdmin
        .from("superadmin_audit_logs")
        .select("id, action, created_at, actor_user_id, metadata")
        .eq("target_id", data.user_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const clubIds = Array.from(
      new Set([
        ...(memberships ?? []).map((m) => m.club_id),
        ...(playerSelf ?? []).map((p) => p.club_id),
      ]),
    );
    const teamIds = Array.from(new Set((teamRoles ?? []).map((t) => t.team_id)));
    const [{ data: clubs }, { data: teams }, { data: subs }] = await Promise.all([
      clubIds.length
        ? supabaseAdmin
            .from("clubs")
            .select("id, name, logo_url, archived_at")
            .in("id", clubIds)
        : Promise.resolve({ data: [] as never[] }),
      teamIds.length
        ? supabaseAdmin
            .from("teams")
            .select("id, name, club_id, sport")
            .in("id", teamIds)
        : Promise.resolve({ data: [] as never[] }),
      clubIds.length
        ? supabaseAdmin
            .from("subscriptions")
            .select("club_id, status, plan, trial_end, current_period_end")
            .in("club_id", clubIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const clubMap = new Map((clubs ?? []).map((c) => [c.id, c]));
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const subByClub = new Map((subs ?? []).map((s) => [s.club_id, s]));

    // Convocations received via player profiles
    const playerIds = (playerSelf ?? []).map((p) => p.id);
    const { data: convos } = playerIds.length
      ? await supabaseAdmin
          .from("convocations")
          .select("id, event_id, status, responded_at, created_at")
          .in("player_id", playerIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [] as never[] };

    const eventIds = Array.from(
      new Set((convos ?? []).map((c) => c.event_id)),
    );
    const { data: events } = eventIds.length
      ? await supabaseAdmin
          .from("events")
          .select("id, title, type, starts_at, team_id")
          .in("id", eventIds)
      : { data: [] as never[] };
    const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

    const authUser = authRes?.user ?? null;
    const banned_until =
      (authUser as { banned_until?: string | null } | null)?.banned_until ?? null;

    return {
      profile: profile ?? null,
      auth: {
        email: authUser?.email ?? null,
        phone: authUser?.phone ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        email_confirmed_at: authUser?.email_confirmed_at ?? null,
        created_at: authUser?.created_at ?? null,
        is_banned: banned_until
          ? new Date(banned_until).getTime() > Date.now()
          : false,
        banned_until,
      },
      clubs: (memberships ?? []).map((m) => ({
        club_id: m.club_id,
        role: m.role,
        joined_at: m.created_at,
        club: clubMap.get(m.club_id) ?? null,
        subscription: subByClub.get(m.club_id) ?? null,
      })),
      teams: (teamRoles ?? []).map((t) => ({
        team_id: t.team_id,
        role: t.role,
        joined_at: t.created_at,
        team: teamMap.get(t.team_id) ?? null,
      })),
      players: playerSelf ?? [],
      parent_of: parentLinks ?? [],
      recent_convocations: (convos ?? []).map((c) => ({
        ...c,
        event: eventMap.get(c.event_id) ?? null,
      })),
      recent_admin_actions: recentLogs ?? [],
    };
  });

/** Triggers Supabase's built-in password reset email (no link returned). */
export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: u, error: ue } =
      await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (ue || !u?.user?.email) throw new Error("User has no email on file.");

    // Generate a recovery link — the auth-email-hook will turn it into a branded email.
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);

    await logAction({
      actor: context.userId,
      action: "send_password_reset_email",
      target_type: "user",
      target_id: data.user_id,
      metadata: { email: u.user.email },
    });
    return { ok: true, email: u.user.email };
  });

/** Re-sends an onboarding magic-link email to a user. */
export const resendOnboardingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: u, error: ue } =
      await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (ue || !u?.user?.email) throw new Error("User has no email on file.");

    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);

    await logAction({
      actor: context.userId,
      action: "resend_onboarding_email",
      target_type: "user",
      target_id: data.user_id,
      metadata: { email: u.user.email },
    });
    return { ok: true, email: u.user.email };
  });

/** Extended club detail: + recent events, recent convocations, WhatsApp config, billing badges. */
export const getClubDetailExtended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ club_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const [{ data: club }, { data: sub }, { data: teams }, { data: members }] =
      await Promise.all([
        supabaseAdmin.from("clubs").select("*").eq("id", data.club_id).maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("club_id", data.club_id)
          .maybeSingle(),
        supabaseAdmin
          .from("teams")
          .select("id, name, sport, championship, age_group, communication_mode, whatsapp_group_url, image_url, deleted_at, created_at")
          .eq("club_id", data.club_id),
        supabaseAdmin
          .from("club_members")
          .select("user_id, role, created_at")
          .eq("club_id", data.club_id),
      ]);

    const teamIds = (teams ?? []).map((t) => t.id);
    const userIds = (members ?? []).map((m) => m.user_id);

    const [
      { data: profiles },
      { data: recentEvents },
      { data: recentConvos },
    ] = await Promise.all([
      userIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, full_name, first_name, last_name, phone, avatar_url")
            .in("id", userIds)
        : Promise.resolve({ data: [] as never[] }),
      teamIds.length
        ? supabaseAdmin
            .from("events")
            .select("id, title, type, starts_at, team_id, deleted_at, cancelled_at")
            .in("team_id", teamIds)
            .order("starts_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] as never[] }),
      teamIds.length
        ? supabaseAdmin
            .from("convocations")
            .select("id, status, created_at, event_id")
            .order("created_at", { ascending: false })
            .limit(150)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    // Filter convos to events of this club via recent events list (cheap heuristic).
    const eventIds = new Set((recentEvents ?? []).map((e) => e.id));
    const clubConvos = (recentConvos ?? []).filter((c) =>
      eventIds.has(c.event_id),
    );

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return {
      club,
      subscription: sub,
      teams: teams ?? [],
      members: (members ?? []).map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) ?? null,
      })),
      recent_events: recentEvents ?? [],
      recent_convocations: clubConvos,
      whatsapp_configured_count: (teams ?? []).filter(
        (t) => !!t.whatsapp_group_url,
      ).length,
    };
  });

/** Suspends a club (alias for archive with a reason). */
export const suspendClub = archiveClub;

/** Operational alerts surfaced on the Support hub. */
export const getSupportAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const past30d = new Date(
      now.getTime() - 30 * 24 * 3600 * 1000,
    ).toISOString();

    const [
      { data: trialsEnding },
      { data: pastDue },
      { data: pendingInvites },
      { data: dlqEmails },
    ] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("club_id, trial_end, status")
        .eq("status", "trialing")
        .lt("trial_end", in7d)
        .gt("trial_end", now.toISOString())
        .limit(20),
      supabaseAdmin
        .from("subscriptions")
        .select("club_id, status, current_period_end")
        .in("status", ["past_due", "incomplete"])
        .limit(20),
      supabaseAdmin
        .from("member_invites")
        .select("id, club_id, email, created_at")
        .is("used_at", null)
        .lt("created_at", past30d)
        .limit(20),
      supabaseAdmin
        .from("email_send_log")
        .select("id, recipient_email, status, created_at, error_message")
        .in("status", ["failed", "dlq", "bounced"])
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const clubIds = Array.from(
      new Set([
        ...(trialsEnding ?? []).map((s) => s.club_id),
        ...(pastDue ?? []).map((s) => s.club_id),
        ...(pendingInvites ?? []).map((i) => i.club_id),
      ]),
    );
    const { data: clubs } = clubIds.length
      ? await supabaseAdmin
          .from("clubs")
          .select("id, name")
          .in("id", clubIds)
      : { data: [] as never[] };
    const clubMap = new Map((clubs ?? []).map((c) => [c.id, c.name]));

    return {
      trials_ending: (trialsEnding ?? []).map((s) => ({
        ...s,
        club_name: clubMap.get(s.club_id) ?? "—",
      })),
      past_due: (pastDue ?? []).map((s) => ({
        ...s,
        club_name: clubMap.get(s.club_id) ?? "—",
      })),
      stale_invites: (pendingInvites ?? []).map((i) => ({
        ...i,
        club_name: clubMap.get(i.club_id) ?? "—",
      })),
      email_failures: dlqEmails ?? [],
    };
  });

/** Enriched activity logs with actor/target profiles + category/severity hints. */
export const listSuperadminLogsEnriched = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(80),
        category: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("superadmin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const actorIds = Array.from(
      new Set((rows ?? []).map((r) => r.actor_user_id).filter(Boolean)),
    );
    const targetUserIds = Array.from(
      new Set(
        (rows ?? [])
          .filter((r) => r.target_type === "user" && r.target_id)
          .map((r) => r.target_id as string),
      ),
    );
    const clubTargetIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.club_id ?? (r.target_type === "club" ? r.target_id : null))
          .filter(Boolean) as string[],
      ),
    );

    const [{ data: profiles }, { data: clubs }] = await Promise.all([
      [...actorIds, ...targetUserIds].length
        ? supabaseAdmin
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", [...new Set([...actorIds, ...targetUserIds])])
        : Promise.resolve({ data: [] as never[] }),
      clubTargetIds.length
        ? supabaseAdmin
            .from("clubs")
            .select("id, name")
            .in("id", clubTargetIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const clubMap = new Map((clubs ?? []).map((c) => [c.id, c]));

    return {
      items: (rows ?? []).map((r) => ({
        ...r,
        actor_profile: profileMap.get(r.actor_user_id) ?? null,
        target_user_profile:
          r.target_type === "user" && r.target_id
            ? profileMap.get(r.target_id) ?? null
            : null,
        target_club:
          r.club_id
            ? clubMap.get(r.club_id) ?? null
            : r.target_type === "club" && r.target_id
              ? clubMap.get(r.target_id) ?? null
              : null,
      })),
    };
  });

// ============================================================================
// BUSINESS & FINANCE
// ============================================================================
import { getStripe } from "./stripe.server";

// In-memory TTL cache for live Stripe overview (avoids blocking the dashboard
// on every load and isolates it from Stripe slowness/outages).
type StripeOverviewCache = {
  mrrCents: number;
  stripeActive: number;
  avgRevenuePerClubCents: number;
  currency: string;
  fetched_at: number;
};
const STRIPE_OVERVIEW_TTL_MS = 10 * 60 * 1000; // 10 min
let stripeOverviewCache: StripeOverviewCache | null = null;
let stripeOverviewInflight: Promise<StripeOverviewCache> | null = null;

async function fetchStripeOverview(): Promise<StripeOverviewCache> {
  const stripe = getStripe();
  const stripeSubs = await stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.items.data.price"],
  });
  let mrrCents = 0;
  let currency = "eur";
  for (const s of stripeSubs.data) {
    for (const item of s.items.data) {
      const price = item.price;
      if (!price?.unit_amount) continue;
      currency = price.currency || currency;
      const interval = price.recurring?.interval ?? "month";
      const intervalCount = price.recurring?.interval_count ?? 1;
      const monthly =
        interval === "year"
          ? price.unit_amount / (12 * intervalCount)
          : interval === "week"
            ? (price.unit_amount * 52) / 12 / intervalCount
            : interval === "day"
              ? (price.unit_amount * 30) / intervalCount
              : price.unit_amount / intervalCount;
      mrrCents += monthly * (item.quantity ?? 1);
    }
  }
  const stripeActive = stripeSubs.data.length;
  return {
    mrrCents: Math.round(mrrCents),
    stripeActive,
    avgRevenuePerClubCents: stripeActive > 0 ? mrrCents / stripeActive : 0,
    currency,
    fetched_at: Date.now(),
  };
}

async function getStripeOverviewCached(): Promise<StripeOverviewCache | null> {
  const now = Date.now();
  if (stripeOverviewCache && now - stripeOverviewCache.fetched_at < STRIPE_OVERVIEW_TTL_MS) {
    return stripeOverviewCache;
  }
  if (stripeOverviewInflight) return stripeOverviewInflight.catch(() => stripeOverviewCache);
  stripeOverviewInflight = fetchStripeOverview()
    .then((res) => {
      stripeOverviewCache = res;
      return res;
    })
    .finally(() => {
      stripeOverviewInflight = null;
    });
  try {
    return await stripeOverviewInflight;
  } catch (err) {
    console.error("[superadmin] Stripe overview fetch failed", err);
    // Serve stale on failure if we have anything, else null.
    return stripeOverviewCache;
  }
}

/**
 * Platform-wide financial snapshot.
 * Computes MRR/ARR from live Stripe subscriptions for accuracy, plus growth
 * & churn from the local subscriptions table.
 */
export const getFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);

    // ---- Local DB metrics ---------------------------------------------------
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const in7 = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const [
      { data: allSubs },
      { count: newSubs30 },
      { count: canceled30 },
      { count: trialsEnding7d },
      { count: pastDue },
    ] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("id, status, plan, trial_end, current_period_end, canceled_at, created_at, stripe_subscription_id"),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30)
        .in("status", ["active", "trialing"]),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .gte("canceled_at", since30),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "trialing")
        .gte("trial_end", new Date().toISOString())
        .lte("trial_end", in7),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "past_due"),
    ]);

    const subs = allSubs ?? [];
    const active = subs.filter((s) => s.status === "active" || s.status === "past_due");
    const trialing = subs.filter((s) => s.status === "trialing");
    const total = subs.length || 1;
    const churnRate30d = canceled30 != null ? (canceled30 / total) * 100 : 0;

    // Trial conversion: trials created >30d ago that are now active
    const oldTrialCreated = subs.filter(
      (s) => s.created_at < since30 && (s.status === "active" || s.status === "trialing" || s.status === "canceled"),
    );
    const convertedFromTrial = subs.filter(
      (s) => s.status === "active" && s.created_at < since30,
    );
    const trialConvRate =
      oldTrialCreated.length > 0
        ? (convertedFromTrial.length / oldTrialCreated.length) * 100
        : 0;

    // ---- Stripe MRR computation (cached, TTL 10 min) -----------------------
    let mrrCents = 0;
    let stripeActive = 0;
    let avgRevenuePerClubCents = 0;
    let currency = "eur";
    let stripe_cached_at: string | null = null;
    let stripe_stale = false;
    try {
      const cached = await getStripeOverviewCached();
      if (cached) {
        mrrCents = cached.mrrCents;
        stripeActive = cached.stripeActive;
        avgRevenuePerClubCents = cached.avgRevenuePerClubCents;
        currency = cached.currency;
        stripe_cached_at = new Date(cached.fetched_at).toISOString();
        stripe_stale = Date.now() - cached.fetched_at > STRIPE_OVERVIEW_TTL_MS;
      }
    } catch (err) {
      console.error("[superadmin] Stripe MRR fetch failed", err);
    }

    return {
      currency,
      mrr_cents: Math.round(mrrCents),
      arr_cents: Math.round(mrrCents * 12),
      arpu_cents: Math.round(avgRevenuePerClubCents),
      paying_clubs: stripeActive,
      active_subs_db: active.length,
      trialing: trialing.length,
      trials_ending_7d: trialsEnding7d ?? 0,
      new_subs_30d: newSubs30 ?? 0,
      churned_30d: canceled30 ?? 0,
      churn_rate_30d: Math.round(churnRate30d * 10) / 10,
      trial_conversion_rate: Math.round(trialConvRate * 10) / 10,
      past_due: pastDue ?? 0,
      generated_at: new Date().toISOString(),
    };
  });

/**
 * Per-club financial dossier.
 * Returns lifetime revenue, invoice history, payment method, and key dates.
 */
export const getClubFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ club_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, trial_end, cancel_at_period_end, canceled_at",
      )
      .eq("club_id", data.club_id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return {
        has_stripe: false,
        subscription: sub ?? null,
        invoices: [] as InvoiceItem[],
        lifetime_paid_cents: 0,
        currency: "eur",
        payment_method: null as null | { brand: string; last4: string; exp: string },
        upcoming_amount_cents: null as number | null,
      };
    }

    type InvoiceItem = {
      id: string;
      number: string | null;
      status: string | null;
      amount_paid: number;
      amount_due: number;
      currency: string;
      created: number;
      hosted_invoice_url: string | null | undefined;
      invoice_pdf: string | null | undefined;
    };
    let invoices: InvoiceItem[] = [];
    let lifetimePaid = 0;
    let currency = "eur";
    let paymentMethod: null | { brand: string; last4: string; exp: string } = null;
    let upcomingAmount: number | null = null;

    try {
      const stripe = getStripe();
      const [invList, customer] = await Promise.all([
        stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 24 }),
        stripe.customers.retrieve(sub.stripe_customer_id, {
          expand: ["invoice_settings.default_payment_method"],
        }),
      ]);

      invoices = invList.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount_paid: inv.amount_paid,
        amount_due: inv.amount_due,
        currency: inv.currency,
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
      }));

      for (const inv of invList.data) {
        lifetimePaid += inv.amount_paid;
        currency = inv.currency || currency;
      }

      if (!("deleted" in customer) || !customer.deleted) {
        const pm =
          (customer as { invoice_settings?: { default_payment_method?: unknown } })
            .invoice_settings?.default_payment_method;
        if (pm && typeof pm === "object" && "card" in pm && (pm as { card?: { brand: string; last4: string; exp_month: number; exp_year: number } }).card) {
          const card = (pm as { card: { brand: string; last4: string; exp_month: number; exp_year: number } }).card;
          paymentMethod = {
            brand: card.brand,
            last4: card.last4,
            exp: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`,
          };
        }
      }

      if (sub.stripe_subscription_id) {
        try {
          const upcoming = await (stripe.invoices as unknown as {
            retrieveUpcoming: (p: { customer: string }) => Promise<{ amount_due: number }>;
          }).retrieveUpcoming({ customer: sub.stripe_customer_id });
          upcomingAmount = upcoming.amount_due;
        } catch {
          // no upcoming invoice (e.g. canceled or unsupported on this api version)
        }
      }
    } catch (err) {
      console.error("[superadmin] Stripe customer/invoices fetch failed", err);
    }

    return {
      has_stripe: true,
      subscription: sub,
      invoices,
      lifetime_paid_cents: lifetimePaid,
      currency,
      payment_method: paymentMethod,
      upcoming_amount_cents: upcomingAmount,
    };
  });
