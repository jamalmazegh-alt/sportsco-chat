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
      "id, label, capacity, validation_mode, event_id, events:event_id(id, title, starts_at, team_id, teams:team_id(name, club_id, clubs:club_id(name)))",
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

  // Push fanout
  try {
    const { sendPushToUser } = await import("@/lib/push-send.server");
    const title = `${need.label} — ${teamName ?? clubName ?? "Club"}`;
    const body = `Nouveau coup de main demandé pour ${eventTitle}`;
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
    (profiles ?? []).map((p) => [p.id as string, p as { first_name: string | null; preferred_language: string | null }]),
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
      "id, label, club_id, event_id, events:event_id(id, title, starts_at, type, opponent, is_home, team_id, teams:team_id(name))",
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
  const title = params.status === "confirmed" ? `✅ Volontaire confirmé` : `📝 Nouvelle candidature`;
  const body = `${matchLine} — ${applicantFirstName}`;
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
}

/* ------------------------------------------------------------------------ */
/* Décision reçue — notifier le candidat                                    */
/* ------------------------------------------------------------------------ */

export interface NotifyApplicantOfDecisionParams {
  needId: string;
  signupId: string;
  decision: "confirm" | "decline";
  applicantUserId: string;
}

export async function notifyApplicantOfDecision(params: NotifyApplicantOfDecisionParams) {
  const { data: need } = await supabaseAdmin
    .from("event_needs")
    .select("id, label, event_id")
    .eq("id", params.needId)
    .maybeSingle();
  if (!need) return;

  const { sendPushToUser } = await import("@/lib/push-send.server");
  const title = params.decision === "confirm" ? `Candidature confirmée` : `Candidature déclinée`;
  const body = `${need.label}`;
  await sendPushToUser(params.applicantUserId, {
    title,
    body,
    url: `/events/${need.event_id}#need-${need.id}`,
    tag: `event-need-decision-${need.id}`,
  });
}

/* ------------------------------------------------------------------------ */
/* Annulation d'un besoin — notifier les signups actifs                     */
/* ------------------------------------------------------------------------ */

export async function notifyNeedCancelled(params: { needId: string }) {
  const { data: need } = await supabaseAdmin
    .from("event_needs")
    .select("id, label, event_id")
    .eq("id", params.needId)
    .maybeSingle();
  if (!need) return;

  const { data: signups } = await supabaseAdmin
    .from("event_need_signups")
    .select("user_id, status")
    .eq("need_id", params.needId)
    .in("status", ["applied", "confirmed"]);

  const uids = (signups ?? [])
    .map((s) => s.user_id as string | null)
    .filter((v): v is string => Boolean(v));
  if (uids.length === 0) return;

  const { sendPushToUser } = await import("@/lib/push-send.server");
  await Promise.allSettled(
    uids.map((uid) =>
      sendPushToUser(uid, {
        title: `Besoin annulé`,
        body: need.label,
        url: `/events/${need.event_id}`,
        tag: `event-need-cancelled-${need.id}`,
      }),
    ),
  );
}
