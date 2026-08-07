import { resolveClubTz } from "@/lib/time/club-tz";
/**
 * Replay convocation emails that reached the DLQ for a given event.
 *
 * Idempotency model — preserves the ORIGINAL dispatch_id of every DLQ row.
 * A DLQ replay MUST NOT open a new dispatch, otherwise a recipient that
 * eventually delivered on the initial dispatch would be re-emailed under a
 * different campaign key and the unique index
 * `email_send_log_dispatch_recipient_success` (dispatch_id, recipient_id,
 * notification_type) would not catch the duplicate.
 *
 * Guards:
 *  - Postgres advisory lock keyed on the event → two concurrent replays
 *    cannot proceed at the same time.
 *  - Per-row: skip if a `sent`/`delivered` row already exists for
 *    (dispatch_id, recipient_id, notification_type).
 *  - Per-row: skip if a fresher `pending`/`processing` row exists (a retry
 *    is already in flight).
 *  - Rows missing dispatch_id or recipient_id are counted as
 *    `skipped_no_dispatch` and NOT replayed (they belong to the old model
 *    and are ambiguous).
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

async function eventLockKey(eventId: string): Promise<number> {
  const buf = new TextEncoder().encode(eventId);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const view = new DataView(digest);
  return view.getInt32(0, false);
}

async function authorize(context: any, eventId: string, userId: string) {
  const { data: ev } = await context.supabase
    .from("events")
    .select("id, team_id, teams:team_id(club_id)")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return { authorized: false as const, reason: "not_found" as const };
  const teamId = (ev as any).team_id as string | null;
  const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
  if (teamId) {
    const { data: tm } = await context.supabase
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = (tm as any)?.role as string | undefined;
    if (role === "coach" || role === "assistant_coach") return { authorized: true as const };
  }
  if (clubId) {
    const { data: cm } = await context.supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle();
    const crole = (cm as any)?.role as string | undefined;
    if (crole === "admin" || crole === "owner" || crole === "dirigeant")
      return { authorized: true as const };
  }
  return { authorized: false as const, reason: "forbidden" as const };
}

export type ReplayReport = {
  ok: boolean;
  reason?: string;
  candidates: number;
  replayed: number;
  skippedAlreadyDelivered: number;
  skippedInFlight: number;
  skippedNoDispatch: number;
  errors: number;
};

/**
 * Preview only — returns the same counters without enqueuing anything.
 * Used to show the user "X in DLQ / Y replayable / Z ignored" before they
 * confirm the replay.
 */
export const previewReplayEventDlq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const auth = await authorize(context, data.eventId, context.userId);
    if (!auth.authorized) return { ok: false, reason: auth.reason } as const;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await computePlan(supabaseAdmin, data.eventId, data.notificationType);
  });

export async function computePlan(
  supabaseAdmin: any,
  eventId: string,
  notificationType: string,
): Promise<{
  ok: true;
  candidates: number;
  replayable: number;
  skippedAlreadyDelivered: number;
  skippedInFlight: number;
  skippedNoDispatch: number;
  rows: Array<{
    dispatch_id: string;
    recipient_id: string;
    recipient_email: string;
    reason?: string;
  }>;
}> {
  const { data: dlqRows } = await supabaseAdmin
    .from("email_send_log")
    .select("dispatch_id, recipient_id, recipient_email, notification_type, created_at")
    .eq("event_id", eventId)
    .eq("notification_type", notificationType)
    .eq("status", "dlq");

  const rows: any[] = dlqRows ?? [];
  let skippedNoDispatch = 0;
  let skippedAlreadyDelivered = 0;
  let skippedInFlight = 0;
  const replayable: any[] = [];

  for (const row of rows) {
    if (!row.dispatch_id || !row.recipient_id) {
      skippedNoDispatch++;
      continue;
    }
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
      skippedAlreadyDelivered++;
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
      skippedInFlight++;
      continue;
    }
    replayable.push(row);
  }

  return {
    ok: true as const,
    candidates: rows.length,
    replayable: replayable.length,
    skippedAlreadyDelivered,
    skippedInFlight,
    skippedNoDispatch,
    rows: replayable.map((r) => ({
      dispatch_id: r.dispatch_id,
      recipient_id: r.recipient_id,
      recipient_email: r.recipient_email,
    })),
  };
}

