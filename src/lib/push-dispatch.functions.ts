/**
 * Client-callable server functions that fan out Web Push notifications.
 * All run fire-and-forget on the server, so callers should not await them
 * blocking the UI (but await is fine — they swallow errors).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* Convocation creation push                                          */
/* ------------------------------------------------------------------ */
const ConvocationInput = z.object({
  eventId: z.string().uuid(),
  playerIds: z.array(z.string().uuid()).max(200),
});

export const dispatchConvocationPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConvocationInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, starts_at, type, team_id, opponent, is_home, location, teams:team_id(name, club_id)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

    // Gate: convocation_on_create
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.convocation_on_create) return { dispatched: 0 };


    const [{ data: players }, { data: parents }] = await Promise.all([
      supabaseAdmin
        .from("players")
        .select("id, user_id")
        .in("id", data.playerIds),
      supabaseAdmin
        .from("player_parents")
        .select("player_id, parent_user_id")
        .in("player_id", data.playerIds),
    ]);

    const targets = new Set<string>();
    for (const p of players ?? []) if ((p as any).user_id) targets.add((p as any).user_id);
    for (const p of parents ?? []) if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);

    const dt = new Date((ev as any).starts_at);
    const dateStr = dt.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const isMatch = (ev as any).type === "match";
    const teamName = ((ev as any).teams?.name as string | null) ?? null;
    const opponent = ((ev as any).opponent as string | null) ?? null;
    const isHome = (ev as any).is_home as boolean | null | undefined;
    const location = ((ev as any).location as string | null) ?? null;

    let headline: string;
    if (isMatch && opponent) {
      headline = teamName ? `${teamName} vs ${opponent}` : `vs ${opponent}`;
    } else if (isMatch) {
      headline = teamName ? `Match — ${teamName}` : "Match";
    } else {
      headline = (ev as any).title || "Événement";
    }
    const venueBit = isMatch
      ? (isHome === true ? " · Domicile" : isHome === false ? " · Extérieur" : "")
      : (location ? ` · ${location}` : "");

    const sends = Array.from(targets).map((uid) =>
      sendPushToUser(uid, {
        title: isMatch ? "⚽ Convocation match" : "📣 Convocation",
        body: `${headline} — ${dateStr} à ${timeStr}${venueBit}`,
        url: `/events/${data.eventId}`,
        tag: `conv-new-${data.eventId}-${uid}`,
      }).catch((e) => {
        console.warn("[push] convocation send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      }),
    );
    const results = await Promise.all(sends);
    const sent = results.reduce((total, result) => total + result.sent, 0);
    return { dispatched: targets.size, sent };
  });

/* ------------------------------------------------------------------ */
/* Match score push                                                   */
/* ------------------------------------------------------------------ */
const ScoreInput = z.object({
  eventId: z.string().uuid(),
});

export const dispatchScorePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScoreInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, team_id, opponent, is_home, teams:team_id(name, club_id)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

    // Gate: score_result
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.score_result) return { dispatched: 0 };

    const { data: result } = await supabaseAdmin
      .from("match_results")
      .select("home_score, away_score")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (!result) return { dispatched: 0 };

    const teamName = ((ev as any).teams?.name as string) || "Équipe";
    const opp = ((ev as any).opponent as string) || "Adversaire";
    const home = (ev as any).is_home !== false;
    const sh = (result as any).home_score;
    const sa = (result as any).away_score;
    const body = home
      ? `${teamName} ${sh}-${sa} ${opp}`
      : `${opp} ${sh}-${sa} ${teamName}`;

    // Fan out to all convoqués + coaches of the team
    const teamId = (ev as any).team_id as string | null;
    const targets = new Set<string>();

    if (teamId) {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId);
      for (const m of tm ?? []) if ((m as any).user_id) targets.add((m as any).user_id);
    }

    const { data: convs } = await supabaseAdmin
      .from("convocations")
      .select("player_id, players:player_id(user_id)")
      .eq("event_id", data.eventId);
    const playerIds = (convs ?? []).map((c: any) => c.player_id);
    for (const c of convs ?? []) {
      const uid = (c as any).players?.user_id;
      if (uid) targets.add(uid);
    }
    if (playerIds.length > 0) {
      const { data: parents } = await supabaseAdmin
        .from("player_parents")
        .select("parent_user_id")
        .in("player_id", playerIds);
      for (const p of parents ?? []) if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }

    const sends = Array.from(targets).map((uid) =>
      sendPushToUser(uid, {
        title: "🏆 Résultat",
        body,
        url: `/events/${data.eventId}`,
        tag: `score-${data.eventId}`,
      }).catch((e: unknown) => {
        console.warn("[push] score send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      }),
    );
    const results = await Promise.all(sends);
    const sent = results.reduce((t: number, r: { sent: number }) => t + r.sent, 0);
    return { dispatched: targets.size, sent };
  });

/* ------------------------------------------------------------------ */
/* Wall post push                                                     */
/* ------------------------------------------------------------------ */
const WallInput = z.object({
  postId: z.string().uuid(),
});

export const dispatchWallPostPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WallInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select("id, club_id, body, author_user_id, profiles:author_user_id(full_name, first_name)")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post) return { dispatched: 0 };

    // Gate: wall_new_post
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const settings = await getClubNotifSettings((post as any).club_id as string | null);
    if (!settings.wall_new_post) return { dispatched: 0 };


    const authorName =
      ((post as any).profiles?.first_name as string) ||
      ((post as any).profiles?.full_name as string)?.split(" ")[0] ||
      "Un membre";

    const raw = ((post as any).body as string) || "";
    const trimmed = raw.length > 60 ? `${raw.slice(0, 57).trim()}…` : raw;

    const { data: members } = await supabaseAdmin
      .from("club_members")
      .select("user_id")
      .eq("club_id", (post as any).club_id);

    const targets: string[] = [];
    for (const m of members ?? []) {
      const uid = (m as any).user_id;
      if (!uid || uid === context.userId) continue; // skip author
      targets.push(uid);
    }
    const sends = targets.map((uid) =>
      sendPushToUser(uid, {
        title: `💬 ${authorName}`,
        body: trimmed,
        url: "/home",
        tag: `wall-${(post as any).id}`,
      }).catch((e: unknown) => {
        console.warn("[push] wall send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      }),
    );
    await Promise.all(sends);
    return { dispatched: targets.length };
  });

/* ------------------------------------------------------------------ */
/* #7 — Convocation response push (authenticated caller)              */
/* ------------------------------------------------------------------ */
const ResponseInput = z.object({
  convocationId: z.string().uuid(),
});

export const dispatchConvocationResponsePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResponseInput.parse(input))
  .handler(async ({ data }) => {
    const { fanoutConvocationResponse, fanoutConvocationComplete } = await import(
      "@/lib/push-fanout.server"
    );
    // No excludeUserId: targets are coaches only; even when a coach responds
    // on behalf of a player, the coach still wants to see the confirmation.
    const { dispatched, eventId } = await fanoutConvocationResponse(data.convocationId);
    let complete = 0;
    if (eventId) {
      const r = await fanoutConvocationComplete(eventId);
      complete = r.dispatched;
    }
    return { dispatched, complete };
  });

