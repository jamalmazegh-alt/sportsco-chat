import { resolveClubTz } from "@/lib/time/club-tz";
/**
 * LOT 1 / Phase A — Dispatch push + email pour les besoins événementiels.
 *
 * TOUJOURS appelé APRÈS commit (aucune notification avant écriture). Toutes
 * les lectures se font en service_role car les destinataires / signups sont
 * staff-only côté RLS. Aucun agrégat de convoqués ou de liste de destinataires
 * n'est renvoyé côté client — cette couche n'écrit que push/email sortants.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

/* ------------------------------------------------------------------------ */
/* Publication : notifie tous les destinataires                             */
/* ------------------------------------------------------------------------ */

export interface DispatchPublicationParams {
  needId: string;
  publicationId: string;
  recipientUserIds: string[];
}

export async function dispatchEventNeedPublication(params: DispatchPublicationParams) {
  if (params.recipientUserIds.length === 0) return { dispatched: 0 };

  const { data: need } = await supabaseAdmin
    .from("event_needs")
    .select(
      "id, label, capacity, validation_mode, event_id, events:event_id(id, title, starts_at, team_id, teams:team_id(name, club_id, clubs:club_id(name, timezone)))",
    )
    .eq("id", params.needId)
    .maybeSingle();
  if (!need) return { dispatched: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = (need as any).events;
  const eventTitle = (ev?.title as string) ?? "Événement";
  const startsAt = ev?.starts_at as string | null;
  const teamName = (ev?.teams?.name as string | null) ?? null;
  const clubName = (ev?.teams?.clubs?.name as string | null) ?? null;
  const clubTz = resolveClubTz((ev?.teams?.clubs?.timezone as string | null) ?? null);

  // Push fanout
  try {
    const { sendPushToUser } = await import("@/lib/push-send.server");
    const title = `${need.label} — ${teamName ?? clubName ?? "Club"}`;
    const dateStr = startsAt
      ? new Date(startsAt).toLocaleDateString("fr-FR", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: clubTz,
        })
      : "";
    const timeStr = startsAt
      ? new Date(startsAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: clubTz,
      })
      : "";
    const body = startsAt
      ? `Nouveau coup de main demandé pour ${eventTitle} — ${dateStr} à ${timeStr}`
      : `Nouveau coup de main demandé pour ${eventTitle}`;
    await Promise.allSettled(
      params.recipientUserIds.map((uid) =>
        sendPushToUser(uid, {
          title,
          body,
          url: `/events/${need.event_id}#need-${need.id}`,
          tag: `event-need-${need.id}`,
        }),
      ),
    );
  } catch (e) {
    console.error("[needs dispatch] push failed", e);
  }

  // Email fanout — lookup emails via profiles(id).
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, preferred_language")
    .in("id", params.recipientUserIds);
  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p as { first_name: string | null; preferred_language: string | null },
    ]),
  );

  // Get emails from auth.users via admin.listUsers is expensive; use RPC or
  // profiles table if it stored email. Here we rely on the auth admin API
  // for correctness (small audiences typically).
  let dispatched = 0;
  for (const uid of params.recipientUserIds) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
      const email = userData?.user?.email;
      if (!email) continue;
      const p = profileById.get(uid);
      await enqueueTransactionalEmailServer({
        templateName: "event-need-invite",
        recipientEmail: email,
        idempotencyKey: `need-publish-${params.publicationId}-${uid}`,
        dispatchId: params.publicationId,
        eventId: need.event_id,
        recipientId: uid,
        notificationType: "event_need_publication",
        fromName: clubName ? `${clubName} via Clubero` : undefined,
        templateData: {
          recipientFirstName: p?.first_name ?? null,
          locale: (p?.preferred_language ?? "fr").startsWith("en") ? "en" : "fr",
          needLabel: need.label,
          eventTitle,
          eventStartsAt: startsAt,
          teamName,
          clubName,
          capacity: need.capacity,
          validationMode: need.validation_mode,
          eventUrl: `/events/${need.event_id}`,
        },
      });
      dispatched++;
    } catch (e) {
      console.error("[needs dispatch] email failed", { uid, error: (e as Error).message });
    }
  }
  return { dispatched };
}

