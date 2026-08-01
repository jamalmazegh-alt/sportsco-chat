/**
 * Push notification fan-out for new event chat messages.
 *
 * Audience = convoked players (+ their parents) and the event staff, minus the
 * author. Players/parents are only notified when the club actually opened the
 * chat to them (clubs.event_chat_players_enabled / event_chat_parents_enabled),
 * mirroring `can_access_event_chat`.
 *
 * Anti-spam: no push if the same author already posted in the same event within
 * the last 5 minutes, and all pushes for an event share one collapse tag.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({ messageId: z.string().uuid() });

const GROUPING_WINDOW_MS = 5 * 60 * 1000;

const I18N: Record<
  string,
  { title: (ev: string) => string; body: (a: string, m: string) => string }
> = {
  fr: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a} : ${m}` },
  en: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a}: ${m}` },
  es: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a}: ${m}` },
  de: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a}: ${m}` },
  it: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a}: ${m}` },
  nl: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a}: ${m}` },
  pt: { title: (ev) => `💬 ${ev}`, body: (a, m) => `${a}: ${m}` },
};

export const dispatchEventChatPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");

    // The caller may only trigger a fan-out for their own message.
    const { data: msg } = await supabaseAdmin
      .from("event_messages")
      .select("id, event_id, author_user_id, body, created_at")
      .eq("id", data.messageId)
      .eq("author_user_id", userId)
      .maybeSingle();
    if (!msg) return { dispatched: 0, sent: 0 };

    const eventId = (msg as any).event_id as string;

    // Grouping: skip if this author already posted in this event recently.
    const since = new Date(
      new Date((msg as any).created_at as string).getTime() - GROUPING_WINDOW_MS,
    ).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("event_messages")
      .select("id")
      .eq("event_id", eventId)
      .eq("author_user_id", userId)
      .gte("created_at", since)
      .lt("created_at", (msg as any).created_at as string)
      .limit(1);
    if ((recent ?? []).length > 0) return { dispatched: 0, sent: 0, grouped: true };

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, type, opponent, team_id, teams:team_id(name, club_id)")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev?.team_id) return { dispatched: 0, sent: 0 };

    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.event_chat_new_message) return { dispatched: 0, sent: 0 };

    const { data: club } = clubId
      ? await supabaseAdmin
          .from("clubs")
          .select("event_chat_enabled, event_chat_players_enabled, event_chat_parents_enabled")
          .eq("id", clubId)
          .maybeSingle()
      : { data: null as any };
    if (club && (club as any).event_chat_enabled === false) return { dispatched: 0, sent: 0 };
    const playersAllowed = (club as any)?.event_chat_players_enabled !== false;
    const parentsAllowed = (club as any)?.event_chat_parents_enabled !== false;

    const targets = new Set<string>();

    // Staff: team staff + explicitly assigned staff.
    const [{ data: teamStaff }, { data: assigned }] = await Promise.all([
      supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("team_id", (ev as any).team_id)
        .in("role", ["coach", "admin", "dirigeant"] as any),
      supabaseAdmin.from("event_staff_assignments").select("user_id").eq("event_id", eventId),
    ]);
    for (const s of teamStaff ?? []) if ((s as any).user_id) targets.add((s as any).user_id);
    for (const s of assigned ?? []) if ((s as any).user_id) targets.add((s as any).user_id);

    // Convoked players + their parents.
    if (playersAllowed || parentsAllowed) {
      const { data: convs } = await supabaseAdmin
        .from("convocations")
        .select("player_id")
        .eq("event_id", eventId);
      const playerIds = Array.from(
        new Set((convs ?? []).map((c: any) => c.player_id).filter(Boolean)),
      ) as string[];
      if (playerIds.length > 0) {
        const [{ data: players }, { data: parents }] = await Promise.all([
          playersAllowed
            ? supabaseAdmin.from("players").select("user_id").in("id", playerIds)
            : Promise.resolve({ data: [] as any[] }),
          parentsAllowed
            ? supabaseAdmin
                .from("player_parents")
                .select("parent_user_id")
                .in("player_id", playerIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        for (const p of players ?? []) if ((p as any).user_id) targets.add((p as any).user_id);
        for (const p of parents ?? [])
          if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
      }
    }

    targets.delete(userId);
    if (targets.size === 0) return { dispatched: 0, sent: 0 };

    // Masquage personnel : ceux qui ont masqué l'auteur du message ne sont
    // pas notifiés (le message est de toute façon filtré chez eux).
    const { excludeRecipientsWhoMuted } = await import("@/lib/mutes.server");
    const allIds = await excludeRecipientsWhoMuted(supabaseAdmin, userId, Array.from(targets));
    if (allIds.length === 0) return { dispatched: 0, sent: 0 };
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
    const recipients = allIds.filter((uid) => prefByUser.get(uid)?.pushOn !== false);
    if (recipients.length === 0) return { dispatched: 0, sent: 0 };

    const { data: author } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    const authorName =
      [(author as any)?.first_name, (author as any)?.last_name].filter(Boolean).join(" ").trim() ||
      ((author as any)?.full_name as string) ||
      "Un membre";

    const teamName = ((ev as any).teams?.name as string | null) ?? null;
    const eventLabel =
      (ev as any).type === "match" && (ev as any).opponent
        ? [teamName, (ev as any).opponent].filter(Boolean).join(" vs ")
        : (ev as any).title || teamName || "Événement";

    const raw = (((msg as any).body as string) || "").trim();
    const preview = raw ? (raw.length > 90 ? `${raw.slice(0, 89)}…` : raw) : "📎 Pièce jointe";

    const results = await Promise.all(
      recipients.map((uid) => {
        const t = I18N[prefByUser.get(uid)?.lang || "fr"] || I18N.fr;
        return sendPushToUser(uid, {
          title: t.title(eventLabel),
          body: t.body(authorName, preview),
          url: `/events/${eventId}?chat=1`,
          tag: `event-chat-${eventId}`,
        }).catch((e: unknown) => {
          console.warn("[push] event chat send failed", uid, (e as Error).message);
          return { sent: 0, pruned: 0 };
        });
      }),
    );
    const sent = results.reduce((total, r) => total + r.sent, 0);

    try {
      await supabaseAdmin.from("push_dispatch_log").insert({
        kind: "event_chat",
        ref_id: data.messageId,
        targets_count: recipients.length,
        sent_count: sent,
      });
    } catch (e) {
      console.warn("[push:event-chat] log insert failed", (e as Error).message);
    }

    return { dispatched: recipients.length, sent };
  });