/* ------------------------------------------------------------------ */
/* #10 — Tournament draw published                                     */
/* ------------------------------------------------------------------ */
const DrawInput = z.object({
  tournament_id: z.string().uuid(),
});

export const dispatchTournamentDrawPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DrawInput.parse(input))
  .handler(async ({ data }) => {
    const { fanoutTournamentDraw } = await import("@/lib/push-fanout.server");
    return fanoutTournamentDraw(data.tournament_id);
  });

/* ------------------------------------------------------------------ */
/* #5 — Event rescheduled push                                        */
/* ------------------------------------------------------------------ */
const RescheduleInput = z.object({
  eventId: z.string().uuid(),
});

export const dispatchEventReschedulePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RescheduleInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, starts_at, type, team_id, opponent, is_home, convocations_sent, teams:team_id(name, club_id)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };
    // Only notify if convocations were already sent
    if (!(ev as any).convocations_sent) return { dispatched: 0 };

    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.event_reschedule) return { dispatched: 0 };

    const { data: convs } = await supabaseAdmin
      .from("convocations")
      .select("player_id, players:player_id(user_id)")
      .eq("event_id", data.eventId);
    const playerIds = (convs ?? []).map((c: any) => c.player_id);

    const targets = new Set<string>();
    for (const c of convs ?? []) {
      const uid = (c as any).players?.user_id;
      if (uid) targets.add(uid);
    }
    if (playerIds.length > 0) {
      const { data: parents } = await supabaseAdmin
        .from("player_parents")
        .select("parent_user_id")
        .in("player_id", playerIds);
      for (const p of parents ?? []) if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }

    const dt = new Date((ev as any).starts_at);
    const dateStr = dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const isMatch = (ev as any).type === "match";
    const teamName = ((ev as any).teams?.name as string | null) ?? null;
    const opponent = ((ev as any).opponent as string | null) ?? null;
    let headline: string;
    if (isMatch && opponent) {
      headline = teamName ? `${teamName} vs ${opponent}` : `Match vs ${opponent}`;
    } else if (isMatch) {
      headline = teamName ? `Match ${teamName}` : "Match";
    } else {
      headline = (ev as any).title || "Événement";
    }
    const dayTag = dt.toISOString().slice(0, 10);

    for (const uid of targets) {
      sendPushToUserFireAndForget(uid, {
        title: "📅 Événement reporté",
        body: `${headline} déplacé au ${dateStr} à ${timeStr}`,
        url: `/events/${data.eventId}`,
        tag: `reschedule-${data.eventId}-${dayTag}`,
      });
    }
    return { dispatched: targets.size };
  });

