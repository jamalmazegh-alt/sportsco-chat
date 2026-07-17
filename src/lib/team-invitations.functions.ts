import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InviteSendResult = {
  sent: number;
  failed: number;
  skipped: number;
  reason?: "no_contact" | "already_active";
};

const ACTIVE_INVITE_STATUSES = new Set(["pending", "sent", "suppressed"]);

export const sendPlayerInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string; playerId: string }) =>
    z
      .object({
        teamId: z.string().uuid(),
        playerId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InviteSendResult> => {
    const { supabase, userId } = context;

    const normalizeEmail = (email?: string | null) => (email ?? "").trim().toLowerCase();
    const normalizePhone = (phone?: string | null) => (phone ?? "").trim();
    const isAdult = (birthDate?: string | null) => {
      if (!birthDate) return false;
      const dob = new Date(birthDate);
      if (Number.isNaN(dob.getTime())) return false;
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const monthDelta = now.getMonth() - dob.getMonth();
      if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age--;
      return age >= 18;
    };
    const makeToken = () => `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, "");

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, club_id, name")
      .eq("id", data.teamId)
      .maybeSingle();
    if (teamError || !team) throw new Error("Team not found");

    const { data: staffOk, error: staffError } = await supabase.rpc("has_club_role_any", {
      _user_id: userId,
      _club_id: team.club_id,
      _roles: ["admin", "dirigeant", "tournament_manager", "coach", "assistant_coach"],
    });
    if (staffError || !staffOk) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: player }, { data: parents }, { data: club }] = await Promise.all([
      supabaseAdmin
        .from("players")
        .select("id, club_id, first_name, email, phone, user_id, birth_date, child_platform_access")
        .eq("id", data.playerId)
        .eq("club_id", team.club_id)
        .maybeSingle(),
      supabaseAdmin
        .from("player_parents")
        .select("id, full_name, email, phone, parent_user_id")
        .eq("player_id", data.playerId),
      supabaseAdmin.from("clubs").select("name, logo_url").eq("id", team.club_id).maybeSingle(),
    ]);

    if (!player) return { sent: 0, failed: 0, skipped: 1, reason: "no_contact" };

    const canInvitePlayer = isAdult(player.birth_date) || !!player.child_platform_access;
    const targets: Array<{
      role: "player" | "parent";
      firstName?: string;
      email?: string;
      phone?: string;
      playerId: string;
    }> = [];

    if (canInvitePlayer && !player.user_id && (player.email || player.phone)) {
      targets.push({
        role: "player",
        firstName: player.first_name ?? undefined,
        email: player.email ?? undefined,
        phone: player.phone ?? undefined,
        playerId: player.id,
      });
    }

    for (const parent of parents ?? []) {
      if (!parent.parent_user_id && (parent.email || parent.phone)) {
        targets.push({
          role: "parent",
          firstName: (parent.full_name ?? "").split(" ")[0] || undefined,
          email: parent.email ?? undefined,
          phone: parent.phone ?? undefined,
          playerId: player.id,
        });
      }
    }

    if (targets.length === 0) {
      const someContactExists =
        !!(player.email || player.phone) || (parents ?? []).some((p) => !!(p.email || p.phone));
      const playerAlreadyCovered = !!player.user_id || (!canInvitePlayer && !player.user_id);
      const allParentsLinked = (parents ?? []).length > 0 && (parents ?? []).every((p) => !!p.parent_user_id);
      return {
        sent: 0,
        failed: 0,
        skipped: 1,
        reason: someContactExists && (playerAlreadyCovered || allParentsLinked) ? "already_active" : "no_contact",
      };
    }

    const { data: pendingRows } = await supabaseAdmin
      .from("member_invites")
      .select("id, email, phone, email_message_id, used_at, expires_at, created_at")
      .eq("club_id", team.club_id)
      .or(`player_id.eq.${player.id},parent_for_player_id.eq.${player.id}`)
      .is("used_at", null);

    const messageIds = Array.from(
      new Set((pendingRows ?? []).map((row) => row.email_message_id).filter(Boolean) as string[]),
    );
    const latestStatusByMessageId = new Map<string, string>();
    if (messageIds.length > 0) {
      const { data: logs } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id, status, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: false });
      for (const log of logs ?? []) {
        if (log.message_id && !latestStatusByMessageId.has(log.message_id)) {
          latestStatusByMessageId.set(log.message_id, log.status ?? "");
        }
      }
    }

    // Legacy invites created by the old client-side flow do not have an
    // email_message_id. Reconcile them by recipient/time so a retry only targets
    // contacts that never actually reached the queue, while already-sent emails
    // are not duplicated.
    const legacyInviteEmails = Array.from(
      new Set(
        (pendingRows ?? [])
          .filter((row) => !row.email_message_id)
          .map((row) => normalizeEmail(row.email))
          .filter(Boolean),
      ),
    );
    const latestLegacyLogByEmail = new Map<string, { status: string; createdAt: string }>();
    if (legacyInviteEmails.length > 0) {
      const { data: legacyLogs } = await supabaseAdmin
        .from("email_send_log")
        .select("recipient_email, status, created_at")
        .in("recipient_email", legacyInviteEmails)
        .order("created_at", { ascending: false });
      for (const log of legacyLogs ?? []) {
        const email = normalizeEmail(log.recipient_email);
        if (email && !latestLegacyLogByEmail.has(email)) {
          latestLegacyLogByEmail.set(email, {
            status: log.status ?? "",
            createdAt: log.created_at ?? "",
          });
        }
      }
    }

    const blockedEmails = new Set<string>();
    const blockedPhones = new Set<string>();
    const orphanInviteIds: string[] = [];
    for (const row of pendingRows ?? []) {
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) continue;
      const messageId = row.email_message_id;
      let status = messageId ? latestStatusByMessageId.get(messageId) : undefined;
      if (!messageId) {
        const email = normalizeEmail(row.email);
        const legacyLog = email ? latestLegacyLogByEmail.get(email) : undefined;
        const inviteCreatedAt = row.created_at ? new Date(row.created_at).getTime() : 0;
        const logCreatedAt = legacyLog?.createdAt ? new Date(legacyLog.createdAt).getTime() : 0;
        if (legacyLog && logCreatedAt >= inviteCreatedAt - 5 * 60 * 1000) {
          status = legacyLog.status;
        }
      }
      if (!status) {
        // Old client-side attempts sometimes inserted member_invites but never
        // reached the email queue, leaving rows that made the UI look invited
        // while there is no email_send_log. Mark them expired so retries are
        // not blocked and the roster state heals after the next send.
        if (!messageId && row.id) orphanInviteIds.push(row.id);
        continue;
      }
      if (!ACTIVE_INVITE_STATUSES.has(status)) continue;
      const email = normalizeEmail(row.email);
      const phone = normalizePhone(row.phone);
      if (email) blockedEmails.add(email);
      if (phone) blockedPhones.add(phone);
    }

    if (orphanInviteIds.length > 0) {
      await supabaseAdmin
        .from("member_invites")
        .update({ expires_at: new Date(0).toISOString() } as never)
        .in("id", orphanInviteIds);
    }

    const filtered: typeof targets = [];
    let skippedExisting = 0;
    for (const target of targets) {
      const email = normalizeEmail(target.email);
      const phone = normalizePhone(target.phone);
      if ((email && blockedEmails.has(email)) || (phone && blockedPhones.has(phone))) {
        skippedExisting += 1;
        continue;
      }
      if (email) {
        const { data: existingAccount } = await supabaseAdmin.rpc("email_exists", { _email: email });
        if (existingAccount === true) {
          skippedExisting += 1;
          continue;
        }
      }
      filtered.push(target);
    }

    if (filtered.length === 0) {
      return { sent: 0, failed: 0, skipped: skippedExisting || 1, reason: "already_active" };
    }

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    const clubLabel = club?.name ?? "Clubero";
    const clubLogoUrl = club?.logo_url ?? undefined;
    let sent = 0;
    let failed = 0;

    for (const target of filtered) {
      const token = makeToken();
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("member_invites")
        .insert({
          club_id: team.club_id,
          team_id: data.teamId,
          player_id: target.role === "player" ? target.playerId : null,
          parent_for_player_id: target.role === "parent" ? target.playerId : null,
          role: target.role,
          email: target.email ? normalizeEmail(target.email) : null,
          phone: target.phone ? normalizePhone(target.phone) : null,
          token,
          created_by: userId,
        } as never)
        .select("id")
        .single();

      if (inviteError || !invite) {
        failed += 1;
        continue;
      }

      if (!target.email) {
        failed += 1;
        continue;
      }

      try {
        const inviteUrl = `https://clubero.app/register?invite=${encodeURIComponent(token)}`;
        const enqueued = await enqueueTransactionalEmailServer({
          templateName: "player-invite",
          recipientEmail: target.email,
          idempotencyKey: `member-invite-${token}`,
          fromName: `${clubLabel} via Clubero`,
          templateData: {
            firstName: target.firstName,
            teamName: team.name,
            clubName: clubLabel,
            clubLogoUrl,
            inviteUrl,
          },
        });

        if (enqueued?.messageId) {
          await supabaseAdmin
            .from("member_invites")
            .update({ email_message_id: enqueued.messageId } as never)
            .eq("id", (invite as { id: string }).id);
        }
        if (enqueued?.success) sent += 1;
        else failed += 1;
      } catch (error) {
        await supabaseAdmin.from("member_invites").delete().eq("id", (invite as { id: string }).id);
        failed += 1;
        console.error("sendPlayerInvitations enqueue failed", {
          role: target.role,
          playerId: player.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { sent, failed, skipped: skippedExisting };
  });