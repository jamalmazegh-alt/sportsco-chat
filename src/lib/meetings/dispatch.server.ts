import { resolveClubTz } from "@/lib/time/club-tz";
/**
 * Dispatcher pour les convocations de réunion (interne).
 * Envoie in-app + push + e-mail aux nouveaux convoqués uniquement.
 * Best-effort : les erreurs de push/e-mail ne bloquent jamais l'invitation.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

export interface DispatchMeetingConvocationParams {
  eventId: string;
  /** Uniquement les NOUVEAUX convoqués — jamais toute la liste. */
  recipientUserIds: string[];
  /**
   * Renvoi manuel : suffixe la clé d'idempotence e-mail avec un horodatage
   * afin de contourner la déduplication et forcer l'envoi.
   */
  resend?: boolean;
}

export async function dispatchMeetingConvocation(
  params: DispatchMeetingConvocationParams,
): Promise<{ dispatched: number }> {
  const uids = Array.from(new Set(params.recipientUserIds.filter(Boolean)));
  if (uids.length === 0) return { dispatched: 0 };

  // Contexte réunion + club (pour brand fromName).
  const { data: ev } = await supabaseAdmin
    .from("events")
    .select(
      "id, title, starts_at, location, team_id, teams:team_id(club_id, clubs:club_id(name, timezone))",
    )
    .eq("id", params.eventId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evRow = ev as any;
  const meetingTitle = (evRow?.title as string | null) ?? "Réunion";
  const startsAt = (evRow?.starts_at as string | null) ?? null;
  const location = (evRow?.location as string | null) ?? null;
  const clubName = (evRow?.teams?.clubs?.name as string | null) ?? null;
  const clubTz = resolveClubTz((evRow?.teams?.clubs?.timezone as string | null) ?? null);

  const link = `/events/${params.eventId}`;
  const bodyText = "Vous êtes convoqué(e) à cette réunion.";

  // 1) In-app
  try {
    const { error } = await supabaseAdmin.from("notifications").insert(
      uids.map((uid) => ({
        user_id: uid,
        type: "convocation",
        title: meetingTitle,
        body: bodyText,
        link,
      })),
    );
    if (error) console.error("[meetings dispatch] notifications insert failed", error);
  } catch (e) {
    console.error("[meetings dispatch] notifications insert threw", e);
  }

  // 2) Push (best-effort)
  try {
    const { sendPushToUser } = await import("@/lib/push-send.server");
    await Promise.allSettled(
      uids.map((uid) =>
        sendPushToUser(uid, {
          title: meetingTitle,
          body: bodyText,
          url: link,
          tag: `meeting-${params.eventId}`,
        }),
      ),
    );
  } catch (e) {
    console.warn("[meetings dispatch] push failed", e);
  }

  // 3) E-mail — best-effort, une entrée par destinataire, idempotent via key.
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, preferred_language")
    .in("id", uids);
  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p as { first_name: string | null; preferred_language: string | null },
    ]),
  );

  // Récupère les tokens de réponse pour cet événement / ces convoqués.
  const { data: attendees } = await supabaseAdmin
    .from("meeting_attendees")
    .select("user_id, response_token")
    .eq("event_id", params.eventId)
    .in("user_id", uids);
  const tokenByUid = new Map<string, string>();
  for (const row of attendees ?? []) {
    if (row.user_id && row.response_token) {
      tokenByUid.set(row.user_id as string, row.response_token as string);
    }
  }

  const baseUrl = process.env.SITE_URL || "https://www.clubero.app";

  let dispatched = 0;
  for (const uid of uids) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
      const email = userData?.user?.email;
      if (!email) continue;
      const p = profileById.get(uid);
      const locale = (p?.preferred_language ?? "fr").toLowerCase().slice(0, 2);
      const token = tokenByUid.get(uid);
      const respondUrl = token ? `${baseUrl}/rm/${token}` : null;
      const idempotencyKey = params.resend
        ? `meeting-invite-${params.eventId}-${uid}-resend-${Date.now()}`
        : `meeting-invite-${params.eventId}-${uid}`;
      await enqueueTransactionalEmailServer({
        templateName: "meeting-invite",
        recipientEmail: email,
        idempotencyKey,
        dispatchId: params.eventId,
        eventId: params.eventId,
        recipientId: uid,
        notificationType: "meeting_invite",
        fromName: clubName ? `${clubName} via Clubero` : undefined,
        templateData: {
          displayName: p?.first_name ?? null,
          locale,
          meetingTitle,
          meetingStartsAt: startsAt,
          location,
          clubName,
          tz: clubTz,
          eventUrl: link,
          respondUrl,
        },
      });
      dispatched++;
    } catch (e) {
      console.error("[meetings dispatch] email failed", {
        uid,
        error: (e as Error).message,
      });
    }
  }

  return { dispatched };
}

