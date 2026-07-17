import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Superadmin — list every member_invites row for a club with the paired
 * email delivery status resolved from `email_send_log`.
 *
 * Correlation is exact via `member_invites.email_message_id` (populated when
 * the invite email is enqueued). Rows without that link fall back to a
 * best-effort recipient+template lookup within a small time window.
 */

const Input = z.object({
  clubId: z.string().uuid(),
});

export type EmailStatus =
  | "sent"
  | "pending"
  | "failed"
  | "dlq"
  | "suppressed"
  | "bounced"
  | "complained"
  | "none";

export type ClubInviteStatusRow = {
  inviteId: string;
  email: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  invitedPlayerName: string | null;
  teamId: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  isExpired: boolean;
  hasActiveAccount: boolean;
  emailStatus: EmailStatus;
  emailError: string | null;
  emailSentAt: string | null;
  emailMessageId: string | null;
};

export const listClubInviteStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<{ rows: ClubInviteStatusRow[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Superadmin gate
    const { data: sa } = await supabaseAdmin
      .from("super_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sa) throw new Response("Forbidden", { status: 403 });

    const { data: invites, error } = await supabaseAdmin
      .from("member_invites")
      .select(
        "id, email, role, first_name, last_name, team_id, created_at, expires_at, used_at, email_message_id, parent_for_player_id, player_id",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Resolve invited player names + child_platform_access + user_id.
    const playerIds = Array.from(
      new Set(
        (invites ?? [])
          .flatMap((i: any) => [i.parent_for_player_id, i.player_id])
          .filter(Boolean) as string[],
      ),
    );
    const playerNames = new Map<string, string>();
    const playerInfo = new Map<
      string,
      { userId: string | null; childPlatformAccess: boolean }
    >();
    if (playerIds.length > 0) {
      const { data: players } = await supabaseAdmin
        .from("players")
        .select("id, first_name, last_name, user_id, child_platform_access")
        .in("id", playerIds);
      for (const p of players ?? []) {
        const nm = `${(p as any).first_name ?? ""} ${(p as any).last_name ?? ""}`.trim();
        if (nm) playerNames.set((p as any).id, nm);
        playerInfo.set((p as any).id, {
          userId: ((p as any).user_id as string | null) ?? null,
          childPlatformAccess: !!(p as any).child_platform_access,
        });
      }
    }

    // Resolve which parent emails have an active linked account for each player.
    const activeParentEmails = new Set<string>(); // key: `${playerId}|${email.toLowerCase()}`
    if (playerIds.length > 0) {
      const { data: pps } = await supabaseAdmin
        .from("player_parents")
        .select("player_id, email, parent_user_id")
        .in("player_id", playerIds);
      for (const pp of pps ?? []) {
        const email = ((pp as any).email as string | null)?.toLowerCase();
        const pid = (pp as any).player_id as string;
        const uid = (pp as any).parent_user_id as string | null;
        if (email && uid) activeParentEmails.add(`${pid}|${email}`);
      }
    }

    // Bulk fetch email_send_log rows for the message_ids we have.
    const messageIds = Array.from(
      new Set(
        (invites ?? [])
          .map((i: any) => i.email_message_id as string | null)
          .filter((v: string | null): v is string => !!v),
      ),
    );
    const logByMessageId = new Map<
      string,
      { status: string; error_message: string | null; created_at: string }
    >();
    if (messageIds.length > 0) {
      const { data: logs } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id, status, error_message, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: false });
      // Keep only the latest row per message_id (dedup rule).
      for (const l of logs ?? []) {
        const mid = (l as any).message_id as string;
        if (!logByMessageId.has(mid)) {
          logByMessageId.set(mid, {
            status: (l as any).status,
            error_message: (l as any).error_message ?? null,
            created_at: (l as any).created_at,
          });
        }
      }
    }

    // Best-effort fallback for legacy invites without email_message_id:
    // recipient + template + created_at proximity.
    const legacyInvites = (invites ?? []).filter(
      (i: any) => !i.email_message_id && i.email,
    );
    const legacyByKey = new Map<
      string,
      { status: string; error_message: string | null; created_at: string }
    >();
    if (legacyInvites.length > 0) {
      const legacyEmails = Array.from(
        new Set(legacyInvites.map((i: any) => (i.email as string).toLowerCase())),
      );
      const oldest = legacyInvites.reduce(
        (min: string, i: any) =>
          i.created_at < min ? (i.created_at as string) : min,
        legacyInvites[0].created_at as string,
      );
      const { data: logs } = await supabaseAdmin
        .from("email_send_log")
        .select("recipient_email, template_name, status, error_message, created_at, message_id")
        .in("template_name", ["player-invite"])
        .in("recipient_email", legacyEmails)
        .gte("created_at", new Date(new Date(oldest).getTime() - 60_000).toISOString())
        .order("created_at", { ascending: false });
      // dedup by message_id — keep latest status per email
      const seenMid = new Set<string>();
      const perEmail = new Map<
        string,
        Array<{ status: string; error_message: string | null; created_at: string }>
      >();
      for (const l of logs ?? []) {
        const mid = (l as any).message_id as string | null;
        if (mid && seenMid.has(mid)) continue;
        if (mid) seenMid.add(mid);
        const email = ((l as any).recipient_email as string).toLowerCase();
        const arr = perEmail.get(email) ?? [];
        arr.push({
          status: (l as any).status,
          error_message: (l as any).error_message ?? null,
          created_at: (l as any).created_at as string,
        });
        perEmail.set(email, arr);
      }
      // For each legacy invite, match the log entry closest in time (within 60s window).
      for (const inv of legacyInvites) {
        const email = (inv.email as string).toLowerCase();
        const arr = perEmail.get(email);
        if (!arr || arr.length === 0) continue;
        const invTime = new Date(inv.created_at as string).getTime();
        let best = arr[0];
        let bestDelta = Math.abs(new Date(best.created_at).getTime() - invTime);
        for (const cand of arr.slice(1)) {
          const d = Math.abs(new Date(cand.created_at).getTime() - invTime);
          if (d < bestDelta) {
            best = cand;
            bestDelta = d;
          }
        }
        // Only accept a match within a 5-minute window.
        if (bestDelta <= 5 * 60_000) legacyByKey.set(inv.id, best);
      }
    }

    const now = Date.now();
    const rows: ClubInviteStatusRow[] = (invites ?? []).map((inv: any) => {
      let emailStatus: EmailStatus = "none";
      let emailError: string | null = null;
      let emailSentAt: string | null = null;

      const log = inv.email_message_id
        ? logByMessageId.get(inv.email_message_id)
        : legacyByKey.get(inv.id);
      if (log) {
        emailStatus = (log.status as EmailStatus) ?? "none";
        emailError = log.error_message;
        emailSentAt = log.created_at;
      }

      const playerId = inv.parent_for_player_id ?? inv.player_id ?? null;
      const invitedPlayerName = playerId ? (playerNames.get(playerId) ?? null) : null;

      // Compute "hasActiveAccount":
      //  - parent invite: a player_parents row links this email to a real user, OR
      //    the child does not have platform access and any parent for this child is linked.
      //  - player invite: the player has a linked user_id, OR the child has no
      //    platform access (managed by parents) and at least one parent is linked.
      let hasActiveAccount = false;
      const info = playerId ? playerInfo.get(playerId) : undefined;
      if (inv.role === "parent" && playerId && inv.email) {
        const key = `${playerId}|${(inv.email as string).toLowerCase()}`;
        if (activeParentEmails.has(key)) hasActiveAccount = true;
      } else if (inv.player_id && info) {
        if (info.userId) hasActiveAccount = true;
        else if (!info.childPlatformAccess) {
          // child managed by parents: any linked parent counts
          for (const k of activeParentEmails) {
            if (k.startsWith(`${inv.player_id}|`)) {
              hasActiveAccount = true;
              break;
            }
          }
        }
      }

      return {
        inviteId: inv.id as string,
        email: (inv.email as string | null) ?? null,
        role: inv.role as string,
        firstName: (inv.first_name as string | null) ?? null,
        lastName: (inv.last_name as string | null) ?? null,
        invitedPlayerName,
        teamId: (inv.team_id as string | null) ?? null,
        createdAt: inv.created_at as string,
        expiresAt: inv.expires_at as string,
        usedAt: (inv.used_at as string | null) ?? null,
        isExpired: !inv.used_at && new Date(inv.expires_at).getTime() < now,
        hasActiveAccount,
        emailStatus,
        emailError,
        emailSentAt,
        emailMessageId: (inv.email_message_id as string | null) ?? null,
      };
    });

    return { rows };
  });
