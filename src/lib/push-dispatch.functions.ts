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
    console.log("[push] wall handler START v4", { postId: data.postId, userId: context.userId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    // 1) Idempotence — atomic insert; on conflict skip the whole dispatch.
    const { error: dedupErr } = await supabaseAdmin
      .from("push_dispatch_log")
      .insert({ kind: "wall_post", ref_id: data.postId });
    if (dedupErr) {
      console.log("[push] wall BAIL already dispatched", { postId: data.postId, code: dedupErr.code });
      return { dispatched: 0, deduped: true };
    }

    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select("id, club_id, author_user_id, deleted_at")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post || (post as any).deleted_at) {
      console.log("[push] wall BAIL no post or deleted");
      return { dispatched: 0 };
    }

    // Gate: wall_new_post (per-club admin setting)
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const clubId = (post as any).club_id as string;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.wall_new_post) {
      console.log("[push] wall BAIL settings disabled");
      return { dispatched: 0 };
    }

    // Resolve author display name + club name (used in body, NOT post content).
    const [{ data: author }, { data: club }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("full_name, first_name, last_name")
        .eq("id", (post as any).author_user_id)
        .maybeSingle(),
      supabaseAdmin.from("clubs").select("name").eq("id", clubId).maybeSingle(),
    ]);
    const authorName =
      ([(author as any)?.first_name, (author as any)?.last_name].filter(Boolean).join(" ").trim()) ||
      ((author as any)?.full_name as string) ||
      "Un membre";
    const clubName = ((club as any)?.name as string) || "votre club";

    // 2) Candidate recipients = club members minus author.
    const { data: members } = await supabaseAdmin
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId);
    const candidates = new Set<string>();
    for (const m of members ?? []) {
      const uid = (m as any).user_id as string | null;
      if (!uid || uid === context.userId) continue;
      candidates.add(uid);
    }
    if (candidates.size === 0) {
      return { dispatched: 0, sent: 0 };
    }

    const allIds = Array.from(candidates);

    // 3) Privacy / consent filter: drop users who turned push OFF,
    //    fetch their preferred language in the same query.
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

    // 4) Minor protection — if a candidate is a player <16, drop them.
    //    Tutors/parents are independent club_members and remain in the set.
    const { data: minorPlayers } = await supabaseAdmin
      .from("players")
      .select("user_id, birth_date")
      .in("user_id", allIds)
      .not("birth_date", "is", null);
    const now = Date.now();
    const minorUserIds = new Set<string>();
    for (const p of minorPlayers ?? []) {
      const uid = (p as any).user_id as string | null;
      const dob = (p as any).birth_date as string | null;
      if (!uid || !dob) continue;
      const ageMs = now - new Date(dob).getTime();
      const ageYears = ageMs / (365.25 * 24 * 3600 * 1000);
      if (ageYears < 16) minorUserIds.add(uid);
    }

    const targets: string[] = [];
    for (const uid of allIds) {
      if (minorUserIds.has(uid)) continue;
      const pref = prefByUser.get(uid);
      if (pref && pref.pushOn === false) continue;
      targets.push(uid);
    }

    // 5) Localized copy (recipient language). Payload carries NO post content.
    const I18N: Record<string, { title: string; body: (a: string, c: string) => string }> = {
      fr: { title: "Nouveau message sur le mur", body: (a, c) => `${a} a publié dans ${c}` },
      en: { title: "New post on the wall", body: (a, c) => `${a} posted in ${c}` },
      de: { title: "Neuer Beitrag an der Pinnwand", body: (a, c) => `${a} hat in ${c} gepostet` },
      es: { title: "Nuevo mensaje en el muro", body: (a, c) => `${a} publicó en ${c}` },
      it: { title: "Nuovo messaggio sulla bacheca", body: (a, c) => `${a} ha pubblicato in ${c}` },
      nl: { title: "Nieuw bericht op de muur", body: (a, c) => `${a} heeft gepost in ${c}` },
      pt: { title: "Nova mensagem no mural", body: (a, c) => `${a} publicou em ${c}` },
    };

    // 6) Send. Tag is per-club so the OS groups posts from the same club.
    //    URL goes to /inbox where RLS re-verifies access at open time.
    const sends = targets.map((uid) => {
      const lang = prefByUser.get(uid)?.lang || "fr";
      const t = I18N[lang] || I18N.fr;
      return sendPushToUser(uid, {
        title: t.title,
        body: t.body(authorName, clubName),
        url: "/inbox",
        tag: `wall-club-${clubId}`,
      }).catch((e: unknown) => {
        console.warn("[push] wall send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      });
    });
    const results = await Promise.all(sends);
    const sent = results.reduce((t, r) => t + r.sent, 0);
    const pruned = results.reduce((t, r) => t + r.pruned, 0);

    // Update log with counts (best-effort).
    await supabaseAdmin
      .from("push_dispatch_log")
      .update({ targets_count: targets.length, sent_count: sent })
      .eq("kind", "wall_post")
      .eq("ref_id", data.postId);

    console.log("[push] wall dispatched v4", {
      postId: (post as any).id,
      clubId,
      candidates: candidates.size,
      minorsExcluded: minorUserIds.size,
      targets: targets.length,
      sent,
      pruned,
    });
    return { dispatched: targets.length, sent, pruned };
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

    const sends = Array.from(targets).map((uid) =>
      sendPushToUser(uid, {
        title: "📅 Événement reporté",
        body: `${headline} déplacé au ${dateStr} à ${timeStr}`,
        url: `/events/${data.eventId}`,
        tag: `reschedule-${data.eventId}-${dayTag}`,
      }).catch((e: unknown) => {
        console.warn("[push] reschedule send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      }),
    );
    const results = await Promise.all(sends);
    const sent = results.reduce((t: number, r: { sent: number }) => t + r.sent, 0);
    return { dispatched: targets.size, sent };
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
    const { sendPushToUser } = await import("@/lib/push-send.server");
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

    const sends = Array.from(targets).map((uid) =>
      sendPushToUser(uid, {
        title: "❌ Événement annulé",
        body: `${headline} du ${dateStr} à ${timeStr} est annulé`,
        url: `/events/${data.eventId}`,
        tag: `cancel-${data.eventId}`,
      }).catch((e: unknown) => {
        console.warn("[push] cancel send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      }),
    );
    const results = await Promise.all(sends);
    const sent = results.reduce((t: number, r: { sent: number }) => t + r.sent, 0);
    return { dispatched: targets.size, sent };
  });
