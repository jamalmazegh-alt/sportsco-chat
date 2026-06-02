import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import { loadLineupForConvocationEmailServer } from "@/lib/lineup-email.server";


const TOLERANCE_MIN = 20; // cron runs every 15 min; pick a slightly larger window

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

export const Route = createFileRoute("/api/public/hooks/event-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared cron secret — required to prevent public abuse (mass email trigger).
        const secret = process.env.DATA_RETENTION_SECRET;
        if (!secret) {
          return new Response("Not configured", { status: 503 });
        }
        const provided =
          request.headers.get("x-cron-secret") ||
          request.headers.get("x-retention-secret");
        if (provided !== secret) {
          return new Response("Forbidden", { status: 403 });
        }
        const now = Date.now();
        const horizon = new Date(now + 72 * 60 * 60 * 1000).toISOString();

        // Upcoming events in next 72h, not cancelled/deleted, where club has auto reminders on
        const { data: events, error } = await supabaseAdmin
          .from("events")
          .select(
            "id, title, type, starts_at, location, location_url, meeting_point, convocation_time, description, team_id, cancelled_at, deleted_at, competition_name, competition_type, teams:team_id(name, club_id, clubs:club_id(name, logo_url, auto_reminders_enabled, auto_reminder_hours_before, default_language))"
          )
          .is("cancelled_at", null)
          .is("deleted_at", null)
          .gte("starts_at", new Date(now).toISOString())
          .lte("starts_at", horizon);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        let processed = 0;
        let sent = 0;

        for (const ev of (events ?? []) as any[]) {
          const club = ev.teams?.clubs;
          if (!club?.auto_reminders_enabled) continue;
          const milestones: number[] = Array.isArray(club.auto_reminder_hours_before)
            ? club.auto_reminder_hours_before
            : [];
          if (milestones.length === 0) continue;

          const startsAt = new Date(ev.starts_at).getTime();
          const hoursLeft = (startsAt - now) / (1000 * 60 * 60);

          // Find the largest milestone whose window we're currently inside.
          // Window: hoursLeft within [m - TOLERANCE_MIN/60, m]
          const milestone = milestones
            .slice()
            .sort((a, b) => b - a)
            .find((m) => hoursLeft <= m && hoursLeft >= m - TOLERANCE_MIN / 60);
          if (milestone === undefined) continue;

          // Pending convocations only
          const { data: convs } = await supabaseAdmin
            .from("convocations")
            .select("id, response_token, player_id")
            .eq("event_id", ev.id)
            .eq("status", "pending");
          if (!convs || convs.length === 0) continue;

          const convIds = convs.map((c: any) => c.id);
          // Skip convocations that already got this milestone
          const { data: existing } = await supabaseAdmin
            .from("reminders")
            .select("convocation_id")
            .in("convocation_id", convIds)
            .eq("milestone_hours", milestone);
          const alreadySent = new Set((existing ?? []).map((r: any) => r.convocation_id));
          const toSend = convs.filter((c: any) => !alreadySent.has(c.id));
          if (toSend.length === 0) continue;

          processed += toSend.length;

          // Resolve recipients (player email + parent emails)
          const playerIds = toSend.map((c: any) => c.player_id);
          const [{ data: players }, { data: parents }] = await Promise.all([
            supabaseAdmin
              .from("players")
              .select("id, first_name, last_name, email, user_id")
              .in("id", playerIds),
            supabaseAdmin
              .from("player_parents")
              .select("player_id, email, full_name, parent_user_id")
              .in("player_id", playerIds),
          ]);

          // Fetch preferred_language for any linked profiles (player or parent)
          const profileIds = Array.from(new Set([
            ...((players ?? []).map((p: any) => p.user_id).filter(Boolean)),
            ...((parents ?? []).map((p: any) => p.parent_user_id).filter(Boolean)),
          ]));
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

          const clubLang = (club as any).default_language as string | null | undefined;
          const baseUrl =
            process.env.SITE_URL ||
            "https://www.clubero.app";

          const locationMapsUrl = ev.location
            ? ev.location_url ??
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`
            : undefined;
          const meetingPointMapsUrl = ev.meeting_point
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.meeting_point)}`
            : undefined;

          const lineupEmail = await loadLineupForConvocationEmailServer(ev.id).catch(() => undefined);



          for (const conv of toSend) {
            const player: any = (players ?? []).find((p: any) => p.id === conv.player_id);
            if (!player) continue;
            const playerName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
            const respondUrl = `${baseUrl}/r/${conv.response_token}`;

            const recipients: { email: string; firstName?: string }[] = [];
            if (player.email) {
              recipients.push({ email: player.email, firstName: player.first_name ?? undefined });
            }
            for (const pp of (parents ?? []).filter((p: any) => p.player_id === conv.player_id)) {
              if (!pp.email) continue;
              const first = (pp.full_name ?? "").split(" ")[0] || undefined;
              recipients.push({ email: pp.email, firstName: first });
            }

            for (const r of recipients) {
              try {
                await enqueueTransactionalEmailServer({
                  templateName: "convocation-invite",
                  recipientEmail: r.email,
                  idempotencyKey: `event-reminder:${conv.id}:${milestone}:${r.email}`,
                  templateData: {
                    recipientFirstName: r.firstName,
                    playerName,
                    eventTitle: ev.title,
                    eventType: ev.type,
                    eventDate: eventDateLabel,
                    eventDescription: ev.description ?? undefined,
                    convocationTime: ev.convocation_time
                      ? frDate(ev.convocation_time)
                      : undefined,
                    eventLocation: ev.location ?? undefined,
                    locationMapsUrl,
                    meetingPoint: ev.meeting_point ?? undefined,
                    meetingPointMapsUrl,
                    competitionName:
                      ev.competition_name ?? ev.competition_type ?? undefined,
                    teamName: ev.teams?.name ?? undefined,
                    clubName: club.name ?? undefined,
                    clubLogoUrl: club.logo_url ?? undefined,
                    respondUrl,
                    isReminder: true,
                    reminderHoursBefore: milestone,
                    lineup: lineupEmail,
                    locale: "fr",
                  },

                });
                sent++;
              } catch (e) {
                console.error("[event-reminders] enqueue failed", e);
              }
            }

            await supabaseAdmin.from("reminders").insert({
              convocation_id: conv.id,
              channel: "email",
              milestone_hours: milestone,
            });
          }
        }

        return new Response(
          JSON.stringify({ processed, sent }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