export interface DispatchMeetingRemovalParams {
  eventId: string;
  /** Uniquement les personnes RÉELLEMENT retirées. */
  recipientUserIds: string[];
}

/**
 * Notifie in-app + push + e-mail les personnes retirées d'une réunion.
 * Best-effort — n'échoue jamais le flux appelant.
 */
export async function dispatchMeetingRemoval(
  params: DispatchMeetingRemovalParams,
): Promise<{ dispatched: number }> {
  const uids = Array.from(new Set(params.recipientUserIds.filter(Boolean)));
  if (uids.length === 0) return { dispatched: 0 };

  const { data: ev } = await supabaseAdmin
    .from("events")
    .select("id, title, teams:team_id(club_id, clubs:club_id(name, timezone))")
    .eq("id", params.eventId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evRow = ev as any;
  const meetingTitle = (evRow?.title as string | null) ?? "Réunion";
  const clubName = (evRow?.teams?.clubs?.name as string | null) ?? null;
  const clubTz = resolveClubTz((evRow?.teams?.clubs?.timezone as string | null) ?? null);

  const link = `/events/${params.eventId}`;
  const bodyText = "Vous n'êtes plus convoqué(e) à cette réunion.";

  // 1) In-app
  try {
    const { error } = await supabaseAdmin.from("notifications").insert(
      uids.map((uid) => ({
        user_id: uid,
        type: "convocation",
        title: meetingTitle,
        body: bodyText,
        link,
      })),
    );
    if (error) console.error("[meetings dispatch] removal notifications insert failed", error);
  } catch (e) {
    console.error("[meetings dispatch] removal notifications insert threw", e);
  }

  // 2) Push
  try {
    const { sendPushToUser } = await import("@/lib/push-send.server");
    await Promise.allSettled(
      uids.map((uid) =>
        sendPushToUser(uid, {
          title: meetingTitle,
          body: bodyText,
          url: link,
          tag: `meeting-removed-${params.eventId}`,
        }),
      ),
    );
  } catch (e) {
    console.warn("[meetings dispatch] removal push failed", e);
  }

  // 3) E-mail — idempotence par (event, uid, timestamp minute) pour permettre
  // qu'une personne retirée / ré-invitée / re-retirée puisse être re-notifiée.
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, preferred_language")
    .in("id", uids);
  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p as { first_name: string | null; preferred_language: string | null },
    ]),
  );
  const stamp = new Date().toISOString().slice(0, 16); // minute granularity

  let dispatched = 0;
  for (const uid of uids) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
      const email = userData?.user?.email;
      if (!email) continue;
      const p = profileById.get(uid);
      const locale = (p?.preferred_language ?? "fr").toLowerCase().slice(0, 2);
      await enqueueTransactionalEmailServer({
        templateName: "meeting-removed",
        recipientEmail: email,
        idempotencyKey: `meeting-removed-${params.eventId}-${uid}-${stamp}`,
        dispatchId: params.eventId,
        eventId: params.eventId,
        recipientId: uid,
        notificationType: "meeting_removed",
        fromName: clubName ? `${clubName} via Clubero` : undefined,
        templateData: {
          displayName: p?.first_name ?? null,
          locale,
          meetingTitle,
          clubName,
          tz: clubTz,
          eventUrl: link,
        },
      });
      dispatched++;
    } catch (e) {
      console.error("[meetings dispatch] removal email failed", {
        uid,
        error: (e as Error).message,
      });
    }
  }

  return { dispatched };
}
