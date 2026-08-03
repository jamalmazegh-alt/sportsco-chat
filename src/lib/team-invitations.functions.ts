import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SuppressedEntry = { email: string; reason: string | null };
type InviteSendResult = {
  sent: number;
  failed: number;
  skipped: number;
  reason?: "no_contact" | "already_active" | "account_exists";
  suppressedEmails?: string[];
  suppressedDetails?: SuppressedEntry[];
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
      playerFirstName?: string;
    }> = [];

    if (canInvitePlayer && !player.user_id && (player.email || player.phone)) {
      targets.push({
        role: "player",
        firstName: player.first_name ?? undefined,
        email: player.email ?? undefined,
        phone: player.phone ?? undefined,
        playerId: player.id,
        playerFirstName: player.first_name ?? undefined,
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
          playerFirstName: player.first_name ?? undefined,
        });
      }
    }

    if (targets.length === 0) {
      const someContactExists =
        !!(player.email || player.phone) || (parents ?? []).some((p) => !!(p.email || p.phone));
      const playerAlreadyCovered = !!player.user_id || (!canInvitePlayer && !player.user_id);
      const allParentsLinked =
        (parents ?? []).length > 0 && (parents ?? []).every((p) => !!p.parent_user_id);
      return {
        sent: 0,
        failed: 0,
        skipped: 1,
        reason:
          someContactExists && (playerAlreadyCovered || allParentsLinked)
            ? "already_active"
            : "no_contact",
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
      const expiresAt = row.expires_at
        ? new Date(row.expires_at).getTime()
        : Number.POSITIVE_INFINITY;
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
    let skippedAccountExists = 0;
    for (const target of targets) {
      const email = normalizeEmail(target.email);
      const phone = normalizePhone(target.phone);
      if ((email && blockedEmails.has(email)) || (phone && blockedPhones.has(phone))) {
        skippedExisting += 1;
        continue;
      }
      if (email) {
        const { data: existingAccount } = await supabaseAdmin.rpc("email_exists", {
          _email: email,
        });
        if (existingAccount === true) {
          skippedExisting += 1;
          skippedAccountExists += 1;
          continue;
        }
      }
      filtered.push(target);
    }

    if (filtered.length === 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: skippedExisting || 1,
        // Un compte Clubero existe déjà pour cette adresse : renvoyer une
        // invitation ne sert à rien (et le formulaire d'inscription refuserait
        // le nouveau mot de passe). On le dit explicitement.
        reason: skippedAccountExists > 0 ? "account_exists" : "already_active",
      };
    }

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    const clubLabel = club?.name ?? "Clubero";
    const clubLogoUrl = club?.logo_url ?? undefined;
    let sent = 0;
    let failed = 0;
    const suppressedEmails: string[] = [];
    const suppressedDetails: SuppressedEntry[] = [];

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
            roleLabel: target.role === "parent" ? "parent" : "joueur",
            playerFirstName: target.playerFirstName,
          },
        });

        if (enqueued?.messageId) {
          await supabaseAdmin
            .from("member_invites")
            .update({ email_message_id: enqueued.messageId } as never)
            .eq("id", (invite as { id: string }).id);
        }
        if (enqueued?.success) {
          sent += 1;
        } else {
          failed += 1;
          if (enqueued?.reason === "suppressed") {
            const em = normalizeEmail(target.email);
            suppressedEmails.push(em);
            suppressedDetails.push({
              email: em,
              reason: (enqueued as { suppressionReason?: string | null }).suppressionReason ?? null,
            });
          }
        }
      } catch (error) {
        await supabaseAdmin
          .from("member_invites")
          .delete()
          .eq("id", (invite as { id: string }).id);
        failed += 1;
        console.error("sendPlayerInvitations enqueue failed", {
          role: target.role,
          playerId: player.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { sent, failed, skipped: skippedExisting, suppressedEmails, suppressedDetails };
  });

/**
 * List failed invitation emails per player for a team. Returns a map keyed by
 * playerId with the failed recipient emails and last error message so the UI
 * can flag which players' invites did not go through.
 *
 * "Failed" = latest status per message_id in email_send_log is one of
 * failed/dlq/bounced/complained/suppressed.
 */
export const listTeamInviteFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teamId: string }) =>
    z.object({ teamId: z.string().uuid() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      failuresByPlayer: Record<
        string,
        Array<{ email: string; status: string; error: string | null; at: string }>
      >;
    }> => {
      const { supabase, userId } = context;

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, club_id")
        .eq("id", data.teamId)
        .maybeSingle();
      if (teamError || !team) throw new Error("Team not found");

      const { data: staffOk } = await supabase.rpc("has_club_role_any", {
        _user_id: userId,
        _club_id: team.club_id,
        _roles: ["admin", "dirigeant", "tournament_manager", "coach", "assistant_coach"],
      });
      if (!staffOk) throw new Response("Forbidden", { status: 403 });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: tmRows } = await supabaseAdmin
        .from("team_members")
        .select("player_id")
        .eq("team_id", data.teamId)
        .eq("role", "player");
      const playerIds = Array.from(
        new Set((tmRows ?? []).map((r: any) => r.player_id as string).filter(Boolean)),
      );
      if (playerIds.length === 0) return { failuresByPlayer: {} };

      // Current live contact emails per player (player + parents). Failures
      // recorded against an email that is no longer any of these are stale
      // (typo later corrected, parent email changed, etc.) and must NOT be
      // reported as a current failure.
      const [{ data: playerRows }, { data: parentRows }] = await Promise.all([
        supabaseAdmin.from("players").select("id, email").in("id", playerIds),
        supabaseAdmin.from("player_parents").select("player_id, email").in("player_id", playerIds),
      ]);
      const currentEmailsByPlayer = new Map<string, Set<string>>();
      const addEmail = (pid: string, email: string | null | undefined) => {
        const norm = (email ?? "").trim().toLowerCase();
        if (!norm) return;
        const set = currentEmailsByPlayer.get(pid) ?? new Set<string>();
        set.add(norm);
        currentEmailsByPlayer.set(pid, set);
      };
      for (const r of playerRows ?? []) addEmail((r as any).id, (r as any).email);
      for (const r of parentRows ?? []) addEmail((r as any).player_id, (r as any).email);
      const isCurrentEmail = (pid: string, email: string | null | undefined) => {
        const norm = (email ?? "").trim().toLowerCase();
        if (!norm) return false;
        return currentEmailsByPlayer.get(pid)?.has(norm) ?? false;
      };

      const { data: invites } = await supabaseAdmin
        .from("member_invites")
        .select("id, player_id, parent_for_player_id, email, email_message_id, created_at")
        .eq("club_id", team.club_id)
        .or(
          `player_id.in.(${playerIds.join(",")}),parent_for_player_id.in.(${playerIds.join(",")})`,
        );

      const inviteByMsg = new Map<string, { playerId: string; email: string | null }>();
      const legacyInvites: Array<{
        playerId: string;
        email: string;
        createdAt: string;
      }> = [];
      for (const inv of invites ?? []) {
        const pid = ((inv as any).player_id ?? (inv as any).parent_for_player_id) as string | null;
        if (!pid) continue;
        const mid = (inv as any).email_message_id as string | null;
        const email = ((inv as any).email as string | null) ?? null;
        if (mid) {
          inviteByMsg.set(mid, { playerId: pid, email });
        } else if (email) {
          legacyInvites.push({
            playerId: pid,
            email: email.toLowerCase(),
            createdAt: (inv as any).created_at as string,
          });
        }
      }

      const FAIL = new Set(["failed", "dlq", "bounced", "complained", "suppressed"]);
      const failuresByPlayer: Record<
        string,
        Array<{ email: string; status: string; error: string | null; at: string }>
      > = {};

      const messageIds = Array.from(inviteByMsg.keys());
      if (messageIds.length > 0) {
        const { data: logs } = await supabaseAdmin
          .from("email_send_log")
          .select("message_id, recipient_email, status, error_message, created_at")
          .eq("template_name", "player-invite")
          .in("message_id", messageIds)
          .order("created_at", { ascending: false });

        const seen = new Set<string>();
        for (const l of logs ?? []) {
          const mid = (l as any).message_id as string;
          if (seen.has(mid)) continue;
          seen.add(mid);
          const status = (l as any).status as string;
          if (!FAIL.has(status)) continue;
          const info = inviteByMsg.get(mid);
          if (!info) continue;
          const failedEmail = ((l as any).recipient_email as string | null) ?? info.email ?? "";
          // Skip stale failures on emails that are no longer any of the
          // player's or parents' current contacts.
          if (!isCurrentEmail(info.playerId, failedEmail)) continue;
          const arr = (failuresByPlayer[info.playerId] ??= []);
          arr.push({
            email: failedEmail,
            status,
            error: ((l as any).error_message as string | null) ?? null,
            at: (l as any).created_at as string,
          });
        }
      }

      // Legacy fallback: match by recipient email within a small time window.
      if (legacyInvites.length > 0) {
        const emails = Array.from(new Set(legacyInvites.map((i) => i.email)));
        const { data: logs } = await supabaseAdmin
          .from("email_send_log")
          .select("recipient_email, status, error_message, created_at, message_id")
          .in("recipient_email", emails)
          .order("created_at", { ascending: false });
        const latestByMsg = new Map<string, any>();
        for (const l of logs ?? []) {
          const mid = (l as any).message_id as string | null;
          if (mid && latestByMsg.has(mid)) continue;
          if (mid) latestByMsg.set(mid, l);
        }
        for (const inv of legacyInvites) {
          for (const l of latestByMsg.values()) {
            if ((l.recipient_email as string).toLowerCase() !== inv.email) continue;
            const delta = Math.abs(
              new Date(l.created_at).getTime() - new Date(inv.createdAt).getTime(),
            );
            if (delta > 10 * 60_000) continue;
            const status = l.status as string;
            if (!FAIL.has(status)) continue;
            if (!isCurrentEmail(inv.playerId, inv.email)) break;
            const arr = (failuresByPlayer[inv.playerId] ??= []);
            if (arr.some((x) => x.email.toLowerCase() === inv.email)) break;
            arr.push({
              email: inv.email,
              status,
              error: (l.error_message as string | null) ?? null,
              at: l.created_at as string,
            });
            break;
          }
        }
      }

      return { failuresByPlayer };
    },
  );
