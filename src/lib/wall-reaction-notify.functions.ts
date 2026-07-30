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

const I18N: Record<string, { title: (a: string, e: string) => string; body: string }> = {
  fr: { title: (a, e) => `${e} ${a} a réagi à votre publication`, body: "Voir la publication" },
  en: { title: (a, e) => `${e} ${a} reacted to your post`, body: "View the post" },
  es: { title: (a, e) => `${e} ${a} ha reaccionado a tu publicación`, body: "Ver la publicación" },
  de: { title: (a, e) => `${e} ${a} hat auf deinen Beitrag reagiert`, body: "Beitrag ansehen" },
  it: { title: (a, e) => `${e} ${a} ha reagito al tuo post`, body: "Vedi il post" },
  nl: { title: (a, e) => `${e} ${a} reageerde op je bericht`, body: "Bekijk het bericht" },
  pt: { title: (a, e) => `${e} ${a} reagiu à sua publicação`, body: "Ver a publicação" },
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
    const title = t.title(reactorName, data.emoji);

    await supabaseAdmin.from("notifications").insert({
      user_id: authorId,
      type: "wall_reaction",
      title,
      body: t.body,
      link: `/inbox#${data.postId}`,
    });

    let sent = 0;
    if ((profile as any)?.notifications_push !== false) {
      const res = await sendPushToUser(authorId, {
        title,
        body: t.body,
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
