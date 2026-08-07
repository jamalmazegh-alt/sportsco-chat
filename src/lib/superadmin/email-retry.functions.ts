/**
 * Superadmin — Retry an entire dispatch (or a specific subset of rows)
 * without duplicating sends.
 *
 * Idempotency:
 *  - Reuses the ORIGINAL (dispatch_id, recipient_id, notification_type) key.
 *  - Skips rows whose latest status is already `sent`/`delivered`.
 *  - Skips rows whose latest status is `pending`/`processing` (in flight).
 *  - Skips rows without dispatch_id or recipient_id (legacy, ambiguous).
 *  - The DB unique index `email_send_log_dispatch_recipient_success`
 *    guarantees no duplicate delivery even under a race.
 *
 * Scope: currently supports `convocation-invite` templates only, because
 * that is where we can deterministically rebuild templateData from
 * `convocations` + `events`. Other templates return `unsupported_template`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  dispatchId: z.string().uuid(),
  /** Optional filter: only retry these email_send_log row IDs. */
  logRowIds: z.array(z.string().uuid()).max(500).optional(),
});

const SUPPORTED_TEMPLATES = new Set(["convocation-invite"]);
const RETRYABLE_STATUSES = new Set(["failed", "dlq"]);
const SKIP_STATUSES = new Set(["sent", "delivered", "pending", "processing"]);
const SUPPORTED_LOCALES = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);