/* ------------------------------------------------------------------ */
/* #6 — Event cancelled push                                          */
/* ------------------------------------------------------------------ */
const CancelInput = z.object({
  eventId: z.string().uuid(),
  previousStartsAt: z.string().optional(),
});

export const dispatchEventCancelPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CancelInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUserFireAndForget } = await import("@/lib/push-send.server");
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, starts_at, type, team_id, opponent, is_home, teams:team_id(name, club_id)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.event_cancel) return { dispatched: 0 };

    const { data: convs } = await supabaseAdmin
      .from("convocations")
      .select("player_id, players:player_id(user_id)")
      .eq("event_id", data.eventId);
    const playerIds = (convs ?? []).map((c: any) => c.player_id);

    const targets = new Set<string>();
    for (const c of convs ?? []) {
      const uid = (c as any).players?.user_id;
      if (uid) targets.add(uid);
    }
    if (playerIds.length > 0) {
      const { data: parents } = await supabaseAdmin
        .from("player_parents")
        .select("parent_user_id")
        .in("player_id", playerIds);
      for (const p of parents ?? []) if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }

    const startIso = data.previousStartsAt || ((ev as any).starts_at as string);
    const dt = new Date(startIso);
    const dateStr = dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const isMatch = (ev as any).type === "match";
    const teamName = ((ev as any).teams?.name as string | null) ?? null;
    const opponent = ((ev as any).opponent as string | null) ?? null;
    let headline: string;
    if (isMatch && opponent) {
      headline = teamName ? `${teamName} vs ${opponent}` : `Match vs ${opponent}`;
    } else if (isMatch) {
      headline = teamName ? `Match ${teamName}` : "Match";
    } else {
      headline = (ev as any).title || "Événement";
    }

    for (const uid of targets) {
      sendPushToUserFireAndForget(uid, {
        title: "❌ Événement annulé",
        body: `${headline} du ${dateStr} à ${timeStr} est annulé`,
        url: `/events/${data.eventId}`,
        tag: `cancel-${data.eventId}`,
      });
    }
    return { dispatched: targets.size };
  });
