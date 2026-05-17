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
      metadata: opts.metadata ?? null,
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
    const { data, error } = await supabaseAdmin.rpc("get_platform_stats");
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
      .select("id, name, created_at, created_by, logo_url", { count: "exact" })
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
