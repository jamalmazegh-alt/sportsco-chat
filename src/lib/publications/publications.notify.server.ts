/**
 * Dispatch d'e-mails interactifs pour les sondages (club_publications).
 *
 * Pattern outbox best-effort : un échec d'e-mail n'annule pas la publication.
 * Appelé après le succès de `publish_publication_atomic` dans createPublication
 * (kind='publish') ou republishPublication (kind='audience_refresh' | 'manual_resend').
 *
 * - Sélection des destinataires du dispatch :
 *     publish / manual_resend → tous les club_publication_recipients de la publication
 *     audience_refresh        → delta seulement (first_dispatch_id = dispatchRowId)
 * - Routage mineur → parent(s) via player_is_minor + player_parents
 *     (jamais d'e-mail direct à un joueur mineur)
 * - Dédup via (dispatch_id=dispatchRowId, recipient_id=`${recipientRowId}:${targetUserId}`,
 *   notification_type='publication_poll') — un e-mail par cible et par dispatch.
 * - Respect de l'opt-out (profiles.notifications_email = false).
 */

type DispatchKind = "publish" | "audience_refresh" | "manual_resend";

const SUPPORTED_LOCALES = ["fr", "en", "de", "es", "it", "nl", "pt"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function resolveLocale(...candidates: Array<string | null | undefined>): Locale {
  const set = new Set<string>(SUPPORTED_LOCALES);
  for (const c of candidates) {
    const v = (c ?? "").toLowerCase().slice(0, 2);
    if (set.has(v)) return v as Locale;
  }
  return "fr";
}

export async function dispatchPollEmails(
  publicationId: string,
  dispatchRowId: string,
  kind: DispatchKind,
): Promise<{ sent: number; skipped?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    // 1) Publication + club
    const { data: pub } = await supabaseAdmin
      .from("club_publications")
      .select(
        "id, club_id, publication_type, title, content, send_email, closes_at, closed_at, clubs:club_id(name, default_language)",
      )
      .eq("id", publicationId)
      .maybeSingle();
    if (!pub) return { sent: 0, skipped: "not_found" };
    if (pub.publication_type !== "poll") return { sent: 0, skipped: "not_poll" };
    if (!pub.send_email) return { sent: 0, skipped: "email_disabled" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubName = ((pub as any).clubs?.name as string | null) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubDefaultLang = ((pub as any).clubs?.default_language as string | null) ?? null;

    // 2) Options du sondage
    const { data: opts } = await supabaseAdmin
      .from("club_poll_options")
      .select("id, label, sort_order")
      .eq("publication_id", publicationId)
      .order("sort_order", { ascending: true });
    const options = (opts ?? []) as Array<{ id: string; label: string; sort_order: number }>;
    if (options.length === 0) return { sent: 0, skipped: "no_options" };

    // 3) Destinataires (delta si audience_refresh, sinon tous)
    let recQuery = supabaseAdmin
      .from("club_publication_recipients")
      .select("id, subject_kind, member_id, subject_user_id, first_dispatch_id")
      .eq("publication_id", publicationId);
    if (kind === "audience_refresh") {
      recQuery = recQuery.eq("first_dispatch_id", dispatchRowId);
    }
    const { data: recips } = await recQuery;
    const recipients = (recips ?? []) as Array<{
      id: string;
      subject_kind: "player" | "user";
      member_id: string | null;
      subject_user_id: string | null;
      first_dispatch_id: string | null;
    }>;
    if (recipients.length === 0) return { sent: 0, skipped: "no_recipients" };

    // 4) Résolution cible → un ou plusieurs user_ids par recipient row
    //    - subject 'user'   → subject_user_id
    //    - subject 'player' → si mineur : parent_user_id(s), sinon players.user_id
    type Delivery = { recipientRowId: string; targetUserId: string };
    const deliveries: Delivery[] = [];

    const playerRecipients = recipients.filter((r) => r.subject_kind === "player" && r.member_id);
    const userRecipients = recipients.filter((r) => r.subject_kind === "user" && r.subject_user_id);

    for (const r of userRecipients) {
      deliveries.push({ recipientRowId: r.id, targetUserId: r.subject_user_id! });
    }

    if (playerRecipients.length > 0) {
      const playerIds = Array.from(new Set(playerRecipients.map((r) => r.member_id!)));
      const { data: players } = await supabaseAdmin
        .from("players")
        .select("id, user_id")
        .in("id", playerIds);
      const playerRows = (players ?? []) as Array<{ id: string; user_id: string | null }>;
      const userByPlayer = new Map(playerRows.map((p) => [p.id, p.user_id]));

      // Résolution minor par joueur
      const minorFlags = await Promise.all(
        playerIds.map(async (pid) => {
          const { data } = await supabaseAdmin.rpc("player_is_minor", {
            _player_id: pid,
          } as any);
          return [pid, data === true] as const;
        }),
      );
      const isMinor = new Map(minorFlags);

      const minorPids = playerIds.filter((pid) => isMinor.get(pid) === true);
      const parentsByPlayer = new Map<string, string[]>();
      if (minorPids.length > 0) {
        const { data: parents } = await supabaseAdmin
          .from("player_parents")
          .select("player_id, parent_user_id")
          .in("player_id", minorPids);
        for (const row of parents ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pid = (row as any).player_id as string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uid = (row as any).parent_user_id as string | null;
          if (!pid || !uid) continue;
          const arr = parentsByPlayer.get(pid) ?? [];
          arr.push(uid);
          parentsByPlayer.set(pid, arr);
        }
      }

      for (const r of playerRecipients) {
        const pid = r.member_id!;
        if (isMinor.get(pid)) {
          const parents = parentsByPlayer.get(pid) ?? [];
          for (const uid of parents) {
            deliveries.push({ recipientRowId: r.id, targetUserId: uid });
          }
        } else {
          const uid = userByPlayer.get(pid) ?? null;
          if (uid) deliveries.push({ recipientRowId: r.id, targetUserId: uid });
        }
      }
    }

    if (deliveries.length === 0) return { sent: 0, skipped: "no_targets" };

    // 5) Dédup par targetUserId — un utilisateur destinataire via plusieurs
    //    sujets (ex. subject player + subject user) ne reçoit qu'un e-mail.
    const seen = new Set<string>();
    const unique = deliveries.filter((d) => {
      if (seen.has(d.targetUserId)) return false;
      seen.add(d.targetUserId);
      return true;
    });

    // 6) Charger profils + auth emails
    const targetUserIds = Array.from(new Set(unique.map((d) => d.targetUserId)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, preferred_language, notifications_email")
      .in("id", targetUserIds);
    const profById = new Map(
      (profs ?? []).map((p) => [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p as any).id as string,
        p as {
          id: string;
          preferred_language: string | null;
          notifications_email: boolean | null;
        },
      ]),
    );

    const baseUrl = process.env.SITE_URL || "https://www.clubero.app";
    const resultsUrl = `${baseUrl}/publications/${publicationId}`;
    const buildOptions = () =>
      options.map((o) => ({
        id: o.id,
        label: o.label,
        url: `${baseUrl}/publications/${publicationId}?vote=${o.id}`,
      }));

    let sent = 0;
    for (const d of unique) {
      const prof = profById.get(d.targetUserId);
      if (prof && prof.notifications_email === false) continue;
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(d.targetUserId);
        const email = authUser?.user?.email;
        if (!email) continue;
        const locale = resolveLocale(prof?.preferred_language, clubDefaultLang);

        await enqueueTransactionalEmailServer({
          templateName: "publication-poll",
          recipientEmail: email,
          idempotencyKey: `poll-${dispatchRowId}-${d.targetUserId}`,
          dispatchId: dispatchRowId,
          recipientId: d.targetUserId,
          notificationType: "publication_poll",
          fromName: clubName ? `${clubName} via Clubero` : undefined,
          templateData: {
            question: pub.title,
            description: pub.content || null,
            options: buildOptions(),
            resultsUrl,
            clubName,
            locale,
          },
        });
        sent += 1;
      } catch (e) {
        console.error("[publication-poll] email failed", {
          publicationId,
          dispatchRowId,
          targetUserId: d.targetUserId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { sent };
  } catch (e) {
    // Best-effort : ne jamais laisser remonter
    console.error("[dispatchPollEmails] fatal", {
      publicationId,
      dispatchRowId,
      kind,
      error: e instanceof Error ? e.message : String(e),
    });
    return { sent: 0, skipped: "error" };
  }
}