/* ------------------------------------------------------------------------ */
/* Signup received — notifier le staff (push seulement, pas de PII)         */
/* ------------------------------------------------------------------------ */

export interface NotifyStaffOfSignupParams {
  needId: string;
  signupId: string;
  status: "applied" | "confirmed";
  applicantUserId: string;
}

export async function notifyStaffOfSignup(params: NotifyStaffOfSignupParams) {
  const { data: need } = await supabaseAdmin
    .from("event_needs")
    .select(
      "id, label, club_id, event_id, created_by, events:event_id(id, title, starts_at, type, opponent, is_home, team_id, teams:team_id(name, clubs:club_id(name, timezone)))",
    )
    .eq("id", params.needId)
    .maybeSingle();
  if (!need) return;

  const { data: staff } = await supabaseAdmin
    .from("club_members")
    .select("user_id, role, roles")
    .eq("club_id", need.club_id);
  const staffUserIds = (staff ?? [])
    .filter((m) => {
      const rs = (m.roles as string[] | null) ?? [];
      const r = (m.role as string | null) ?? "";
      const set = new Set<string>([...rs, r].filter(Boolean));
      return (
        set.has("admin") ||
        set.has("owner") ||
        set.has("coach") ||
        set.has("assistant_coach") ||
        set.has("staff") ||
        set.has("dirigeant")
      );
    })
    .map((m) => m.user_id as string)
    .filter(Boolean);

  if (staffUserIds.length === 0) return;

  // Fetch applicant profile for first name.
  const { data: applicantProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name")
    .eq("id", params.applicantUserId)
    .maybeSingle();
  const applicantFirstName = (applicantProfile?.first_name as string | null) ?? "Quelqu'un";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = (need as any).events;
  const eventTitle = (ev?.title as string) ?? "Événement";
  const isMatch = (ev?.type as string) === "match";
  const opponent = (ev?.opponent as string | null) ?? null;
  const teamName = (ev?.teams?.name as string | null) ?? null;
  const isHome = ev?.is_home as boolean | null | undefined;
  const clubTz = resolveClubTz((ev?.teams?.clubs?.timezone as string | null) ?? null);


  let matchLine = eventTitle;
  if (isMatch && teamName) {
    const homeTeam = isHome === false ? opponent : teamName;
    const awayTeam = isHome === false ? teamName : opponent;
    if (opponent) {
      matchLine = `${homeTeam} vs ${awayTeam}`;
    } else {
      matchLine = `Match — ${teamName}`;
    }
  }

  const { sendPushToUser } = await import("@/lib/push-send.server");
  const roleLabel = (need.label as string | null) ?? "";
  const title =
    params.status === "confirmed"
      ? `✅ Volontaire confirmé${roleLabel ? ` · ${roleLabel}` : ""}`
      : `📝 Nouvelle candidature${roleLabel ? ` · ${roleLabel}` : ""}`;
  const startsAt = ev?.starts_at as string | null;
  const dateStr = startsAt
    ? new Date(startsAt).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: clubTz,
      })
    : "";
  const timeStr = startsAt
    ? new Date(startsAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: clubTz,
      })
    : "";
  const body = startsAt
    ? `${matchLine} — ${dateStr} à ${timeStr} — ${applicantFirstName}`
    : `${matchLine} — ${applicantFirstName}`;
  await Promise.allSettled(
    staffUserIds.map((uid) =>
      sendPushToUser(uid, {
        title,
        body,
        url: `/events/${need.event_id}#need-${need.id}`,
        tag: `event-need-signup-${need.id}`,
      }),
    ),
  );

  // Email au créateur du besoin (le staff qui a publié) — garantit un canal
  // sortant même sans PWA/push installée. Un seul email : le créateur, pas
  // toute la liste staff (évite le spam).
  try {
    const creatorId = (need as { created_by: string | null }).created_by;
    if (!creatorId) return;
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(creatorId);
    const email = userData?.user?.email;
    if (!email) return;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, preferred_language")
      .eq("id", creatorId)
      .maybeSingle();
    const locale = (profile?.preferred_language ?? "fr").startsWith("en") ? "en" : "fr";
    const clubName = (ev?.teams?.clubs?.name as string | null) ?? null;
    const clubTz = resolveClubTz((ev?.teams?.clubs?.timezone as string | null) ?? null);
    await enqueueTransactionalEmailServer({
      templateName: "event-need-signup",
      recipientEmail: email,
      idempotencyKey: `need-signup-${params.signupId}-${params.status}`,
      dispatchId: need.id,
      eventId: need.event_id,
      recipientId: creatorId,
      notificationType: "event_need_signup",
      fromName: clubName ? `${clubName} via Clubero` : undefined,
      templateData: {
        recipientFirstName: profile?.first_name ?? null,
        locale,
        tz: clubTz,
        status: params.status,
        needLabel: need.label,
        eventTitle,
        eventStartsAt: startsAt,
        clubName,
        applicantFirstName,
        applicantLastName: null,
        eventUrl: `/events/${need.event_id}`,
      },
    });
  } catch (e) {
    console.error("[notifyStaffOfSignup] email failed", e);
  }
}