export const replayEventDlq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<ReplayReport> => {
    const auth = await authorize(context, data.eventId, context.userId);
    if (!auth.authorized) {
      return {
        ok: false,
        reason: auth.reason,
        candidates: 0,
        replayed: 0,
        skippedAlreadyDelivered: 0,
        skippedInFlight: 0,
        skippedNoDispatch: 0,
        errors: 0,
      };
    }

    // Only convocation-invite is supported for automated replay for now;
    // other templates would need a template-data reconstruction path.
    if (data.notificationType !== "convocation-invite") {
      return {
        ok: false,
        reason: "unsupported_notification_type",
        candidates: 0,
        replayed: 0,
        skippedAlreadyDelivered: 0,
        skippedInFlight: 0,
        skippedNoDispatch: 0,
        errors: 0,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    // Advisory lock — serializes concurrent replays on the same event.
    const lockKey = await eventLockKey(data.eventId);
    const { data: lockData } = await supabaseAdmin.rpc(
      "pg_try_advisory_lock" as any,
      {
        key: lockKey,
      } as any,
    );
    const lockAcquired = lockData === true || lockData === undefined;
    if (!lockAcquired) {
      return {
        ok: false,
        reason: "already_running",
        candidates: 0,
        replayed: 0,
        skippedAlreadyDelivered: 0,
        skippedInFlight: 0,
        skippedNoDispatch: 0,
        errors: 0,
      };
    }

    let unlockErr: unknown = null;
    try {
      // Compute the plan — re-checks delivery/in-flight state inside the lock.
      const plan = await computePlan(supabaseAdmin, data.eventId, data.notificationType);
      if (plan.rows.length === 0) {
        return {
          ok: true,
          candidates: plan.candidates,
          replayed: 0,
          skippedAlreadyDelivered: plan.skippedAlreadyDelivered,
          skippedInFlight: plan.skippedInFlight,
          skippedNoDispatch: plan.skippedNoDispatch,
          errors: 0,
        };
      }

      // Load event + convocations to rebuild template data.
      const { data: ev } = await supabaseAdmin
        .from("events")
        .select(
          "id, title, type, starts_at, location, location_url, meeting_point, convocation_time, description, team_id, competition_name, competition_type, teams:team_id(name, club_id, clubs:club_id(name, logo_url, default_language, timezone))",
        )
        .eq("id", data.eventId)
        .maybeSingle();
      if (!ev) {
        return {
          ok: false,
          reason: "not_found",
          candidates: plan.candidates,
          replayed: 0,
          skippedAlreadyDelivered: plan.skippedAlreadyDelivered,
          skippedInFlight: plan.skippedInFlight,
          skippedNoDispatch: plan.skippedNoDispatch,
          errors: 0,
        };
      }

      const { data: convs } = await supabaseAdmin
        .from("convocations")
        .select(
          "id, event_id, player_id, response_token, players:player_id(id, first_name, last_name, email, user_id, player_parents(email, full_name, parent_user_id))",
        )
        .eq("event_id", data.eventId);

      // Index convocations by player_id → response_token + players.
      const convByPlayer = new Map<string, any>();
      for (const c of convs ?? []) convByPlayer.set((c as any).player_id, c);

      const clubLang = (ev as any).teams?.clubs?.default_language as string | null | undefined;

      const clubTz = resolveClubTz((ev as any).teams?.clubs?.timezone as string | null | undefined);
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

      // Preferred languages for user-linked recipients.
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

      let replayed = 0;
      let errors = 0;

      for (const row of plan.rows) {
        // Parse recipient_id shape → player:<id> | parent:<player_id>:<email> | parent-uid:<player_id>:<uid>
        const parts = row.recipient_id.split(":");
        const kind = parts[0];
        const playerId = parts[1];
        const conv = convByPlayer.get(playerId);
        if (!conv) {
          errors++;
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
            // Reuse the ORIGINAL dispatch_id — this is the whole point.
            dispatchId: row.dispatch_id,
            eventId: data.eventId,
            recipientId: row.recipient_id,
            notificationType: "convocation-invite",
            idempotencyKey: `dlq-replay:${row.dispatch_id}:${row.recipient_id}`,
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
              tz: clubTz,
            },
          });
          replayed++;
        } catch (e) {
          console.error("[replay-dlq] enqueue failed", {
            dispatch_id: row.dispatch_id,
            recipient_id: row.recipient_id,
            error: e instanceof Error ? e.message : String(e),
          });
          errors++;
        }
      }

      return {
        ok: true,
        candidates: plan.candidates,
        replayed,
        skippedAlreadyDelivered: plan.skippedAlreadyDelivered,
        skippedInFlight: plan.skippedInFlight,
        skippedNoDispatch: plan.skippedNoDispatch,
        errors,
      };
    } finally {
      // Best-effort unlock. Any error here does NOT change the outcome of
      // the replay itself — connection close would drop the lock anyway.
      try {
        await supabaseAdmin.rpc("pg_advisory_unlock" as any, { key: lockKey } as any);
      } catch (e) {
        unlockErr = e;
        console.warn("[replay-dlq] advisory unlock failed", e);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      unlockErr;
    }
  });
