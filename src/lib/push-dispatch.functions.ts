/**
 * Client-callable server functions that fan out Web Push notifications.
 * All run fire-and-forget on the server, so callers should not await them
 * blocking the UI (but await is fine — they swallow errors).
 *
 * ⚠️ SÉCURITÉ — visibilité liste des convoqués (call_up_list_visible)
 * Les helpers appelés en aval (`push-fanout.server.ts`) tournent en
 * service_role et BYPASSENT la RLS, y compris la RESTRICTIVE
 * `convocations_visibility_gate` / `event_lineups_visibility_gate`.
 *
 * NE PAS ajouter ici de payload push contenant un agrégat de convoqués
 * (compteur "X joueurs convoqués", liste de noms, aperçu de compo, etc.)
 * destiné à un non-staff sans gating explicite via
 * `public.call_up_list_visible(event_id)`. La RLS ne rattrapera pas.
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
      .select(
        "id, title, starts_at, type, team_id, opponent, is_home, location, teams:team_id(name, club_id)",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

    // Gate: convocation_on_create
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    if (!settings.convocation_on_create) return { dispatched: 0 };

    const [{ data: players }, { data: parents }] = await Promise.all([
      supabaseAdmin.from("players").select("id, user_id").in("id", data.playerIds),
      supabaseAdmin
        .from("player_parents")
        .select("player_id, parent_user_id")
        .in("player_id", data.playerIds),
    ]);

    const targets = new Set<string>();
    for (const p of players ?? []) if ((p as any).user_id) targets.add((p as any).user_id);
    for (const p of parents ?? [])
      if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);

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
      ? isHome === true
        ? " · Domicile"
        : isHome === false
          ? " · Extérieur"
          : ""
      : location
        ? ` · ${location}`
        : "";

    console.log("[push:conv-new] dispatch begin", {
      eventId: data.eventId,
      playerIds: data.playerIds.length,
      targets: targets.size,
    });
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
    const pruned = results.reduce((total, result) => total + result.pruned, 0);
    console.log("[push:conv-new] dispatch done", {
      eventId: data.eventId,
      targets: targets.size,
      sent,
      pruned,
    });
    try {
      await supabaseAdmin.from("push_dispatch_log").insert({
        kind: "convocation_new",
        ref_id: data.eventId,
        targets_count: targets.size,
        sent_count: sent,
      });
    } catch (e) {
      console.warn("[push:conv-new] log insert failed", (e as Error).message);
    }
    return { dispatched: targets.size, sent };
  });

/* ------------------------------------------------------------------ */
/* Convocation resend / update push                                   */
/* ------------------------------------------------------------------ */
const ConvocationResendInput = z.object({
  eventId: z.string().uuid(),
  playerIds: z.array(z.string().uuid()).max(200),
  hasChanges: z.boolean().optional(),
});

