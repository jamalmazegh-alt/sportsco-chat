/**
 * Web Push fan-out pour les publications du mur (messages + sondages).
 *
 * Même règle que les posts du mur (`push-dispatch-wall.server.ts`) :
 *  - respect du réglage club `wall_new_post`
 *  - respect de `profiles.notifications_push`
 *  - exclusion des comptes joueurs mineurs (< 16 ans) → routés vers les parents
 *
 * L'audience est déjà matérialisée dans `club_publication_recipients`
 * (résolue par `create_publication_atomic` / `publish_publication_atomic`),
 * on réutilise donc exactement la même résolution que les e-mails de sondage :
 *   subject 'user'   → subject_user_id
 *   subject 'player' → parents si mineur, sinon le compte joueur
 *
 * Idempotence : une ligne `push_dispatch_log` par dispatch (kind='publication').
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/lib/push-send.server";
import { getClubNotifSettings } from "@/lib/club-notif-settings.server";

const MINOR_PUSH_THRESHOLD_YEARS = 16;

type Copy = { poll: string; message: string; body: (author: string) => string };

const I18N: Record<string, Copy> = {
  fr: {
    poll: "Nouveau sondage",
    message: "Nouveau message du club",
    body: (a) => `${a} attend votre réponse`,
  },
  en: {
    poll: "New poll",
    message: "New club post",
    body: (a) => `${a} is waiting for your answer`,
  },
  de: {
    poll: "Neue Umfrage",
    message: "Neue Vereinsnachricht",
    body: (a) => `${a} wartet auf Ihre Antwort`,
  },
  es: {
    poll: "Nueva encuesta",
    message: "Nuevo mensaje del club",
    body: (a) => `${a} espera tu respuesta`,
  },
  it: {
    poll: "Nuovo sondaggio",
    message: "Nuovo messaggio del club",
    body: (a) => `${a} attende la tua risposta`,
  },
  nl: {
    poll: "Nieuwe peiling",
    message: "Nieuw clubbericht",
    body: (a) => `${a} wacht op je antwoord`,
  },
  pt: {
    poll: "Nova sondagem",
    message: "Nova mensagem do clube",
    body: (a) => `${a} aguarda a sua resposta`,
  },
};

export async function dispatchPublicationPush(
  publicationId: string,
  dispatchRowId: string,
  kind: "publish" | "audience_refresh" | "manual_resend",
  opts: { excludeUserId?: string | null } = {},
): Promise<{ dispatched: number; sent: number; pruned: number; skipped?: string }> {
  try {
    // 1) Idempotence par dispatch
    const { error: dedupErr } = await supabaseAdmin
      .from("push_dispatch_log")
      .insert({ kind: "publication", ref_id: dispatchRowId });
    if (dedupErr) {
      return { dispatched: 0, sent: 0, pruned: 0, skipped: "deduped" };
    }

    const { data: pub } = await supabaseAdmin
      .from("club_publications")
      .select("id, club_id, author_id, publication_type, title, publish_to_wall, deleted_at")
      .eq("id", publicationId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pub as any;
    if (!p || p.deleted_at) return { dispatched: 0, sent: 0, pruned: 0, skipped: "not_found" };
    if (!p.publish_to_wall) return { dispatched: 0, sent: 0, pruned: 0, skipped: "not_on_wall" };

    const clubId = p.club_id as string;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.wall_new_post) {
      return { dispatched: 0, sent: 0, pruned: 0, skipped: "settings_disabled" };
    }

    // 2) Auteur
    let authorName = "Un membre";
    if (p.author_id) {
      const { data: author } = await supabaseAdmin
        .from("profiles")
        .select("full_name, first_name, last_name")
        .eq("id", p.author_id)
        .maybeSingle();
      authorName =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [(author as any)?.first_name, (author as any)?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((author as any)?.full_name as string) ||
        "Un membre";
    }

    // 3) Destinataires (delta si audience_refresh)
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
    }>;
    if (recipients.length === 0) {
      return { dispatched: 0, sent: 0, pruned: 0, skipped: "no_recipients" };
    }

    const candidates = new Set<string>();
    for (const r of recipients) {
      if (r.subject_kind === "user" && r.subject_user_id) candidates.add(r.subject_user_id);
    }

    const playerIds = Array.from(
      new Set(
        recipients
          .filter((r) => r.subject_kind === "player" && r.member_id)
          .map((r) => r.member_id!),
      ),
    );
    if (playerIds.length > 0) {
      const { data: playerRows } = await supabaseAdmin
        .from("players")
        .select("id, user_id")
        .in("id", playerIds);
      for (const pr of playerRows ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uid = (pr as any).user_id as string | null;
        if (uid) candidates.add(uid);
      }
      // Mineurs → parents (le compte joueur mineur est de toute façon filtré plus bas)
      const minorFlags = await Promise.all(
        playerIds.map(async (pid) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await supabaseAdmin.rpc("player_is_minor", { _player_id: pid } as any);
          return [pid, data === true] as const;
        }),
      );
      const minorPids = minorFlags.filter(([, isMinor]) => isMinor).map(([pid]) => pid);
      if (minorPids.length > 0) {
        const { data: parents } = await supabaseAdmin
          .from("player_parents")
          .select("parent_user_id")
          .in("player_id", minorPids);
        for (const row of parents ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uid = (row as any).parent_user_id as string | null;
          if (uid) candidates.add(uid);
        }
      }
    }

    if (opts.excludeUserId) candidates.delete(opts.excludeUserId);
    if (candidates.size === 0) return { dispatched: 0, sent: 0, pruned: 0, skipped: "no_targets" };

    const allIds = Array.from(candidates);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, preferred_language, notifications_push")
      .in("id", allIds);
    const prefByUser = new Map<string, { lang: string; pushOn: boolean }>();
    for (const prof of profiles ?? []) {
      prefByUser.set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prof as any).id as string,
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lang: ((prof as any).preferred_language as string) || "fr",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pushOn: (prof as any).notifications_push !== false,
        },
      );
    }

    // Exclusion des comptes joueurs mineurs (< 16 ans), comme le mur
    const { data: playerAccounts } = await supabaseAdmin
      .from("players")
      .select("user_id, birth_date")
      .in("user_id", allIds);
    const now = Date.now();
    const excludedAsMinor = new Set<string>();
    for (const pa of playerAccounts ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uid = (pa as any).user_id as string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dob = (pa as any).birth_date as string | null;
      if (!uid) continue;
      if (!dob) {
        excludedAsMinor.add(uid);
        continue;
      }
      const ageYears = (now - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (ageYears < MINOR_PUSH_THRESHOLD_YEARS) excludedAsMinor.add(uid);
    }

    const targets = allIds.filter(
      (uid) => !excludedAsMinor.has(uid) && prefByUser.get(uid)?.pushOn !== false,
    );
    if (targets.length === 0) return { dispatched: 0, sent: 0, pruned: 0, skipped: "no_targets" };

    const isPoll = p.publication_type === "poll";
    const results = await Promise.all(
      targets.map((uid) => {
        const lang = prefByUser.get(uid)?.lang || "fr";
        const t = I18N[lang] || I18N.fr;
        return sendPushToUser(uid, {
          title: isPoll ? t.poll : t.message,
          body: isPoll ? `${p.title as string}` : t.body(authorName),
          url: `/publications/${publicationId}?from=push`,
          tag: `publication-${publicationId}`,
        }).catch((e: unknown) => {
          console.warn("[push] publication send failed", uid, (e as Error).message);
          return { sent: 0, pruned: 0 };
        });
      }),
    );
    const sent = results.reduce((t, r) => t + r.sent, 0);
    const pruned = results.reduce((t, r) => t + r.pruned, 0);

    await supabaseAdmin
      .from("push_dispatch_log")
      .update({ targets_count: targets.length, sent_count: sent })
      .eq("kind", "publication")
      .eq("ref_id", dispatchRowId);

    console.log("[push] publication dispatched", {
      publicationId,
      dispatchRowId,
      kind,
      candidates: candidates.size,
      excludedAsMinor: excludedAsMinor.size,
      targets: targets.length,
      sent,
      pruned,
    });

    return { dispatched: targets.length, sent, pruned };
  } catch (e) {
    console.error("[dispatchPublicationPush] fatal", {
      publicationId,
      dispatchRowId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { dispatched: 0, sent: 0, pruned: 0, skipped: "error" };
  }
}
