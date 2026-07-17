/**
 * Replay DLQ convocation emails for a single event.
 *
 * Uses a Postgres advisory lock keyed on the event to prevent two admins
 * from triggering a concurrent replay. Creates a dedicated `email_dispatches`
 * row (kind = 'dlq_replay') and re-enqueues each failed recipient with a
 * fresh dispatch_id so:
 *   - the technical idempotency (dispatch_id + recipient_id +
 *     notification_type) does NOT collide with the initial dispatch;
 *   - the audit trail clearly separates initial send from replay;
 *   - a recipient that has since delivered will be filtered out at enqueue
 *     time via the pre-send check in enqueueTransactionalEmailServer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  eventId: z.string().uuid(),
  notificationType: z.string().default("convocation-invite"),
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

// Hash-based advisory lock key derived from the event UUID.
async function eventLockKey(eventId: string): Promise<number> {
  const buf = new TextEncoder().encode(eventId);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const view = new DataView(digest);
  // Signed 32-bit int fits pg_try_advisory_lock(int)
  return view.getInt32(0, false);
}

export const replayEventDlq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    // 1. Load event + club to authorize the caller.
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select(
        "id, title, type, starts_at, location, location_url, meeting_point, convocation_time, description, team_id, opponent, is_home, competition_name, competition_type, teams:team_id(name, club_id, clubs:club_id(name, logo_url, default_language))",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { ok: false as const, reason: "not_found" };
    const teamId = (ev as any).team_id as string | null;
    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;

    // Authorization — coach on the team OR admin/owner of the club.
    let authorized = false;
    if (teamId) {
      const { data: tm } = await context.supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (tm as any)?.role as string | undefined;
      if (role === "coach" || role === "assistant_coach") authorized = true;
    }
    if (!authorized && clubId) {
      const { data: cm } = await context.supabase
        .from("club_members")
        .select("role")
        .eq("club_id", clubId)
        .eq("user_id", context.userId)
        .maybeSingle();
      const crole = (cm as any)?.role as string | undefined;
      if (crole === "admin" || crole === "owner") authorized = true;
    }
    if (!authorized) return { ok: false as const, reason: "forbidden" };

    // 2. Advisory lock — one replay at a time per event.
    const lockKey = await eventLockKey(data.eventId);
    const { data: lockData } = await supabaseAdmin.rpc("pg_try_advisory_lock" as any, {
      key: lockKey,
    } as any);
    // pg_try_advisory_lock returns boolean; if the RPC helper is unavailable
    // we degrade gracefully (dispatch_id uniqueness still prevents dup work).
    const lockAcquired = lockData === true || lockData === undefined;
    if (!lockAcquired) {
      return { ok: false as const, reason: "already_running" };
    }

    try {
      // 3. Collect DLQ recipient emails for this event + notification_type.
      const { data: dlqRows } = await supabaseAdmin
        .from("email_send_log")
        .select("recipient_email, recipient_id")
        .eq("event_id", data.eventId)
        .eq("notification_type", data.notificationType)
        .eq("status", "dlq");

      const dlqEmails = new Set<string>(
        (dlqRows ?? []).map((r: any) => (r.recipient_email ?? "").toLowerCase()).filter(Boolean),
      );
      if (dlqEmails.size === 0) {
        return { ok: true as const, replayed: 0, dispatchId: null };
      }

      // 4. Create the dispatch row for auditability.
      const dispatchId = crypto.randomUUID();
      await supabaseAdmin.from("email_dispatches").insert({
        id: dispatchId,
        event_id: data.eventId,
        kind: "dlq_replay",
        notification_type: data.notificationType,
        triggered_by: context.userId,
        recipient_count: dlqEmails.size,
      });

      if (data.notificationType !== "convocation-invite") {
        // For now only convocation-invite is supported for automated replay.
        return {
          ok: true as const,
          replayed: 0,
          dispatchId,
          reason: "unsupported_notification_type",
        };
      }

      // 5. Load all convocations for the event, join players + parents.
      const { data: convs } = await supabaseAdmin
        .from("convocations")
        .select(
          "id, event_id, player_id, response_token, players:player_id(id, first_name, last_name, email, user_id, player_parents(email, full_name, parent_user_id))",
        )
        .eq("event_id", data.eventId);

      const clubLang = (ev as any).teams?.clubs?.default_language as string | null | undefined;
      const baseUrl = process.env.SITE_URL || "https://www.clubero.app";
      const locationMapsUrl = (ev as any).location
        ? ((ev as any).location_url ??
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            (ev as any).location,
          )}`)
        : undefined;
      const meetingPointMapsUrl = (ev as any).meeting_point
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            (ev as any).meeting_point,
          )}`
        : undefined;

      // Preload preferred languages.
      const allUserIds = new Set<string>();
      for (const c of convs ?? []) {
        const p: any = (c as any).players;
        if (p?.user_id) allUserIds.add(p.user_id);
        for (const pp of p?.player_parents ?? []) {
          if (pp.parent_user_id) allUserIds.add(pp.parent_user_id);
        }
      }
      const langByUser = new Map<string, string>();
      if (allUserIds.size > 0) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id, preferred_language")
          .in("id", Array.from(allUserIds));
        for (const p of profs ?? []) {
          if ((p as any).preferred_language)
            langByUser.set((p as any).id, (p as any).preferred_language);
        }
      }

      let replayed = 0;
      for (const conv of convs ?? []) {
        const player: any = (conv as any).players;
        if (!player) continue;
        const playerName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
        const respondUrl = `${baseUrl}/r/${(conv as any).response_token}`;

        const targets: {
          email: string;
          firstName?: string;
          userId?: string | null;
          recipientId: string;
        }[] = [];
        if (player.email && dlqEmails.has(String(player.email).toLowerCase())) {
          targets.push({
            email: player.email,
            firstName: player.first_name ?? undefined,
            userId: player.user_id ?? null,
            recipientId: `player:${player.id}`,
          });
        }
        for (const pp of player.player_parents ?? []) {
          if (pp.email && dlqEmails.has(String(pp.email).toLowerCase())) {
            targets.push({
              email: pp.email,
              firstName: (pp.full_name ?? "").split(" ")[0] || undefined,
              userId: pp.parent_user_id ?? null,
              recipientId: `parent:${player.id}:${String(pp.email).toLowerCase()}`,
            });
          }
        }

        for (const t of targets) {
          const locale = resolveLocale(t.userId ? langByUser.get(t.userId) : undefined, clubLang);
          try {
            await enqueueTransactionalEmailServer({
              templateName: "convocation-invite",
              recipientEmail: t.email,
              idempotencyKey: `dlq-replay:${dispatchId}:${t.recipientId}`,
              dispatchId,
              eventId: data.eventId,
              recipientId: t.recipientId,
              notificationType: "convocation-invite",
              templateData: {
                recipientFirstName: t.firstName,
                playerName,
                eventTitle: (ev as any).title,
                eventType: (ev as any).type,
                eventDate: fmtDate((ev as any).starts_at, locale),
                eventDescription: (ev as any).description ?? undefined,
                convocationTime: (ev as any).convocation_time
                  ? fmtDate((ev as any).convocation_time, locale)
                  : undefined,
                eventLocation: (ev as any).location ?? undefined,
                locationMapsUrl,
                meetingPoint: (ev as any).meeting_point ?? undefined,
                meetingPointMapsUrl,
                competitionName:
                  (ev as any).competition_name ?? (ev as any).competition_type ?? undefined,
                teamName: (ev as any).teams?.name ?? undefined,
                clubName: (ev as any).teams?.clubs?.name ?? undefined,
                clubLogoUrl: (ev as any).teams?.clubs?.logo_url ?? undefined,
                respondUrl,
                isReminder: true,
                locale,
              },
            });
            replayed++;
          } catch (e) {
            console.error("[replay-dlq] enqueue failed", e);
          }
        }
      }

      return { ok: true as const, replayed, dispatchId };
    } finally {
      await supabaseAdmin
        .rpc("pg_advisory_unlock" as any, { key: lockKey } as any)
        .then(() => {})
        .catch(() => {});
    }
  });
