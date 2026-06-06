/**
 * Reusable authorization guards for server functions / server routes.
 *
 * Use these BEFORE any `supabaseAdmin` query/write that is scoped by a
 * client-provided id (club_id, user_id, etc.). When user-scoped reads
 * suffice, prefer `context.supabase` (RLS) and skip the guard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ClubRole =
  | "admin"
  | "dirigeant"
  | "coach"
  | "assistant_coach"
  | "staff"
  | "tournament_manager"
  | "financial_admin";

/** Throws 403 unless the caller is a registered super admin. */
export async function assertSuperAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/**
 * Throws 403 unless the caller holds at least one of `allowedRoles` in
 * `clubId`. Super admins always pass. Reads `club_members.roles` (array).
 *
 * Pass the request-scoped `context.supabase` so the lookup itself is
 * subject to RLS — defense in depth.
 */
export async function assertClubRole(opts: {
  supabase: SupabaseClient;
  userId: string;
  clubId: string;
  allowedRoles: ReadonlyArray<ClubRole>;
}): Promise<void> {
  const { supabase, userId, clubId, allowedRoles } = opts;
  if (!clubId) throw new Response("Forbidden", { status: 403 });

  // Super admin shortcut
  const { data: sa } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (sa) return;

  const { data, error } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });

  const roles = new Set<string>([
    ...((data.roles as string[] | null) ?? []),
    ...(data.role ? [data.role as string] : []),
  ]);
  for (const r of allowedRoles) if (roles.has(r)) return;

  // financial_admin lives outside club_members.roles in some schemas; check RPC fallback.
  if (allowedRoles.includes("financial_admin")) {
    const { data: ok } = await supabaseAdmin.rpc("has_club_role_text", {
      _user_id: userId,
      _club_id: clubId,
      _role: "financial_admin",
    });
    if (ok === true) return;
  }

  throw new Response("Forbidden", { status: 403 });
}
