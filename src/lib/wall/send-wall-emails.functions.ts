import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Envoi des e-mails « aussi par e-mail » d'un post du mur.
 *
 * - Outbox best-effort : les erreurs d'envoi n'impactent pas le post.
 * - Résolution des destinataires alignée sur l'audience du post (club / team / multi_team / group).
 * - Routage mineur → parent(s) (jamais d'e-mail direct sous 18 ans).
 * - Déduplication via (dispatch_id=postId, recipient_id=<userId>, notification_type='wall_message').
 * - Toujours appelé APRÈS l'insert du post (l'auteur du post doit être autorisé côté RLS).
 */

const InputSchema = z.object({ postId: z.string().uuid() });

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

// Le seuil "mineur" n'est plus codé en dur : on délègue à la fonction SQL
// public.player_is_minor(_player_id) qui applique le seuil configuré (club/locale).


export const sendWallPostEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { postId } = data;
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Charger le post + flag send_email
    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select(
        "id, club_id, author_user_id, body, audience_type, audience_team_ids, audience_group_ids, send_email, clubs:club_id(name, default_language)",
      )
      .eq("id", postId)
      .maybeSingle();
    if (!post || !post.send_email) return { sent: 0, skipped: "not_flagged" as const };

    // Contrôle simple : l'appelant doit être l'auteur (la publication passe par RLS d'insert de toute façon).
    if (post.author_user_id && post.author_user_id !== userId) {
      // On tolère un admin/dirigeant du club (utile pour re-jouer un envoi manuellement plus tard).
      const { data: canBypass } = await supabaseAdmin.rpc("has_club_role", {
        _user_id: userId,
        _club_id: post.club_id,
        _role: "admin",
      } as any);
      if (!canBypass) {
        return { sent: 0, skipped: "forbidden" as const };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubName = ((post as any).clubs?.name as string | null) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubDefaultLang = ((post as any).clubs?.default_language as string | null) ?? null;

    const audienceType = post.audience_type as
      | "club"
      | "team"
      | "multi_team"
      | "group";
    const audienceTeamIds = (post.audience_team_ids as string[] | null) ?? null;
    const audienceGroupIds = (post.audience_group_ids as string[] | null) ?? null;

    // 2) Résolution des destinataires (mêmes règles que les notifications in-app du mur).
    //    On collecte des user_ids côté membres/staff + des player_ids pour routage mineur.
    const recipientUserSet = new Set<string>();
    const playerIds = new Set<string>();

    if (audienceType === "club") {
      const { data: members } = await supabaseAdmin
        .from("club_members")
        .select("user_id")
        .eq("club_id", post.club_id);
      for (const m of members ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uid = (m as any).user_id as string | null;
        if (uid) recipientUserSet.add(uid);
      }
      // Ajouter aussi les joueurs du club (via team_members) pour couvrir les mineurs
      const { data: teams } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("club_id", post.club_id)
        .is("deleted_at", null);
      const teamIds = (teams ?? []).map((t) => t.id as string);
      if (teamIds.length) {
        const { data: tm } = await supabaseAdmin
          .from("team_members")
          .select("user_id, player_id")
          .in("team_id", teamIds);
        for (const r of tm ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uid = (r as any).user_id as string | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pid = (r as any).player_id as string | null;
          if (uid) recipientUserSet.add(uid);
          if (pid) playerIds.add(pid);
        }
      }
    } else if (audienceType === "team" || audienceType === "multi_team") {
      // Admins/dirigeants voient toujours le post → e-mail aussi.
      const { data: priv } = await supabaseAdmin
        .from("club_members")
        .select("user_id, role")
        .eq("club_id", post.club_id)
        .in("role", ["admin", "dirigeant"]);
      for (const m of priv ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uid = (m as any).user_id as string | null;
        if (uid) recipientUserSet.add(uid);
      }
      const teamIds = audienceTeamIds ?? [];
      if (teamIds.length) {
        const { data: tm } = await supabaseAdmin
          .from("team_members")
          .select("user_id, player_id")
          .in("team_id", teamIds);
        for (const r of tm ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uid = (r as any).user_id as string | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pid = (r as any).player_id as string | null;
          if (uid) recipientUserSet.add(uid);
          if (pid) playerIds.add(pid);
        }
      }
    } else if (audienceType === "group") {
      const groupIds = audienceGroupIds ?? [];
      if (groupIds.length) {
        const { data: gm } = await supabaseAdmin
          .from("club_group_members")
          .select("member_id, club_members:member_id(user_id, player_id)")
          .in("group_id", groupIds);
        for (const row of gm ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm = (row as any).club_members;
          const uid = cm?.user_id as string | null;
          const pid = cm?.player_id as string | null;
          if (uid) recipientUserSet.add(uid);
          if (pid) playerIds.add(pid);
        }
      }
    }

    // 3) Routage mineur → parents.
    //    - Un joueur mineur est déterminé via la fonction SQL public.player_is_minor
    //      (seuil configuré côté club/locale ; ex. FR = 15 ans).
    //    - Le user_id du joueur mineur est retiré du set et on ajoute ses parents (parent_user_id).
    if (playerIds.size > 0) {
      const idsArr = Array.from(playerIds);
      const { data: players } = await supabaseAdmin
        .from("players")
        .select("id, user_id")
        .in("id", idsArr);
      const playerRows = (players ?? []) as Array<{ id: string; user_id: string | null }>;

      // Interroger la fonction SQL par joueur (volume faible dans un post du mur).
      const minorFlags = await Promise.all(
        idsArr.map(async (pid) => {
          const { data } = await supabaseAdmin.rpc("player_is_minor", {
            _player_id: pid,
          } as any);
          return [pid, data === true] as const;
        }),
      );
      const isMinor = new Map(minorFlags);

      const minorPlayerIds: string[] = [];
      for (const p of playerRows) {
        if (isMinor.get(p.id) === true) {
          if (p.user_id) recipientUserSet.delete(p.user_id);
          minorPlayerIds.push(p.id);
        }
      }

      if (minorPlayerIds.length) {
        const { data: parents } = await supabaseAdmin
          .from("player_parents")
          .select("parent_user_id")
          .in("player_id", minorPlayerIds);
        for (const pr of parents ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uid = (pr as any).parent_user_id as string | null;
          if (uid) recipientUserSet.add(uid);
        }
      }
    }

    // Ne pas s'écrire à soi-même.
    recipientUserSet.delete(userId);
    if (post.author_user_id) recipientUserSet.delete(post.author_user_id);

    const recipients = Array.from(recipientUserSet);
    if (recipients.length === 0) return { sent: 0, skipped: "no_recipients" as const };

    // 4) Récup profils (locale + opt-out email + first_name) puis emails via auth.admin.
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, first_name, preferred_language, notifications_email")
      .in("id", recipients);
    const profById = new Map(
      (profs ?? []).map((p) => [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p as any).id as string,
        p as {
          id: string;
          full_name: string | null;
          first_name: string | null;
          preferred_language: string | null;
          notifications_email: boolean | null;
        },
      ]),
    );

    // Auteur : afficher un nom lisible.
    let authorName: string | null = null;
    if (post.author_user_id) {
      const { data: author } = await supabaseAdmin
        .from("profiles")
        .select("full_name, first_name")
        .eq("id", post.author_user_id)
        .maybeSingle();
      authorName =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((author as any)?.full_name as string | null) ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((author as any)?.first_name as string | null) ??
        null;
    }

    const baseUrl = process.env.SITE_URL || "https://app.clubero.app";
    const wallUrl = `${baseUrl}/inbox#${postId}`;

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    let sent = 0;
    for (const uid of recipients) {
      const prof = profById.get(uid);
      if (prof && prof.notifications_email === false) continue;
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
        const email = authUser?.user?.email;
        if (!email) continue;
        const locale = resolveLocale(prof?.preferred_language, clubDefaultLang);

        await enqueueTransactionalEmailServer({
          templateName: "wall-message",
          recipientEmail: email,
          idempotencyKey: `wall-msg-${postId}-${uid}`,
          dispatchId: postId,
          recipientId: uid,
          notificationType: "wall_message",
          fromName: clubName ? `${clubName} via Clubero` : undefined,
          templateData: {
            authorName,
            clubName,
            body: post.body ?? "",
            wallUrl,
            locale,
          },
        });
        sent += 1;
      } catch (e) {
        // Outbox best-effort : on log et on continue.
        console.error("[wall-message] email failed", {
          postId,
          uid,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { sent };
  });
