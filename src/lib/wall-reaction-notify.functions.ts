/**
 * Notifications for wall post reactions.
 *
 * Audience = the post author only. Fired when a reaction is added (never on
 * removal). Anti-spam: a given reactor notifies a given post author at most
 * once per 30-minute window, and the push uses a per-post collapse tag.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  postId: z.string().uuid(),
  emoji: z.string().min(1).max(16),
});

const I18N: Record<string, { title: (e: string) => string; body: (a: string) => string }> = {
  fr: { title: (e) => `${e} Nouvelle réaction`, body: (a) => `${a} a réagi à votre publication` },
  en: { title: (e) => `${e} New reaction`, body: (a) => `${a} reacted to your post` },
  es: { title: (e) => `${e} Nueva reacción`, body: (a) => `${a} ha reaccionado a tu publicación` },
  de: { title: (e) => `${e} Neue Reaktion`, body: (a) => `${a} hat auf deinen Beitrag reagiert` },
  it: { title: (e) => `${e} Nuova reazione`, body: (a) => `${a} ha reagito al tuo post` },
  nl: { title: (e) => `${e} Nieuwe reactie`, body: (a) => `${a} reageerde op je bericht` },
  pt: { title: (e) => `${e} Nova reação`, body: (a) => `${a} reagiu à sua publicação` },
};

export const notifyWallReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    // The reaction must actually exist and belong to the caller.
    const { data: reaction } = await supabaseAdmin
      .from("wall_post_reactions")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", userId)
      .eq("emoji", data.emoji)
      .maybeSingle();
    if (!reaction) return { dispatched: 0, sent: 0 };

    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select("id, author_user_id, deleted_at")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post || (post as any).deleted_at) return { dispatched: 0, sent: 0 };

    const authorId = (post as any).author_user_id as string | null;
    if (!authorId || authorId === userId) return { dispatched: 0, sent: 0 };

    // Masquage personnel : pas de notification si l'auteur a masqué le réacteur.
    const { recipientHasMuted } = await import("@/lib/mutes.server");
    if (await recipientHasMuted(supabaseAdmin, userId, authorId)) {
      return { dispatched: 0, sent: 0, skipped: "muted" };
    }

    // Anti-spam: one reaction notification per post/author per 30 min.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", authorId)
      .eq("type", "wall_reaction")
      .eq("link", `/inbox#${data.postId}`)
      .gte("created_at", since)
      .limit(1);
    if ((recent ?? []).length > 0) return { dispatched: 0, sent: 0, skipped: "throttled" };

    const { data: reactor } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    const reactorName =
      [(reactor as any)?.first_name, (reactor as any)?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      ((reactor as any)?.full_name as string) ||
      "Un membre";

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("preferred_language, notifications_push")
      .eq("id", authorId)
      .maybeSingle();
    const lang = ((profile as any)?.preferred_language as string) || "fr";
    const t = I18N[lang] || I18N.fr;
    const title = t.title(data.emoji);
    const bodyText = t.body(reactorName);

    await supabaseAdmin.from("notifications").insert({
      user_id: authorId,
      type: "wall_reaction",
      title,
      body: bodyText,
      link: `/inbox#${data.postId}`,
    });

    let sent = 0;
    if ((profile as any)?.notifications_push !== false) {
      const res = await sendPushToUser(authorId, {
        title,
        body: bodyText,
        url: `/inbox?post=${data.postId}&from=push#${data.postId}`,
        tag: `wall-reaction-${data.postId}`,
      }).catch((e: unknown) => {
        console.warn("[push] wall reaction send failed", authorId, (e as Error).message);
        return { sent: 0, pruned: 0 };
      });
      sent = res.sent;
    }

    try {
      await supabaseAdmin.from("push_dispatch_log").insert({
        kind: "wall_reaction",
        ref_id: data.postId,
        targets_count: 1,
        sent_count: sent,
      });
    } catch (e) {
      console.warn("[push:wall-reaction] log insert failed", (e as Error).message);
    }

    return { dispatched: 1, sent };
  });