export const dispatchConvocationResendPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConvocationResendInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select(
        "id, title, starts_at, type, team_id, opponent, is_home, location, teams:team_id(name, club_id)",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
    const settings = await getClubNotifSettings(clubId);
    // Resend reuses the "convocation_on_create" gate — same channel as the
    // initial send. If the club opted out of that, we skip.
    if (!settings.convocation_on_create) return { dispatched: 0 };

    const [{ data: players }, { data: parents }] = await Promise.all([
      supabaseAdmin.from("players").select("id, user_id").in("id", data.playerIds),
      supabaseAdmin
        .from("player_parents")
        .select("player_id, parent_user_id")
        .in("player_id", data.playerIds),
    ]);

    const targets = new Set<string>();
    for (const p of players ?? []) if ((p as any).user_id) targets.add((p as any).user_id);
    for (const p of parents ?? [])
      if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);

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
      ? isHome === true
        ? " · Domicile"
        : isHome === false
          ? " · Extérieur"
          : ""
      : location
        ? ` · ${location}`
        : "";

    const title = data.hasChanges ? "🔄 Convocation mise à jour" : "🔄 Convocation renvoyée";

    console.log("[push:conv-resend] dispatch begin", {
      eventId: data.eventId,
      playerIds: data.playerIds.length,
      targets: targets.size,
      hasChanges: !!data.hasChanges,
    });
    const sends = Array.from(targets).map((uid) =>
      sendPushToUser(uid, {
        title,
        body: `${headline} — ${dateStr} à ${timeStr}${venueBit}`,
        url: `/events/${data.eventId}`,
        tag: `conv-resend-${data.eventId}-${uid}`,
      }).catch((e) => {
        console.warn("[push] convocation resend send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      }),
    );
    const results = await Promise.all(sends);
    const sent = results.reduce((total, result) => total + result.sent, 0);
    console.log("[push:conv-resend] dispatch done", {
      eventId: data.eventId,
      targets: targets.size,
      sent,
    });
    try {
      await supabaseAdmin.from("push_dispatch_log").insert({
        kind: "convocation_resend",
        ref_id: data.eventId,
        targets_count: targets.size,
        sent_count: sent,
      });
    } catch (e) {
      console.warn("[push:conv-resend] log insert failed", (e as Error).message);
    }
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
    const sh = (result as any).home_score as number;
    const sa = (result as any).away_score as number;
    const ourScore = home ? sh : sa;
    const theirScore = home ? sa : sh;
    const outcome: "win" | "loss" | "draw" =
      ourScore > theirScore ? "win" : ourScore < theirScore ? "loss" : "draw";
    const outcomeLabel =
      outcome === "win" ? "Victoire" : outcome === "loss" ? "Défaite" : "Match nul";
    const outcomeEmoji = outcome === "win" ? "🎉" : outcome === "loss" ? "😞" : "🤝";
    const title = `${outcomeEmoji} ${outcomeLabel} — ${teamName}`;
    const scoreLine = home ? `${teamName} ${sh}-${sa} ${opp}` : `${opp} ${sh}-${sa} ${teamName}`;
    const body = scoreLine;

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
      for (const p of parents ?? [])
        if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }

    const sends = Array.from(targets).map((uid) =>
      sendPushToUser(uid, {
        title,
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

/**
 * Minor-protection threshold for wall push notifications.
 * Players whose account is linked to a player record younger than this
 * age — OR whose birth_date is unknown — are excluded from push fanout.
 * Tutors/parents (independent club_members) are unaffected.
 *
 * Documented constant rather than a magic number: the legal/cultural
 * threshold varies by country and club; configurability per-club will
 * land when a real need surfaces.
 */
const MINOR_PUSH_THRESHOLD_YEARS = 16;

export const dispatchWallPostPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WallInput.parse(input))
  .handler(async ({ data, context }) => {
    console.log("[push] wall handler START v7", { postId: data.postId, userId: context.userId });
    const { dispatchWallPostPushInternal } = await import("@/lib/push-dispatch-wall.server");
    return dispatchWallPostPushInternal(data.postId, { excludeUserId: context.userId });
  });

/* ------------------------------------------------------------------ */
/* Wall post push — opened analytics                                   */
/* ------------------------------------------------------------------ */
const WallOpenedInput = z.object({
  postId: z.string().uuid(),
});

export const trackWallPostPushOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WallOpenedInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Re-check access via RLS as the calling user before counting the open.
    // If the user can no longer SELECT the post (removed from club, deleted),
    // we do not record the event and the caller falls back to the wall.
    const { data: visible } = await context.supabase
      .from("wall_posts")
      .select("id")
      .eq("id", data.postId)
      .maybeSingle();
    if (!visible) {
      console.log("[push] wall_post_push_opened DENIED", {
        postId: data.postId,
        userId: context.userId,
      });
      return { tracked: false, reason: "no_access" as const };
    }

    // Increment opened_count; set first_opened_at once. Best-effort read/update
    // (race-tolerant — analytics counters, not billing).
    const { data: row } = await supabaseAdmin
      .from("push_dispatch_log")
      .select("opened_count, first_opened_at")
      .eq("kind", "wall_post")
      .eq("ref_id", data.postId)
      .maybeSingle();
    if (row) {
      await supabaseAdmin
        .from("push_dispatch_log")
        .update({
          opened_count: ((row as any).opened_count ?? 0) + 1,
          first_opened_at: (row as any).first_opened_at ?? new Date().toISOString(),
        })
        .eq("kind", "wall_post")
        .eq("ref_id", data.postId);
    }

    console.log("[analytics] wall_post_push_opened", {
      postId: data.postId,
      userId: context.userId,
      at: new Date().toISOString(),
    });
    return { tracked: true };
  });

/* ------------------------------------------------------------------ */
/* #7 — Convocation response push (authenticated caller)              */
/* ------------------------------------------------------------------ */
const ResponseInput = z.object({
  convocationId: z.string().uuid(),
  isChange: z.boolean().optional(),
});

export const dispatchConvocationResponsePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResponseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { fanoutConvocationResponse, fanoutConvocationComplete } =
      await import("@/lib/push-fanout.server");
    // Exclude the caller from the coach fanout: when a coach/admin responds on
    // behalf of a player (or the player themselves does it), they already know
    // — no need to push them back their own action.
    const { dispatched, eventId } = await fanoutConvocationResponse(data.convocationId, {
      excludeUserId: context.userId,
      isChange: data.isChange === true,
    });
    let complete = 0;
    if (eventId) {
      const r = await fanoutConvocationComplete(eventId, { excludeUserId: context.userId });
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
      .select(
        "id, title, starts_at, type, team_id, opponent, is_home, convocations_sent, teams:team_id(name, club_id)",
      )
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
      for (const p of parents ?? [])
        if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }

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
      .select(
        "id, title, starts_at, type, team_id, opponent, is_home, teams:team_id(name, club_id)",
      )
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
      for (const p of parents ?? [])
        if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }

    const startIso = data.previousStartsAt || ((ev as any).starts_at as string);
    const dt = new Date(startIso);
    const dateStr = dt.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
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

/* ------------------------------------------------------------------ */
/* Staff assignment / unassignment push                                */
/* ------------------------------------------------------------------ */
const StaffAssignmentInput = z.object({
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.enum(["assigned", "unassigned"]),
});

export const dispatchStaffAssignmentPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StaffAssignmentInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) return { sent: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select(
        "id, title, starts_at, type, team_id, opponent, is_home, location, teams:team_id(name, club_id)",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { sent: 0 };

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

    let headline: string;
    if (isMatch && opponent) {
      headline = teamName ? `${teamName} vs ${opponent}` : `Match vs ${opponent}`;
    } else if (isMatch) {
      headline = teamName ? `Match — ${teamName}` : "Match";
    } else {
      headline = (ev as any).title || "Événement";
    }

    const title =
      data.action === "assigned" ? "👤 Assigné à un événement" : "👤 Assignation retirée";
    const body =
      data.action === "assigned"
        ? `${headline} — ${dateStr} à ${timeStr}`
        : `${headline} — ${dateStr}`;

    const result = await sendPushToUser(data.userId, {
      title,
      body,
      url: `/events/${data.eventId}`,
      tag: `staff-${data.action}-${data.eventId}-${data.userId}`,
    }).catch((e) => {
      console.warn("[push] staff assignment send failed", data.userId, (e as Error).message);
      return { sent: 0, pruned: 0 };
    });
    return { sent: result.sent };
  });
