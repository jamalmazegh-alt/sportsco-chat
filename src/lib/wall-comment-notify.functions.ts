/**
 * Notifications for new wall comments.
 *
 * Audience = the post author + everyone who already commented on the post,
 * minus the comment author and minus users already notified through an
 * explicit @mention (handled client-side as `wall_mention`).
 *
 * Creates in-app `notifications` rows (type `wall_comment`) and fans out a Web
 * Push with a per-post collapse tag.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  commentId: z.string().uuid(),
  excludeUserIds: z.array(z.string().uuid()).max(50).optional(),
});

const I18N: Record<string, { title: (a: string) => string; body: (m: string) => string }> = {
  fr: { title: (a) => `💬 ${a} a commenté`, body: (m) => m },
  en: { title: (a) => `💬 ${a} commented`, body: (m) => m },
  es: { title: (a) => `💬 ${a} ha comentado`, body: (m) => m },
  de: { title: (a) => `💬 ${a} hat kommentiert`, body: (m) => m },
  it: { title: (a) => `💬 ${a} ha commentato`, body: (m) => m },
  nl: { title: (a) => `💬 ${a} reageerde`, body: (m) => m },
  pt: { title: (a) => `💬 ${a} comentou`, body: (m) => m },
};

export const notifyWallComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    // The caller may only trigger a fan-out for their own comment.
    const { data: comment } = await supabaseAdmin
      .from("wall_comments")
      .select("id, post_id, author_user_id, body, created_at")
      .eq("id", data.commentId)
      .eq("author_user_id", userId)
      .maybeSingle();
    if (!comment) return { dispatched: 0, sent: 0 };

    const postId = (comment as any).post_id as string;

    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select("id, author_user_id, deleted_at")
      .eq("id", postId)
      .maybeSingle();
    if (!post || (post as any).deleted_at) return { dispatched: 0, sent: 0 };

    const targets = new Set<string>();
    const postAuthorId = (post as any).author_user_id as string | null;
    if (postAuthorId) targets.add(postAuthorId);

    const { data: others } = await supabaseAdmin
      .from("wall_comments")
      .select("author_user_id, deleted_at")
      .eq("post_id", postId);
    for (const c of others ?? []) {
      if ((c as any).deleted_at) continue;
      const uid = (c as any).author_user_id as string | null;
      if (uid) targets.add(uid);
    }

    targets.delete(userId);
    for (const uid of data.excludeUserIds ?? []) targets.delete(uid);
    if (targets.size === 0) return { dispatched: 0, sent: 0 };

    // Masquage personnel : ceux qui ont masqué l'auteur du commentaire ne
    // reçoivent ni notification in-app ni push.
    const { excludeRecipientsWhoMuted } = await import("@/lib/mutes.server");
    const allIds = await excludeRecipientsWhoMuted(supabaseAdmin, userId, Array.from(targets));
    if (allIds.length === 0) return { dispatched: 0, sent: 0 };

    const { data: author } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    const authorName =
      [(author as any)?.first_name, (author as any)?.last_name].filter(Boolean).join(" ").trim() ||
      ((author as any)?.full_name as string) ||
      "Un membre";

    const raw = (((comment as any).body as string) || "").trim();
    const preview = raw.length > 120 ? `${raw.slice(0, 119)}…` : raw;

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

    // In-app notifications for everyone in the audience.
    await supabaseAdmin.from("notifications").insert(
      allIds.map((uid) => {
        const t = I18N[prefByUser.get(uid)?.lang || "fr"] || I18N.fr;
        return {
          user_id: uid,
          type: uid === postAuthorId ? "wall_comment" : "wall_comment_follow",
          title: t.title(authorName),
          body: preview,
          link: `/inbox#${postId}`,
        };
      }),
    );

    const recipients = allIds.filter((uid) => prefByUser.get(uid)?.pushOn !== false);
    const results = await Promise.all(
      recipients.map((uid) => {
        const t = I18N[prefByUser.get(uid)?.lang || "fr"] || I18N.fr;
        return sendPushToUser(uid, {
          title: t.title(authorName),
          body: t.body(preview),
          url: `/inbox?post=${postId}&from=push#${postId}`,
          tag: `wall-comment-${postId}`,
        }).catch((e: unknown) => {
          console.warn("[push] wall comment send failed", uid, (e as Error).message);
          return { sent: 0, pruned: 0 };
        });
      }),
    );
    const sent = results.reduce((total, r) => total + r.sent, 0);

    try {
      await supabaseAdmin.from("push_dispatch_log").insert({
        kind: "wall_comment",
        ref_id: data.commentId,
        targets_count: recipients.length,
        sent_count: sent,
      });
    } catch (e) {
      console.warn("[push:wall-comment] log insert failed", (e as Error).message);
    }

    return { dispatched: allIds.length, sent };
  });
