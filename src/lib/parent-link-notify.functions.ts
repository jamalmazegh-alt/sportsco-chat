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

    const { data: allLinks, error: linksErr } = await supabaseAdmin
      .from("player_parents")
      .select(
        "player_id, full_name, email, players:player_id(id, first_name, last_name, club_id, clubs:club_id(id, name))",
      )
      .eq("parent_user_id", userId);
    if (linksErr) {
      console.error("[parent-child-linked] fetch links failed", linksErr);
      return { sent: 0 };
    }
    if (!allLinks || allLinks.length === 0) return { sent: 0 };

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) return { sent: 0 };

    // Garde-fou : si la fiche parent porte une adresse e-mail explicite qui
    // n'est PAS celle du compte rattaché (rattachement erroné, ex. un admin qui
    // a créé l'enfant puis renommé/ré-adressé le parent), on n'envoie rien —
    // sinon l'e-mail « votre enfant vous a été rattaché » part au mauvais
    // destinataire.
    const accountEmail = email.trim().toLowerCase();
    const links = allLinks.filter((l: any) => {
      const rowEmail = (l.email ?? "").trim().toLowerCase();
      return !rowEmail || rowEmail === accountEmail;
    });
    if (links.length === 0) return { sent: 0 };

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("first_name, preferred_language, notifications_email")
      .eq("id", userId)
      .maybeSingle();

    // ATOMIC CLAIM — on insère d'abord la ligne de dédoublonnage et on ne
    // garde que celles réellement insérées (ON CONFLICT DO NOTHING sur la PK
    // (parent_user_id, player_id)). Sans ça, deux appels concurrents (le hook
    // auth se déclenche sur SIGNED_IN + TOKEN_REFRESH) lisaient tous les deux
    // "pas encore notifié" et envoyaient chacun un e-mail.
    const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
      .from("parent_link_notifications")
      .upsert(
        links.map((l: any) => ({ parent_user_id: userId, player_id: l.player_id })),
        { onConflict: "parent_user_id,player_id", ignoreDuplicates: true },
      )
      .select("player_id");
    if (claimErr) {
      console.error("[parent-child-linked] claim failed", claimErr);
      return { sent: 0 };
    }
    const claimedSet = new Set((claimed ?? []).map((r: any) => r.player_id));
    const pending = links.filter((l: any) => claimedSet.has(l.player_id));
    if (pending.length === 0) return { sent: 0 };

    // Parent ayant coupé les e-mails : la claim suffit, on n'envoie rien.
    if (prof && (prof as any).notifications_email === false) {
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
        sent += 1;
      } catch (e) {
        console.error("[parent-child-linked] email failed", {
          userId,
          player_id: link.player_id,
          error: e instanceof Error ? e.message : String(e),
        });
        // Envoi raté : on relâche la claim pour permettre un retry au
        // prochain login.
        await (supabaseAdmin as any)
          .from("parent_link_notifications")
          .delete()
          .eq("parent_user_id", userId)
          .eq("player_id", link.player_id);
      }
    }
    return { sent };
  });