/* ------------------------------------------------------------------------ */
/* Décision reçue — notifier le candidat                                    */
/* ------------------------------------------------------------------------ */

export interface NotifyApplicantOfDecisionParams {
  needId: string;
  signupId: string;
  decision: "confirm" | "decline" | "unassign";
  applicantUserId: string;
}

export async function notifyApplicantOfDecision(params: NotifyApplicantOfDecisionParams) {
  const { data: need } = await supabaseAdmin
    .from("event_needs")
    .select(
      "id, label, event_id, events:event_id(id, title, starts_at, team_id, teams:team_id(name, club_id, clubs:club_id(name, timezone)))",
    )
    .eq("id", params.needId)
    .maybeSingle();
  if (!need) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = (need as any).events;
  const eventTitle = (ev?.title as string) ?? "Événement";
  const eventStartsAt = (ev?.starts_at as string | null) ?? null;
  const clubName = (ev?.teams?.clubs?.name as string | null) ?? null;
  const clubTz = resolveClubTz((ev?.teams?.clubs?.timezone as string | null) ?? null);
  const isConfirm = params.decision === "confirm";
  const isUnassign = params.decision === "unassign";

  // Push
  try {
    const { sendPushToUser } = await import("@/lib/push-send.server");
    const title = isUnassign
      ? `Ce n'est plus nécessaire · ${need.label}`
      : isConfirm
        ? `Candidature confirmée 🎉`
        : `Candidature déclinée`;
    const dateStr = eventStartsAt
      ? new Date(eventStartsAt).toLocaleString("fr-FR", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: clubTz,
        })
      : null;
    const body = isUnassign
      ? `${eventTitle}${dateStr ? ` · ${dateStr}` : ""} — finalement nous n'avons plus besoin de toi. Merci quand même !`
      : [need.label, eventTitle, dateStr].filter(Boolean).join(" · ");
    await sendPushToUser(params.applicantUserId, {
      title,
      body,
      url: `/events/${need.event_id}#need-${need.id}`,
      tag: `event-need-decision-${need.id}-${params.signupId}`,
    });
  } catch (e) {
    console.error("[notifyApplicantOfDecision] push failed", e);
  }

  // Email
  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(params.applicantUserId);
    const email = userData?.user?.email;
    if (!email) return;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, preferred_language")
      .eq("id", params.applicantUserId)
      .maybeSingle();
    const locale = (profile?.preferred_language ?? "fr").startsWith("en") ? "en" : "fr";
    await enqueueTransactionalEmailServer({
      templateName: "event-need-decision",
      recipientEmail: email,
      idempotencyKey: `need-decision-${params.signupId}-${params.decision}`,
      dispatchId: need.id,
      eventId: need.event_id,
      recipientId: params.applicantUserId,
      notificationType: "event_need_decision",
      fromName: clubName ? `${clubName} via Clubero` : undefined,
      templateData: {
        recipientFirstName: profile?.first_name ?? null,
        locale,
        tz: clubTz,
        decision: params.decision,
        needLabel: need.label,
        eventTitle,
        eventStartsAt,
        clubName,
        eventUrl: `/events/${need.event_id}`,
      },
    });
  } catch (e) {
    console.error("[notifyApplicantOfDecision] email failed", e);
  }
}