function resolveLocale(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = (c ?? "").toLowerCase().slice(0, 2);
    if (SUPPORTED_LOCALES.has(v)) return v;
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

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export type SuperadminRetryReport = {
  ok: boolean;
  reason?: string;
  candidates: number;
  replayed: number;
  skippedAlreadyDelivered: number;
  skippedInFlight: number;
  skippedNoDispatch: number;
  skippedNotRetryable: number;
  errors: number;
};

/**
 * Retry all retryable rows of a dispatch (or the subset identified by
 * `logRowIds`), without duplicating sends.
 */
export const superadminRetryDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<SuperadminRetryReport> => {
    await assertSuperAdmin(context.userId);

    const empty: SuperadminRetryReport = {
      ok: true,
      candidates: 0,
      replayed: 0,
      skippedAlreadyDelivered: 0,
      skippedInFlight: 0,
      skippedNoDispatch: 0,
      skippedNotRetryable: 0,
      errors: 0,
    };

    // 1) Load dispatch metadata.
    const { data: dispatch } = await supabaseAdmin
      .from("email_dispatches")
      .select("id, event_id, template_name")
      .eq("id", data.dispatchId)
      .maybeSingle();
    if (!dispatch) return { ...empty, ok: false, reason: "not_found" };
    if (!SUPPORTED_TEMPLATES.has((dispatch as any).template_name)) {
      return { ...empty, ok: false, reason: "unsupported_template" };
    }
    const eventId = (dispatch as any).event_id as string | null;
    if (!eventId) return { ...empty, ok: false, reason: "no_event" };
    const notificationType = "convocation-invite";

    // 2) Fetch all log rows for the dispatch (DESC), then dedup by message_id
    //    to get the latest status per email.
    const { data: allRows } = await supabaseAdmin
      .from("email_send_log")
      .select(
        "id, message_id, dispatch_id, recipient_id, recipient_email, notification_type, status, created_at",
      )
      .eq("dispatch_id", data.dispatchId)
      .order("created_at", { ascending: false });

    const latestByMsg = new Map<string, any>();
    const orphans: any[] = [];
    for (const r of allRows ?? []) {
      if (!(r as any).message_id) {
        orphans.push(r);
        continue;
      }
      const key = (r as any).message_id as string;
      if (!latestByMsg.has(key)) latestByMsg.set(key, r);
    }
    let candidates = [...latestByMsg.values(), ...orphans];

    // Optional subset filter.
    if (data.logRowIds && data.logRowIds.length > 0) {
      const set = new Set(data.logRowIds);
      candidates = candidates.filter((r) => set.has((r as any).id));
    }

    const report: SuperadminRetryReport = { ...empty };
    report.candidates = candidates.length;

    // 3) Determine which rows are retryable.
    const retryable: any[] = [];
    for (const row of candidates) {
      const status = (row as any).status as string;
      if (SKIP_STATUSES.has(status)) {
        if (status === "sent" || status === "delivered") report.skippedAlreadyDelivered++;
        else report.skippedInFlight++;
        continue;
      }
      if (!RETRYABLE_STATUSES.has(status)) {
        // bounced, complained, suppressed → do NOT retry (recipient invalid).
        report.skippedNotRetryable++;
        continue;
      }
      if (!(row as any).dispatch_id || !(row as any).recipient_id) {
        report.skippedNoDispatch++;
        continue;
      }
      retryable.push(row);
    }

    if (retryable.length === 0) return report;

    // 4) Re-check freshest state per (dispatch_id, recipient_id) to avoid
    //    racing with an in-flight retry.
    const stillRetryable: any[] = [];
    for (const row of retryable) {
      const { data: delivered } = await supabaseAdmin
        .from("email_send_log")
        .select("id")
        .eq("dispatch_id", row.dispatch_id)
        .eq("recipient_id", row.recipient_id)
        .eq("notification_type", notificationType)
        .in("status", ["sent", "delivered"])
        .limit(1)
        .maybeSingle();
      if (delivered) {
        report.skippedAlreadyDelivered++;
        continue;
      }
      const { data: inFlight } = await supabaseAdmin
        .from("email_send_log")
        .select("id")
        .eq("dispatch_id", row.dispatch_id)
        .eq("recipient_id", row.recipient_id)
        .eq("notification_type", notificationType)
        .in("status", ["pending", "processing"])
        .gt("created_at", row.created_at)
        .limit(1)
        .maybeSingle();
      if (inFlight) {
        report.skippedInFlight++;
        continue;
      }
      stillRetryable.push(row);
    }

    if (stillRetryable.length === 0) return report;

    // 5) Rebuild templateData from event + convocations, then re-enqueue,
    //    reusing the original (dispatch_id, recipient_id) key.
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select(
        "id, title, type, starts_at, location, location_url, meeting_point, convocation_time, description, team_id, competition_name, competition_type, teams:team_id(name, club_id, clubs:club_id(name, logo_url, default_language, timezone))",
      )
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return { ...report, ok: false, reason: "event_not_found" };

    const { data: convs } = await supabaseAdmin
      .from("convocations")
      .select(
        "id, event_id, player_id, response_token, players:player_id(id, first_name, last_name, email, user_id, player_parents(email, full_name, parent_user_id))",
      )
      .eq("event_id", eventId);
    const convByPlayer = new Map<string, any>();
    for (const c of convs ?? []) convByPlayer.set((c as any).player_id, c);

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

    const userIds = new Set<string>();
    for (const c of convs ?? []) {
      const p: any = (c as any).players;
      if (p?.user_id) userIds.add(p.user_id);
      for (const pp of p?.player_parents ?? []) {
        if (pp.parent_user_id) userIds.add(pp.parent_user_id);
      }
    }
    const langByUser = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, preferred_language")
        .in("id", Array.from(userIds));
      for (const p of profs ?? []) {
        if ((p as any).preferred_language)
          langByUser.set((p as any).id, (p as any).preferred_language);
      }
    }

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    for (const row of stillRetryable) {
      const recipientId = row.recipient_id as string;
      const parts = recipientId.split(":");
      const kind = parts[0];
      const playerId = parts[1];
      const conv = convByPlayer.get(playerId);
      if (!conv) {
        report.errors++;
        continue;
      }
      const player = (conv as any).players;
      const playerName = `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim();
      const respondUrl = `${baseUrl}/r/${conv.response_token}`;

      let firstName: string | undefined;
      let userIdForLocale: string | null | undefined;
      if (kind === "player") {
        firstName = player?.first_name ?? undefined;
        userIdForLocale = player?.user_id;
      } else if (kind === "parent" || kind === "parent-uid") {
        const parent = (player?.player_parents ?? []).find((pp: any) => {
          if (kind === "parent") {
            return (pp.email ?? "").toLowerCase() === parts.slice(2).join(":");
          }
          return pp.parent_user_id === parts.slice(2).join(":");
        });
        firstName = (parent?.full_name ?? "").split(" ")[0] || undefined;
        userIdForLocale = parent?.parent_user_id;
      }

      const locale = resolveLocale(
        userIdForLocale ? langByUser.get(userIdForLocale) : undefined,
        clubLang,
      );

      try {
        await enqueueTransactionalEmailServer({
          templateName: "convocation-invite",
          recipientEmail: row.recipient_email,
          fromName: `${(ev as any).teams?.clubs?.name ?? "Clubero"} via Clubero`,
          dispatchId: row.dispatch_id,
          eventId,
          recipientId,
          notificationType,
          idempotencyKey: `superadmin-retry:${row.dispatch_id}:${recipientId}`,
          templateData: {
            recipientFirstName: firstName,
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
        report.replayed++;
      } catch (e) {
        console.error("[superadmin-retry] enqueue failed", {
          dispatch_id: row.dispatch_id,
          recipient_id: recipientId,
          error: e instanceof Error ? e.message : String(e),
        });
        report.errors++;
      }
    }

    return report;
  });
