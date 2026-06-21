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
    const { sendPushToUserFireAndForget } = await import("@/lib/push-send.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, starts_at, type")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

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
    const typeLabel = (ev as any).type === "match" ? "Match" : (ev as any).title || "Événement";

    for (const uid of targets) {
      sendPushToUserFireAndForget(uid, {
        title: "⚽ Convocation",
        body: `${typeLabel} — ${dateStr} à ${timeStr}`,
        url: `/events/${data.eventId}`,
        tag: `conv-new-${data.eventId}-${uid}`,
      });
    }
    return { dispatched: targets.size };
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
    const { sendPushToUserFireAndForget } = await import("@/lib/push-send.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, team_id, opponent, is_home, teams:team_id(name)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return { dispatched: 0 };

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

    for (const uid of targets) {
      sendPushToUserFireAndForget(uid, {
        title: "🏆 Résultat",
        body,
        url: `/events/${data.eventId}`,
        tag: `score-${data.eventId}`,
      });
    }
    return { dispatched: targets.size };
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
    const { sendPushToUserFireAndForget } = await import("@/lib/push-send.server");

    const { data: post } = await supabaseAdmin
      .from("wall_posts")
      .select("id, club_id, body, author_user_id, profiles:author_user_id(full_name, first_name)")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post) return { dispatched: 0 };

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

    let dispatched = 0;
    for (const m of members ?? []) {
      const uid = (m as any).user_id;
      if (!uid || uid === context.userId) continue; // skip author
      sendPushToUserFireAndForget(uid, {
        title: `💬 ${authorName}`,
        body: trimmed,
        url: "/home",
        tag: `wall-${(post as any).id}`,
      });
      dispatched++;
    }
    return { dispatched };
  });
