/**
 * Manual convocation reminder: triggered by the coach via the "Relancer"
 * button in the convocation detail dialog.
 *
 * Sends:
 *   - convocation-invite email (with isReminder=true) to the player + each
 *     linked parent, mirroring the auto event-reminders cron.
 *   - Web Push to the player + each linked parent (gated by
 *     club_notification_settings.convocation_reminder).
 *
 * Records a row in `reminders` (channel = "email") so the 30-min cooldown
 * applied in the UI stays consistent across triggers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  convocationId: z.string().uuid(),
});

const SUPPORTED = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);
function resolveLocale(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = (c ?? "").toLowerCase().slice(0, 2);
    if (SUPPORTED.has(v)) return v;
  }
  return "fr";
}
function fmtDate(iso: string, locale: string) {
  const bcp = locale === "en" ? "en-GB" : `${locale}-${locale.toUpperCase()}`;
  return new Date(iso).toLocaleDateString(bcp, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const sendManualConvocationReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    const { loadLineupForConvocationEmailServer } = await import("@/lib/lineup-email.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");

    // 1. Load convocation + event + club via admin (we already verified the
    //    caller is signed in; coach-only UI gates the button, and the
    //    convocation row is required to derive the recipient list).
    const { data: conv } = await supabaseAdmin
      .from("convocations")
      .select(
        "id, event_id, player_id, response_token, status, events:event_id(id, title, type, starts_at, location, location_url, meeting_point, convocation_time, description, team_id, opponent, is_home, competition_name, competition_type, teams:team_id(name, club_id, clubs:club_id(name, logo_url, default_language)))",
      )
      .eq("id", data.convocationId)
      .maybeSingle();

    if (!conv) return { ok: false as const, reason: "not_found" };
    const ev: any = (conv as any).events;
    if (!ev) return { ok: false as const, reason: "no_event" };
    const teamId = ev.team_id as string | null;
    const clubId = (ev.teams?.club_id as string | null) ?? null;

    // 2. Authorization: caller must be an active coach of the team.
    if (teamId) {
      const { data: tm } = await context.supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (tm as any)?.role as string | undefined;
      if (!role || (role !== "coach" && role !== "assistant_coach")) {
        // Also allow club admins as a fallback.
        if (clubId) {
          const { data: cm } = await context.supabase
            .from("club_members")
            .select("role")
            .eq("club_id", clubId)
            .eq("user_id", context.userId)
            .maybeSingle();
          const crole = (cm as any)?.role as string | undefined;
          if (crole !== "admin" && crole !== "owner") {
            return { ok: false as const, reason: "forbidden" };
          }
        } else {
          return { ok: false as const, reason: "forbidden" };
        }
      }
    }

    // 3. 30-min cooldown — based on the most recent reminder for this conv.
    const { data: recent } = await supabaseAdmin
      .from("reminders")
      .select("sent_at")
      .eq("convocation_id", data.convocationId)
      .order("sent_at", { ascending: false })
      .limit(1);
    const lastAt = (recent ?? [])[0]?.sent_at ? new Date((recent as any)[0].sent_at).getTime() : 0;
    if (lastAt && Date.now() - lastAt < 30 * 60 * 1000) {
      return { ok: false as const, reason: "cooldown" };
    }

    // 4. Load player + parents for recipients.
    const { data: player } = await supabaseAdmin
      .from("players")
      .select("id, first_name, last_name, email, user_id")
      .eq("id", (conv as any).player_id)
      .maybeSingle();
    if (!player) return { ok: false as const, reason: "no_player" };

    const { data: parents } = await supabaseAdmin
      .from("player_parents")
      .select("email, full_name, parent_user_id")
      .eq("player_id", (conv as any).player_id);

    const playerName = `${(player as any).first_name ?? ""} ${
      (player as any).last_name ?? ""
    }`.trim();

    // 5. Locale resolution
    const profileIds = Array.from(
      new Set(
        [(player as any).user_id, ...(parents ?? []).map((p: any) => p.parent_user_id)].filter(
          Boolean,
        ) as string[],
      ),
    );
    const langByUser = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, preferred_language")
        .in("id", profileIds);
      for (const p of profs ?? []) {
        if ((p as any).preferred_language) {
          langByUser.set((p as any).id, (p as any).preferred_language);
        }
      }
    }
    const clubLang = ev.teams?.clubs?.default_language as string | null | undefined;

    const baseUrl = process.env.SITE_URL || "https://www.clubero.app";
    const respondUrl = `${baseUrl}/r/${(conv as any).response_token}`;
    const locationMapsUrl = ev.location
      ? (ev.location_url ??
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`)
      : undefined;
    const meetingPointMapsUrl = ev.meeting_point
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.meeting_point)}`
      : undefined;
    const lineupEmail = await loadLineupForConvocationEmailServer(ev.id).catch(() => undefined);

    // 6. Build recipients + send emails (fire-and-forget per recipient).
    const recipients: { email: string; firstName?: string; userId?: string | null }[] = [];
    if ((player as any).email) {
      recipients.push({
        email: (player as any).email,
        firstName: (player as any).first_name ?? undefined,
        userId: (player as any).user_id ?? null,
      });
    }
    for (const pp of parents ?? []) {
      if (!(pp as any).email) continue;
      const first = ((pp as any).full_name ?? "").split(" ")[0] || undefined;
      recipients.push({
        email: (pp as any).email,
        firstName: first,
        userId: (pp as any).parent_user_id ?? null,
      });
    }

    const ts = Date.now();
    let emailsSent = 0;
    for (const r of recipients) {
      const recipientLang = r.userId ? langByUser.get(r.userId) : undefined;
      const locale = resolveLocale(recipientLang, clubLang);
      const eventDateLabel = fmtDate(ev.starts_at, locale);
      try {
        await enqueueTransactionalEmailServer({
          templateName: "convocation-invite",
          recipientEmail: r.email,
          idempotencyKey: `manual-reminder:${(conv as any).id}:${ts}:${r.email}`,
          templateData: {
            recipientFirstName: r.firstName,
            playerName,
            eventTitle: ev.title,
            eventType: ev.type,
            eventDate: eventDateLabel,
            eventDescription: ev.description ?? undefined,
            convocationTime: ev.convocation_time ? fmtDate(ev.convocation_time, locale) : undefined,
            eventLocation: ev.location ?? undefined,
            locationMapsUrl,
            meetingPoint: ev.meeting_point ?? undefined,
            meetingPointMapsUrl,
            competitionName: ev.competition_name ?? ev.competition_type ?? undefined,
            teamName: ev.teams?.name ?? undefined,
            clubName: ev.teams?.clubs?.name ?? undefined,
            clubLogoUrl: ev.teams?.clubs?.logo_url ?? undefined,
            respondUrl,
            isReminder: true,
            locale,
          },
        });
        emailsSent++;
      } catch (e) {
        console.error("[manual-reminder] enqueue failed", e);
      }
    }

    // 7. Web Push — gated by convocation_reminder (same as auto cron).
    const settings = await getClubNotifSettings(clubId);
    let pushSent = 0;
    if (settings.convocation_reminder) {
      const pushTargets = new Set<string>();
      if ((player as any).user_id) pushTargets.add((player as any).user_id);
      for (const pp of parents ?? []) {
        if ((pp as any).parent_user_id) pushTargets.add((pp as any).parent_user_id);
      }
      const isMatch = ev.type === "match";
      const teamName = (ev.teams?.name as string | null) ?? null;
      const opponent = (ev.opponent as string | null) ?? null;
      const isHome = ev.is_home as boolean | null | undefined;
      const startDt = new Date(ev.starts_at);
      const timeStr = startDt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      let headline: string;
      if (isMatch && opponent) {
        headline = teamName ? `${teamName} vs ${opponent}` : `vs ${opponent}`;
      } else if (isMatch) {
        headline = teamName ? `Match ${teamName}` : "Match";
      } else {
        headline = ev.title || "Événement";
      }
      const venueBit = isMatch
        ? isHome === true
          ? " · Domicile"
          : isHome === false
            ? " · Extérieur"
            : ""
        : ev.location
          ? ` · ${ev.location}`
          : "";
      const reminderBody = `${playerName || "Tu"} n'as pas encore répondu — ${headline} · ${timeStr}${venueBit}`;
      const uids = Array.from(pushTargets);
      await Promise.allSettled(
        uids.map((uid) =>
          sendPushToUser(uid, {
            title: "🔔 Rappel convocation",
            body: reminderBody,
            url: `/events/${ev.id}`,
            tag: `conv-reminder-${(conv as any).id}`,
          }),
        ),
      );
      pushSent += uids.length;
    }

    // 8. Record the reminder (single row, channel = email — drives cooldown).
    await supabaseAdmin.from("reminders").insert({
      convocation_id: (conv as any).id,
      channel: "email",
      sent_by: context.userId,
    });

    return { ok: true as const, emails: emailsSent, push: pushSent };
  });
