import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Send a one-shot "your child was linked to you as a parent" email for any
 * player_parents row that was just claimed by this user (via
 * link_parent_memberships) and has not yet been notified.
 *
 * Idempotent — every (parent_user_id, player_id) pair is recorded in
 * public.parent_link_notifications after emailing, so repeated logins do not
 * re-send.
 */
export const notifyNewlyLinkedChildren = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    const { data: links, error: linksErr } = await supabaseAdmin
      .from("player_parents")
      .select(
        "player_id, full_name, players:player_id(id, first_name, last_name, club_id, clubs:club_id(id, name))",
      )
      .eq("parent_user_id", userId);
    if (linksErr) {
      console.error("[parent-child-linked] fetch links failed", linksErr);
      return { sent: 0 };
    }
    if (!links || links.length === 0) return { sent: 0 };

    const playerIds = links.map((l: any) => l.player_id);
    const { data: already } = await (supabaseAdmin as any)
      .from("parent_link_notifications")
      .select("player_id")
      .eq("parent_user_id", userId)
      .in("player_id", playerIds);

    const notifiedSet = new Set((already ?? []).map((r: any) => r.player_id));
    const pending = links.filter((l: any) => !notifiedSet.has(l.player_id));
    if (pending.length === 0) return { sent: 0 };

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) return { sent: 0 };

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("first_name, preferred_language, notifications_email")
      .eq("id", userId)
      .maybeSingle();

    // If the parent disabled email notifications, record the pending links as
    // notified so we don't recheck every login, and skip sending.
    if (prof && (prof as any).notifications_email === false) {
      await (supabaseAdmin as any)
        .from("parent_link_notifications")
        .insert(
          pending.map((p: any) => ({ parent_user_id: userId, player_id: p.player_id })),
        );
      return { sent: 0 };
    }


    const locale = (prof as any)?.preferred_language === "en" ? "en" : "fr";
    const baseUrl = process.env.SITE_URL || "https://www.clubero.app";

    let sent = 0;
    for (const link of pending) {
      const player = (link as any).players;
      const playerName =
        [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim() ||
        (link as any).full_name ||
        (locale === "fr" ? "votre enfant" : "your child");
      const clubName: string | undefined = player?.clubs?.name ?? undefined;
      try {
        await enqueueTransactionalEmailServer({
          templateName: "parent-child-linked",
          recipientEmail: email,
          idempotencyKey: `parent-linked-${userId}-${link.player_id}`,
          recipientId: userId,
          notificationType: "parent_child_linked",
          fromName: clubName ? `${clubName} via Clubero` : undefined,
          templateData: {
            parentFirstName: (prof as any)?.first_name ?? undefined,
            playerName,
            clubName,
            appUrl: `${baseUrl}/`,
            locale,
          },
        });
        await (supabaseAdmin as any)
          .from("parent_link_notifications")
          .insert({ parent_user_id: userId, player_id: link.player_id });

        sent += 1;
      } catch (e) {
        console.error("[parent-child-linked] email failed", {
          userId,
          player_id: link.player_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { sent };
  });
