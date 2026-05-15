import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  convocationId: z.string().uuid(),
});

/**
 * Send email notifications to coaches/admins of the team about a player's
 * convocation response. Called only for `absent` / `uncertain` statuses.
 * In-app notifications are inserted client-side; this fn handles email only.
 */
export const notifyCoachesEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { convocationId } = data;
    const { userId } = context;

    // Fetch convocation + event + player
    const { data: conv } = await supabaseAdmin
      .from("convocations")
      .select(
        "id, status, comment, player_id, event_id, players:player_id(first_name,last_name), events:event_id(id,title,starts_at,team_id)"
      )
      .eq("id", convocationId)
      .single();

    if (!conv || !conv.events) return { sent: 0 };
    const status = conv.status as string;
    if (status !== "absent" && status !== "uncertain") return { sent: 0 };

    const ev: any = conv.events;
    const player: any = conv.players ?? {};
    const playerName =
      `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Un joueur";

    // Permission check: caller must be related to the player (parent or the player themselves)
    const { data: canRespond } = await supabaseAdmin.rpc("can_respond_for_player", {
      _user_id: userId,
      _player_id: conv.player_id,
    });
    if (!canRespond) {
      throw new Error("Forbidden");
    }

    // Find coaches/admins of the team
    const { data: coaches } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", ev.team_id)
      .in("role", ["coach", "admin"]);

    const coachIds = Array.from(
      new Set((coaches ?? []).map((c: any) => c.user_id).filter(Boolean))
    );
    if (coachIds.length === 0) return { sent: 0 };

    // Fetch coach profiles + emails (auth.users via admin)
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, notifications_email")
      .in("id", coachIds);

    const baseUrl =
      process.env.SITE_URL ||
      "https://app.clubero.app";

    let sent = 0;
    for (const p of profs ?? []) {
      if ((p as any).notifications_email === false) continue;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById((p as any).id);
      const email = u?.user?.email;
      if (!email) continue;

      const startsAt = ev.starts_at ? new Date(ev.starts_at) : null;
      const eventDate = startsAt
        ? startsAt.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })
        : undefined;

      try {
        await fetch(`${baseUrl}/lovable/email/transactional/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // service role for internal call
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            templateName: "convocation-response",
            recipientEmail: email,
            idempotencyKey: `convoc-resp-${convocationId}-${p.id}-${status}`,
            templateData: {
              coachFirstName: (p as any).first_name ?? null,
              playerName,
              eventTitle: ev.title,
              eventDate,
              status,
              reason: conv.comment ?? null,
              eventUrl: `${baseUrl}/events/${ev.id}`,
            },
          }),
        });
        sent += 1;
      } catch (e) {
        // best effort
      }
    }
    return { sent };
  });
