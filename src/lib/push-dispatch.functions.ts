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
    const body = home ? `${teamName} ${sh}-${sa} ${opp}` : `${opp} ${sh}-${sa} ${teamName}`;

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
    console.log("[push] wall handler START v5", { postId: data.postId, userId: context.userId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    // 1) Idempotence — atomic insert; on conflict skip the whole dispatch.
    const { error: dedupErr } = await supabaseAdmin
      .from("push_dispatch_log")
      .insert({ kind: "wall_post", ref_id: data.postId });
    if (dedupErr) {
      console.log("[push] wall BAIL already dispatched", {
        postId: data.postId,
        code: dedupErr.code,
      });
      return { dispatched: 0, deduped: true };
    }

    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select("id, club_id, author_user_id, deleted_at, audience_team_ids, audience_type")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post || (post as any).deleted_at) {
      console.log("[push] wall BAIL no post or deleted");
      return { dispatched: 0 };
    }

    // Gate: wall_new_post (per-club admin setting)
    const { getClubNotifSettings } = await import("@/lib/club-notif-settings.server");
    const clubId = (post as any).club_id as string;
    const audienceTeamIds = ((post as any).audience_team_ids as string[] | null) ?? null;
    const audienceType = ((post as any).audience_type as string) || "club";
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
      [(author as any)?.first_name, (author as any)?.last_name].filter(Boolean).join(" ").trim() ||
      ((author as any)?.full_name as string) ||
      "Un membre";
    const clubName = ((club as any)?.name as string) || "votre club";

    // 2) Candidate recipients — derived from the post audience.
    //    Same logic as the SELECT RLS policy (user_in_wall_post_audience):
    //    admins/dirigeants always; club-wide → all club members; team-scoped →
    //    union of team staff/coaches, players, and their tutors over teams
    //    that still exist.
    const candidates = new Set<string>();

    // Always: club admins + dirigeants (defense-in-depth, even on team-scoped posts).
    const { data: privMembers } = await supabaseAdmin
      .from("club_members")
      .select("user_id, role")
      .eq("club_id", clubId)
      .in("role", ["admin", "dirigeant"]);
    for (const m of privMembers ?? []) {
      const uid = (m as any).user_id as string | null;
      if (uid) candidates.add(uid);
    }

    // Resolve existing (non-deleted) teams of this audience, scoped to the club.
    const liveTeams: { id: string; name: string }[] = [];
    if (audienceTeamIds && audienceTeamIds.length > 0) {
      const { data: teamsRows } = await supabaseAdmin
        .from("teams")
        .select("id, name, club_id, deleted_at")
        .in("id", audienceTeamIds)
        .eq("club_id", clubId)
        .is("deleted_at", null);
      for (const t of teamsRows ?? []) {
        liveTeams.push({ id: (t as any).id, name: (t as any).name });
      }
    }

    if (audienceTeamIds === null) {
      // Club-wide: every club member.
      const { data: members } = await supabaseAdmin
        .from("club_members")
        .select("user_id")
        .eq("club_id", clubId);
      for (const m of members ?? []) {
        const uid = (m as any).user_id as string | null;
        if (uid) candidates.add(uid);
      }
    } else if (liveTeams.length > 0) {
      const teamIds = liveTeams.map((t) => t.id);
      // Staff / coaches with a direct user_id row on these teams.
      const { data: staffRows } = await supabaseAdmin
        .from("team_members")
        .select("user_id, player_id")
        .in("team_id", teamIds);
      const playerIdSet = new Set<string>();
      for (const r of staffRows ?? []) {
        const uid = (r as any).user_id as string | null;
        const pid = (r as any).player_id as string | null;
        if (uid) candidates.add(uid);
        if (pid) playerIdSet.add(pid);
      }
      if (playerIdSet.size > 0) {
        const playerIds = Array.from(playerIdSet);
        // Player accounts.
        const { data: playerRows } = await supabaseAdmin
          .from("players")
          .select("id, user_id")
          .in("id", playerIds);
        for (const p of playerRows ?? []) {
          const uid = (p as any).user_id as string | null;
          if (uid) candidates.add(uid);
        }
        // Tutors / parents.
        const { data: parentRows } = await supabaseAdmin
          .from("player_parents")
          .select("parent_user_id")
          .in("player_id", playerIds);
        for (const pr of parentRows ?? []) {
          const uid = (pr as any).parent_user_id as string | null;
          if (uid) candidates.add(uid);
        }
      }
    }
    // If audienceTeamIds is non-null but liveTeams is empty (all targeted
    // teams deleted), the audience collapses to admins/dirigeants only —
    // exactly matching the RLS policy.

    // Exclude the author.
    candidates.delete(context.userId);

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

    // 4) Minor protection — fail-safe (unchanged).
    const { data: playerAccounts } = await supabaseAdmin
      .from("players")
      .select("user_id, birth_date")
      .in("user_id", allIds);
    const now = Date.now();
    const excludedAsMinor = new Set<string>();
    for (const p of playerAccounts ?? []) {
      const uid = (p as any).user_id as string | null;
      const dob = (p as any).birth_date as string | null;
      if (!uid) continue;
      if (!dob) {
        excludedAsMinor.add(uid);
        continue;
      }
      const ageYears = (now - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (ageYears < MINOR_PUSH_THRESHOLD_YEARS) excludedAsMinor.add(uid);
    }

    const targets: string[] = [];
    for (const uid of allIds) {
      if (excludedAsMinor.has(uid)) continue;
      const pref = prefByUser.get(uid);
      if (pref && pref.pushOn === false) continue;
      targets.push(uid);
    }

    // 5) Localized copy (recipient language). Payload carries NO post content.
    //    scopeLabel: only "tout le club" is localized; team names are data.
    const ALL_CLUB: Record<string, string> = {
      fr: "tout le club",
      en: "the whole club",
      de: "den ganzen Verein",
      es: "todo el club",
      it: "tutto il club",
      nl: "de hele club",
      pt: "todo o clube",
    };
    const OTHERS: Record<string, (n: number) => string> = {
      fr: (n) => `+ ${n} autres`,
      en: (n) => `+ ${n} others`,
      de: (n) => `+ ${n} weitere`,
      es: (n) => `+ ${n} más`,
      it: (n) => `+ ${n} altre`,
      nl: (n) => `+ ${n} andere`,
      pt: (n) => `+ ${n} outras`,
    };
    function scopeLabel(lang: string): string {
      if (audienceTeamIds === null) return ALL_CLUB[lang] || ALL_CLUB.fr;
      if (liveTeams.length === 0) return ALL_CLUB[lang] || ALL_CLUB.fr; // fallback (admin-only audience)
      if (liveTeams.length === 1) return liveTeams[0].name;
      if (liveTeams.length === 2) return `${liveTeams[0].name} + ${liveTeams[1].name}`;
      const others = (OTHERS[lang] || OTHERS.fr)(liveTeams.length - 1);
      return `${liveTeams[0].name} ${others}`;
    }

    const I18N: Record<string, { title: string; body: (a: string, s: string) => string }> = {
      fr: { title: "Nouveau message sur le mur", body: (a, s) => `${a} a publié dans ${s}` },
      en: { title: "New post on the wall", body: (a, s) => `${a} posted in ${s}` },
      de: { title: "Neuer Beitrag an der Pinnwand", body: (a, s) => `${a} hat in ${s} gepostet` },
      es: { title: "Nuevo mensaje en el muro", body: (a, s) => `${a} publicó en ${s}` },
      it: { title: "Nuovo messaggio sulla bacheca", body: (a, s) => `${a} ha pubblicato in ${s}` },
      nl: { title: "Nieuw bericht op de muur", body: (a, s) => `${a} heeft in ${s} gepost` },
      pt: { title: "Nova mensagem no mural", body: (a, s) => `${a} publicou em ${s}` },
    };

    // 6) Send.
    //    Tag: team-scoped (1 team) → wall-team-${teamId};
    //         club or multi_team → wall-club-${clubId} (broad slot).
    const collapseTag =
      audienceType === "team" && liveTeams.length === 1
        ? `wall-team-${liveTeams[0].id}`
        : `wall-club-${clubId}`;

    const sends = targets.map((uid) => {
      const lang = prefByUser.get(uid)?.lang || "fr";
      const t = I18N[lang] || I18N.fr;
      return sendPushToUser(uid, {
        title: t.title,
        body: t.body(authorName, scopeLabel(lang)),
        url: `/inbox?post=${data.postId}&from=push`,
        tag: collapseTag,
      }).catch((e: unknown) => {
        console.warn("[push] wall send failed", uid, (e as Error).message);
        return { sent: 0, pruned: 0 };
      });
    });
    const results = await Promise.all(sends);
    const sent = results.reduce((t, r) => t + r.sent, 0);
    const pruned = results.reduce((t, r) => t + r.pruned, 0);

    await supabaseAdmin
      .from("push_dispatch_log")
      .update({ targets_count: targets.length, sent_count: sent })
      .eq("kind", "wall_post")
      .eq("ref_id", data.postId);

    console.log("[push] wall dispatched v6", {
      postId: (post as any).id,
      clubId,
      audienceType,
      audienceTeamIds,
      liveTeams: liveTeams.length,
      candidates: candidates.size,
      excludedAsMinor: excludedAsMinor.size,
      targets: targets.length,
      sent,
      pruned,
    });
    return { dispatched: targets.length, sent, pruned };
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
});

export const dispatchConvocationResponsePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResponseInput.parse(input))
  .handler(async ({ data }) => {
    const { fanoutConvocationResponse, fanoutConvocationComplete } =
      await import("@/lib/push-fanout.server");
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