/* ------------------------------------------------------------------------ */
/* Annulation d'un besoin — notifier les signups actifs                     */
/* ------------------------------------------------------------------------ */

export async function notifyNeedCancelled(params: { needId: string }) {
  const { data: need } = await supabaseAdmin
    .from("event_needs")
    .select(
      "id, label, event_id, events:event_id(id, title, starts_at, team_id, teams:team_id(name, club_id, clubs:club_id(name, timezone)))",
    )
    .eq("id", params.needId)
    .maybeSingle();
  if (!need) return { dispatched: 0 };

  const { data: signups } = await supabaseAdmin
    .from("event_need_signups")
    .select("user_id, status")
    .eq("need_id", params.needId)
    .in("status", ["applied", "confirmed"]);

  // Dédupliqué : un seul dispatch par personne (confirmed ET applied).
  const uids = Array.from(
    new Set(
      (signups ?? []).map((s) => s.user_id as string | null).filter((v): v is string => Boolean(v)),
    ),
  );
  if (uids.length === 0) return { dispatched: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = (need as any).events;
  const eventTitle = (ev?.title as string) ?? "Événement";
  const clubName = (ev?.teams?.clubs?.name as string | null) ?? null;
  const clubTz = resolveClubTz((ev?.teams?.clubs?.timezone as string | null) ?? null);

  // Push
  try {
    const { sendPushToUser } = await import("@/lib/push-send.server");
    await Promise.allSettled(
      uids.map((uid) =>
        sendPushToUser(uid, {
          title: `Besoin annulé`,
          body: `${need.label} · ${eventTitle} est annulé, vous n'êtes plus attendu·e`,
          url: `/events/${need.event_id}`,
          tag: `event-need-cancelled-${need.id}`,
        }),
      ),
    );
  } catch (e) {
    console.error("[notifyNeedCancelled] push failed", e);
  }

  // Email
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

  let dispatched = 0;
  for (const uid of uids) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
      const email = userData?.user?.email;
      if (!email) continue;
      const p = profileById.get(uid);
      await enqueueTransactionalEmailServer({
        templateName: "event-need-cancelled",
        recipientEmail: email,
        idempotencyKey: `need-cancelled-${need.id}-${uid}`,
        dispatchId: need.id,
        eventId: need.event_id,
        recipientId: uid,
        notificationType: "event_need_cancelled",
        fromName: clubName ? `${clubName} via Clubero` : undefined,
        templateData: {
          recipientFirstName: p?.first_name ?? null,
          locale: (p?.preferred_language ?? "fr").startsWith("en") ? "en" : "fr",
          needLabel: need.label,
          eventTitle,
          clubName,
          eventUrl: `/events/${need.event_id}`,
        },
      });
      dispatched++;
    } catch (e) {
      console.error("[notifyNeedCancelled] email failed", { uid, error: (e as Error).message });
    }
  }
  return { dispatched };
}
