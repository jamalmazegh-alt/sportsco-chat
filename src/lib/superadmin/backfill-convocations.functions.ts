import { resolveClubTz } from "@/lib/time/club-tz";
/**
 * Superadmin — Rattrapage d'envoi email pour convocations existantes.
 *
 * Cas d'usage : un événement a bien créé des convocations et un push a été
 * envoyé, mais le pipeline email initial n'a pas déclenché de dispatch (bug
 * observé sur envois consécutifs). Cette fonction ré-enfile un email
 * `convocation-invite` pour chaque joueur + parents rattachés à chaque
 * convocation d'un ou plusieurs événements, en créant un dispatch tracé.
 *
 * - Auth : superadmin (super_admins).
 * - Crée UN `email_dispatches` par événement (dispatch_type='manual_resend',
 *   metadata.reason='backfill_missing_initial').
 * - Enfile un email par recipient unique (dédup par email lowercased).
 * - Journalise `convocation.email_backfill` dans `product_activity_log`
 *   pour que ça apparaisse dans le dashboard superadmin.
 * - Aucun push, aucun `reminders` (ce n'est pas un rappel : c'est le mail
 *   initial qu'on aurait dû envoyer). `isReminder` reste à false.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(50),
});

const SUPPORTED = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);
function resolveLocale(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = (c ?? "").toLowerCase().slice(0, 2);
    if (SUPPORTED.has(v)) return v;
  }
  return "fr";
}
function fmtDate(iso: string, locale: string, tz?: string | null) {
  const bcp = locale === "en" ? "en-GB" : `${locale}-${locale.toUpperCase()}`;
  return new Date(iso).toLocaleDateString(bcp, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: resolveClubTz(tz),
  });
}

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export type BackfillEventResult = {
  eventId: string;
  eventTitle: string | null;
  dispatchId: string | null;
  convocations: number;
  recipients: number;
  enqueued: number;
  failed: number;
  error?: string;
};

export const backfillConvocationEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<{ results: BackfillEventResult[] }> => {
    await assertSuperAdmin(context.userId);

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    const { loadLineupForConvocationEmailServer } = await import("@/lib/lineup-email.server");
    const { logActivity } = await import("@/lib/observability/log-activity.server");

    const results: BackfillEventResult[] = [];
    const backfillTs = Date.now();

    for (const eventId of data.eventIds) {
      const res: BackfillEventResult = {
        eventId,
        eventTitle: null,
        dispatchId: null,
        convocations: 0,
        recipients: 0,
        enqueued: 0,
        failed: 0,
      };

      try {
        const { data: ev } = await supabaseAdmin
          .from("events")
          .select(
            "id, title, type, starts_at, location, location_url, meeting_point, convocation_time, description, team_id, opponent, is_home, competition_name, competition_type, teams:team_id(name, club_id, clubs:club_id(name, logo_url, default_language, timezone))",
          )
          .eq("id", eventId)
          .maybeSingle();

        if (!ev) {
          res.error = "event_not_found";
          results.push(res);
          continue;
        }
        const e: any = ev;
        res.eventTitle = e.title ?? null;
        const clubId = (e.teams?.club_id as string | null) ?? null;
        const clubLang = e.teams?.clubs?.default_language as string | null | undefined;
        const clubTz = resolveClubTz(e.teams?.clubs?.timezone as string | null | undefined);

        const { data: convs } = await supabaseAdmin
          .from("convocations")
          .select("id, player_id, response_token")
          .eq("event_id", eventId);

        res.convocations = (convs ?? []).length;
        if (res.convocations === 0) {
          res.error = "no_convocations";
          results.push(res);
          continue;
        }

        // Create ONE dispatch for this event's backfill
        const dispatchId = crypto.randomUUID();
        const { error: dispErr } = await supabaseAdmin.from("email_dispatches").insert({
          id: dispatchId,
          event_id: eventId,
          template_name: "convocation-invite",
          dispatch_type: "manual_resend",
          created_by: context.userId,
          metadata: {
            reason: "backfill_missing_initial",
            triggered_by: "superadmin",
            recipient_count: res.convocations,
          },
        });
        if (dispErr) {
          res.error = `dispatch_insert_failed: ${dispErr.message}`;
          results.push(res);
          continue;
        }
        res.dispatchId = dispatchId;

        const playerIds = (convs ?? []).map((c: any) => c.player_id);
        const { data: players } = await supabaseAdmin
          .from("players")
          .select("id, first_name, last_name, email, user_id")
          .in("id", playerIds);
        const playerById = new Map<string, any>();
        for (const p of players ?? []) playerById.set((p as any).id, p);

        const { data: parents } = await supabaseAdmin
          .from("player_parents")
          .select("player_id, email, full_name, parent_user_id")
          .in("player_id", playerIds);
        const parentsByPlayer = new Map<string, any[]>();
        for (const pp of parents ?? []) {
          const pid = (pp as any).player_id as string;
          if (!parentsByPlayer.has(pid)) parentsByPlayer.set(pid, []);
          parentsByPlayer.get(pid)!.push(pp);
        }

        const profileIds = Array.from(
          new Set(
            [
              ...(players ?? []).map((p: any) => p.user_id),
              ...(parents ?? []).map((p: any) => p.parent_user_id),
            ].filter(Boolean) as string[],
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

        const baseUrl = process.env.SITE_URL || "https://www.clubero.app";
        const locationMapsUrl = e.location
          ? (e.location_url ??
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`)
          : undefined;
        const meetingPointMapsUrl = e.meeting_point
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.meeting_point)}`
          : undefined;
        const lineupEmail = await loadLineupForConvocationEmailServer(eventId).catch(
          () => undefined,
        );

        const sentToEmails = new Set<string>();

        for (const conv of convs ?? []) {
          const c: any = conv;
          const player = playerById.get(c.player_id);
          if (!player) continue;
          const playerName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
          const respondUrl = `${baseUrl}/r/${c.response_token}`;
          const recipients: {
            email: string;
            firstName?: string;
            userId?: string | null;
            recipientId?: string | null;
          }[] = [];
          if (player.email) {
            recipients.push({
              email: player.email,
              firstName: player.first_name ?? undefined,
              userId: player.user_id ?? null,
              recipientId: player.user_id ?? null,
            });
          }
          for (const pp of parentsByPlayer.get(c.player_id) ?? []) {
            if (!(pp as any).email) continue;
            const first = ((pp as any).full_name ?? "").split(" ")[0] || undefined;
            recipients.push({
              email: (pp as any).email,
              firstName: first,
              userId: (pp as any).parent_user_id ?? null,
              recipientId: (pp as any).parent_user_id ?? null,
            });
          }

          for (const r of recipients) {
            const key = r.email.trim().toLowerCase();
            if (!key || sentToEmails.has(key)) continue;
            sentToEmails.add(key);
            res.recipients++;

            const recipientLang = r.userId ? langByUser.get(r.userId) : undefined;
            const locale = resolveLocale(recipientLang, clubLang);
            const eventDateLabel = fmtDate(e.starts_at, locale, clubTz);
            try {
              await enqueueTransactionalEmailServer({
                templateName: "convocation-invite",
                recipientEmail: r.email,
                fromName: `${e.teams?.clubs?.name ?? "Clubero"} via Clubero`,
                idempotencyKey: `backfill:${eventId}:${backfillTs}:${key}`,
                dispatchId,
                eventId,
                recipientId: r.recipientId ?? undefined,
                notificationType: "convocation-invite",
                templateData: {
                  recipientFirstName: r.firstName,
                  playerName,
                  eventTitle: e.title,
                  eventType: e.type,
                  eventDate: eventDateLabel,
                  eventDescription: e.description ?? undefined,
                  convocationTime: e.convocation_time
                    ? fmtDate(e.convocation_time, locale, clubTz)
                    : undefined,
                  eventLocation: e.location ?? undefined,
                  locationMapsUrl,
                  meetingPoint: e.meeting_point ?? undefined,
                  meetingPointMapsUrl,
                  competitionName: e.competition_name ?? e.competition_type ?? undefined,
                  teamName: e.teams?.name ?? undefined,
                  clubName: e.teams?.clubs?.name ?? undefined,
                  clubLogoUrl: e.teams?.clubs?.logo_url ?? undefined,
                  respondUrl,
                  lineup: lineupEmail,
                  isReminder: false,
                  locale,
                  tz: clubTz,
                },
              });
              res.enqueued++;
            } catch (err) {
              res.failed++;
              console.error("[backfill-convocations] enqueue failed", {
                eventId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        await logActivity(context.supabase, {
          clubId,
          actorUserId: context.userId,
          actorRole: "admin",
          category: "convocation",
          actionType: "convocation.email_backfill",
          resourceType: "event",
          resourceId: eventId,
          status:
            res.failed === 0 && res.enqueued > 0
              ? "success"
              : res.enqueued === 0
                ? "failure"
                : "warning",
          metadata: {
            dispatch_id: dispatchId,
            convocations: res.convocations,
            recipients: res.recipients,
            enqueued: res.enqueued,
            failed: res.failed,
            team_id: e.team_id,
          },
        });
      } catch (err) {
        res.error = err instanceof Error ? err.message : String(err);
        await logActivity(context.supabase, {
          actorUserId: context.userId,
          actorRole: "admin",
          category: "convocation",
          actionType: "convocation.email_backfill",
          resourceType: "event",
          resourceId: eventId,
          status: "failure",
          rawError: err,
        });
      }

      results.push(res);
    }

    return { results };
  });
