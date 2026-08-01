/**
 * Server-only helper that fans out Web Push notifications for a wall post.
 * Called from:
 *  - dispatchWallPostPush (createServerFn, from the client after a user creates a post)
 *  - social sync (cron), when a Facebook/Instagram/X post is imported and no
 *    author_user_id exists.
 *
 * Same audience/consent/minor-protection logic as the previous inline handler.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/lib/push-send.server";
import { getClubNotifSettings } from "@/lib/club-notif-settings.server";

const MINOR_PUSH_THRESHOLD_YEARS = 16;

// Corps de notification générique : on ne nomme pas l'audience (club, équipe,
// groupe) pour éviter d'exposer la portée à des destinataires qui ne devraient
// pas la deviner. Titre inchangé.
const I18N: Record<string, { title: string; body: (a: string) => string }> = {
  fr: { title: "Nouveau message sur le mur", body: (a) => `${a} a publié un nouveau message` },
  en: { title: "New post on the wall", body: (a) => `${a} posted a new message` },
  de: {
    title: "Neuer Beitrag an der Pinnwand",
    body: (a) => `${a} hat einen neuen Beitrag veröffentlicht`,
  },
  es: { title: "Nuevo mensaje en el muro", body: (a) => `${a} publicó un nuevo mensaje` },
  it: {
    title: "Nuovo messaggio sulla bacheca",
    body: (a) => `${a} ha pubblicato un nuovo messaggio`,
  },
  nl: { title: "Nieuw bericht op de muur", body: (a) => `${a} heeft een nieuw bericht geplaatst` },
  pt: { title: "Nova mensagem no mural", body: (a) => `${a} publicou uma nova mensagem` },
};

// Label per social source, localized where obvious.
const SOURCE_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  twitter: "X",
};

export async function dispatchWallPostPushInternal(
  postId: string,
  opts: { excludeUserId?: string | null } = {},
): Promise<{ dispatched: number; sent: number; pruned: number; deduped?: boolean }> {
  // 1) Idempotence
  const { error: dedupErr } = await supabaseAdmin
    .from("push_dispatch_log")
    .insert({ kind: "wall_post", ref_id: postId });
  if (dedupErr) {
    console.log("[push] wall BAIL already dispatched", { postId, code: dedupErr.code });
    return { dispatched: 0, sent: 0, pruned: 0, deduped: true };
  }

  const { data: post } = await supabaseAdmin
    .from("wall_posts")
    .select("id, club_id, author_user_id, deleted_at, audience_team_ids, audience_type, source")
    .eq("id", postId)
    .maybeSingle();
  if (!post || (post as any).deleted_at) {
    console.log("[push] wall BAIL no post or deleted");
    return { dispatched: 0, sent: 0, pruned: 0 };
  }

  const clubId = (post as any).club_id as string;
  const audienceTeamIds = ((post as any).audience_team_ids as string[] | null) ?? null;
  const audienceType = ((post as any).audience_type as string) || "club";
  const source = ((post as any).source as string) || "clubero";

  const settings = await getClubNotifSettings(clubId);
  if (!settings.wall_new_post) {
    console.log("[push] wall BAIL settings disabled");
    return { dispatched: 0, sent: 0, pruned: 0 };
  }

  // Author display name: use profile for user posts, source label for social imports.
  let authorName = "Un membre";
  const authorUserId = (post as any).author_user_id as string | null;
  if (authorUserId) {
    const { data: author } = await supabaseAdmin
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", authorUserId)
      .maybeSingle();
    authorName =
      [(author as any)?.first_name, (author as any)?.last_name].filter(Boolean).join(" ").trim() ||
      ((author as any)?.full_name as string) ||
      "Un membre";
  } else if (SOURCE_LABEL[source]) {
    authorName = SOURCE_LABEL[source];
  }

  const { data: club } = await supabaseAdmin
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .maybeSingle();
  const _clubName = ((club as any)?.name as string) || "votre club";
  void _clubName;

  // 2) Candidate recipients — same logic as the SELECT RLS policy.
  const candidates = new Set<string>();

  const { data: privMembers } = await supabaseAdmin
    .from("club_members")
    .select("user_id, role")
    .eq("club_id", clubId)
    .in("role", ["admin", "dirigeant"]);
  for (const m of privMembers ?? []) {
    const uid = (m as any).user_id as string | null;
    if (uid) candidates.add(uid);
  }

  const liveTeams: { id: string; name: string }[] = [];
  if (audienceTeamIds && audienceTeamIds.length > 0) {
    const { data: teamsRows } = await supabaseAdmin
      .from("teams")
      .select("id, name, club_id, deleted_at")
      .in("id", audienceTeamIds)
      .eq("club_id", clubId)
      .is("deleted_at", null);
    for (const t of teamsRows ?? []) {
      liveTeams.push({ id: (t as any).id, name: (t as any).name });
    }
  }

  if (audienceType === "team_staff") {
    // Restrict to coaches/dirigeants of the target team(s). Club admins/dirigeants
    // were already added above.
    const teamIds = liveTeams.map((t) => t.id);
    if (teamIds.length > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from("team_members")
        .select("user_id, role")
        .in("team_id", teamIds)
        .in("role", ["coach", "dirigeant"]);
      // Reset candidates to admins/dirigeants + team staff only.
      for (const r of staffRows ?? []) {
        const uid = (r as any).user_id as string | null;
        if (uid) candidates.add(uid);
      }
    }
  } else if (audienceTeamIds === null) {
    const { data: members } = await supabaseAdmin
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId);
    for (const m of members ?? []) {
      const uid = (m as any).user_id as string | null;
      if (uid) candidates.add(uid);
    }
  } else if (liveTeams.length > 0) {
    const teamIds = liveTeams.map((t) => t.id);
    const { data: staffRows } = await supabaseAdmin
      .from("team_members")
      .select("user_id, player_id")
      .in("team_id", teamIds);
    const playerIdSet = new Set<string>();
    for (const r of staffRows ?? []) {
      const uid = (r as any).user_id as string | null;
      const pid = (r as any).player_id as string | null;
      if (uid) candidates.add(uid);
      if (pid) playerIdSet.add(pid);
    }
    if (playerIdSet.size > 0) {
      const playerIds = Array.from(playerIdSet);
      const { data: playerRows } = await supabaseAdmin
        .from("players")
        .select("id, user_id")
        .in("id", playerIds);
      for (const p of playerRows ?? []) {
        const uid = (p as any).user_id as string | null;
        if (uid) candidates.add(uid);
      }
      const { data: parentRows } = await supabaseAdmin
        .from("player_parents")
        .select("parent_user_id")
        .in("player_id", playerIds);
      for (const pr of parentRows ?? []) {
        const uid = (pr as any).parent_user_id as string | null;
        if (uid) candidates.add(uid);
      }
    }
  }

  if (opts.excludeUserId) candidates.delete(opts.excludeUserId);

  if (candidates.size === 0) {
    return { dispatched: 0, sent: 0, pruned: 0 };
  }

  const allIds = Array.from(candidates);

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, preferred_language, notifications_push")
    .in("id", allIds);
  const prefByUser = new Map<string, { lang: string; pushOn: boolean }>();
  for (const p of profiles ?? []) {
    prefByUser.set((p as any).id, {
      lang: ((p as any).preferred_language as string) || "fr",
      pushOn: (p as any).notifications_push !== false,
    });
  }

  const { data: playerAccounts } = await supabaseAdmin
    .from("players")
    .select("user_id, birth_date")
    .in("user_id", allIds);
  const now = Date.now();
  const excludedAsMinor = new Set<string>();
  for (const p of playerAccounts ?? []) {
    const uid = (p as any).user_id as string | null;
    const dob = (p as any).birth_date as string | null;
    if (!uid) continue;
    if (!dob) {
      excludedAsMinor.add(uid);
      continue;
    }
    const ageYears = (now - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < MINOR_PUSH_THRESHOLD_YEARS) excludedAsMinor.add(uid);
  }

  let targets: string[] = [];
  for (const uid of allIds) {
    if (excludedAsMinor.has(uid)) continue;
    const pref = prefByUser.get(uid);
    if (pref && pref.pushOn === false) continue;
    targets.push(uid);
  }

  // Masquage personnel : ceux qui ont masqué l'auteur du post ne reçoivent
  // pas de push (le post est filtré chez eux).
  if (authorUserId) {
    const { excludeRecipientsWhoMuted } = await import("@/lib/mutes.server");
    targets = await excludeRecipientsWhoMuted(supabaseAdmin, authorUserId, targets);
  }

  // Un tag unique par post : chaque publication du mur produit sa propre
  // notification (pas d'écrasement de la précédente par l'OS).
  const collapseTag = `wall-post-${postId}`;
  void liveTeams;

  const sends = targets.map((uid) => {
    const lang = prefByUser.get(uid)?.lang || "fr";
    const t = I18N[lang] || I18N.fr;
    return sendPushToUser(uid, {
      title: t.title,
      body: t.body(authorName),
      url: `/inbox?post=${postId}&from=push`,
      tag: collapseTag,
    }).catch((e: unknown) => {
      console.warn("[push] wall send failed", uid, (e as Error).message);
      return { sent: 0, pruned: 0 };
    });
  });
  const results = await Promise.all(sends);
  const sent = results.reduce((t, r) => t + r.sent, 0);
  const pruned = results.reduce((t, r) => t + r.pruned, 0);

  await supabaseAdmin
    .from("push_dispatch_log")
    .update({ targets_count: targets.length, sent_count: sent })
    .eq("kind", "wall_post")
    .eq("ref_id", postId);

  console.log("[push] wall dispatched (shared helper)", {
    postId,
    source,
    clubId,
    audienceType,
    audienceTeamIds,
    liveTeams: liveTeams.length,
    candidates: candidates.size,
    excludedAsMinor: excludedAsMinor.size,
    targets: targets.length,
    sent,
    pruned,
  });
  return { dispatched: targets.length, sent, pruned };
}
