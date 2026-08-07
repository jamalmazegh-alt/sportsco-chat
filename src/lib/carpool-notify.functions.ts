import { resolveClubTz } from "@/lib/time/club-tz";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const InputSchema = z.object({ needId: z.string().uuid() });

const SUPPORTED = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);
const resolveLocale = (...c: Array<string | null | undefined>) => {
  for (const x of c) {
    const v = (x ?? "").toLowerCase().slice(0, 2);
    if (SUPPORTED.has(v)) return v;
  }
  return "fr";
};

async function assertCanManageCarpoolNeed(
  supabase: SupabaseClient<Database>,
  userId: string,
  needId: string,
) {
  // Resolve the client-provided id through the authenticated, RLS-scoped client
  // before any service-role query. The explicit owner filter prevents a caller
  // from using another member's visible need to trigger duplicate emails.
  const { data: need, error } = await supabase
    .from("carpool_needs")
    .select("id, event_id, parent_user_id, player_ids, note")
    .eq("id", needId)
    .eq("parent_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!need) throw new Error("Forbidden");
  return need;
}

/**
 * Notify a team's staff (coaches / assistant coaches / admins) by email that a
 * parent or player declared a carpool need for an event.
 * In-app notifications are already handled by the notify_carpool_needs_ride trigger.
 */
export const notifyCoachesOfCarpoolNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await assertCanManageCarpoolNeed(supabase, userId, data.needId);

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, starts_at, team_id, opponent, teams:team_id(name, club_id)")
      .eq("id", need.event_id)
      .maybeSingle();
    if (!ev?.team_id) return { sent: 0 };

    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id, first_name, last_name")
      .in("id", (need.player_ids ?? []) as string[]);
    const playerNames =
      (players ?? [])
        .map((p: any) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim())
        .filter(Boolean)
        .join(", ") || "Un joueur";

    const { data: requester } = await supabaseAdmin
      .from("profiles")
      .select("first_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    const requesterName =
      (requester as any)?.full_name || (requester as any)?.first_name || undefined;

    // NB: `app_role` n'a pas de valeur "assistant_coach" — utiliser un rôle
    // inexistant fait échouer toute la requête PostgREST (enum invalide).
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", ev.team_id)
      .in("role", ["coach", "admin", "dirigeant"] as any);
    if (staffError) console.error("[carpool-need] staff query failed", staffError.message);
    const staffIds = Array.from(
      new Set(
        (staff ?? []).map((s: any) => s.user_id).filter((u: string | null) => u && u !== userId),
      ),
    ) as string[];
    if (staffIds.length === 0) return { sent: 0 };

    const { data: club } = ev.teams
      ? await supabaseAdmin
          .from("clubs")
          .select("name, default_language, timezone")
          .eq("id", (ev.teams as any).club_id)
          .maybeSingle()
      : { data: null as any };

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, notifications_email, preferred_language")
      .in("id", staffIds);

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    const baseUrl = process.env.SITE_URL || "https://app.clubero.app";
    const eventTitle =
      ev.title ||
      [(ev.teams as any)?.name, ev.opponent].filter(Boolean).join(" vs ") ||
      "événement";

    let sent = 0;
    for (const p of profs ?? []) {
      if ((p as any).notifications_email === false) continue;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById((p as any).id);
      const email = u?.user?.email;
      if (!email) continue;

      const locale = resolveLocale(
        (p as any).preferred_language,
        (club as any)?.default_language ?? null,
      );
      const bcp = locale === "en" ? "en-GB" : `${locale}-${locale.toUpperCase()}`;
      let eventDate: string | undefined;
      try {
        eventDate = ev.starts_at
          ? new Date(ev.starts_at as string).toLocaleString(bcp, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: resolveClubTz((club as any)?.timezone ?? null),
            })
          : undefined;
      } catch {
        eventDate = undefined;
      }

      try {
        await enqueueTransactionalEmailServer({
          templateName: "carpool-need",
          recipientEmail: email,
          idempotencyKey: `carpool-need-${need.id}-${(p as any).id}`,
          recipientId: (p as any).id,
          eventId: need.event_id,
          notificationType: "carpool_need",
          fromName: (club as any)?.name ? `${(club as any).name} via Clubero` : undefined,
          templateData: {
            coachFirstName: (p as any).first_name ?? undefined,
            playerNames,
            requesterName,
            eventTitle,
            eventDate,
            note: need.note ?? undefined,
            eventUrl: `${baseUrl}/events/${need.event_id}`,
            locale,
            tz: resolveClubTz((club as any)?.timezone ?? null),
          },
        });
        sent += 1;
      } catch (e) {
        console.error("[carpool-need] email failed", {
          needId: need.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { sent };
  });
