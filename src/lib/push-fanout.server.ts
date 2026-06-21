/**
 * Server-only helpers that compute targets and fan out Web Push for
 * specific business events. Shared between authenticated `createServerFn`
 * dispatchers and public webhook routes (token-protected).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUserFireAndForget } from "./push-send.server";

const SUPPORTED = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);
function fmtDate(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* ------------------------------------------------------------------ */
/* #7 — Player responded to a convocation                              */
/* ------------------------------------------------------------------ */
export async function fanoutConvocationResponse(
  convocationId: string,
  opts: { excludeUserId?: string | null } = {},
): Promise<{ dispatched: number; eventId: string | null }> {
  const { data: conv } = await supabaseAdmin
    .from("convocations")
    .select(
      "id, status, event_id, player_id, players:player_id(first_name, last_name), events:event_id(id, title, type, starts_at, team_id)",
    )
    .eq("id", convocationId)
    .maybeSingle();
  if (!conv) return { dispatched: 0, eventId: null };

  const ev: any = (conv as any).events;
  if (!ev?.team_id) return { dispatched: 0, eventId: ev?.id ?? null };

  const status = (conv as any).status as string;
  if (status === "pending") return { dispatched: 0, eventId: ev.id };

  const player: any = (conv as any).players ?? {};
  const firstName = (player.first_name as string) || (player.last_name as string) || "Un joueur";

  const typeLabel = ev.type === "match" ? "Match" : ev.title || "Événement";
  const dateStr = ev.starts_at ? fmtDate(ev.starts_at) : "";

  const emoji = status === "present" ? "✅" : status === "absent" ? "❌" : "❓";
  const statusLabel =
    status === "present" ? "Présent" : status === "absent" ? "Absent" : "Incertain";

  const title = `${emoji} ${firstName} a répondu`;
  const body = `${statusLabel} · ${typeLabel} ${dateStr}`.trim();

  const { data: coaches } = await supabaseAdmin
    .from("team_members")
    .select("user_id")
    .eq("team_id", ev.team_id)
    .in("role", ["coach", "admin"]);

  const targets = new Set<string>();
  for (const c of coaches ?? []) {
    const uid = (c as any).user_id as string | null;
    if (!uid) continue;
    if (opts.excludeUserId && uid === opts.excludeUserId) continue;
    targets.add(uid);
  }

  for (const uid of targets) {
    sendPushToUserFireAndForget(uid, {
      title,
      body,
      url: `/events/${ev.id}`,
      tag: `response-${ev.id}-${uid}`,
    });
  }
  return { dispatched: targets.size, eventId: ev.id };
}

/* ------------------------------------------------------------------ */
/* #8 — Every convocation responded (pending === 0)                    */
/* ------------------------------------------------------------------ */
export async function fanoutConvocationComplete(
  eventId: string,
): Promise<{ dispatched: number; complete: boolean }> {
  const { data: convs } = await supabaseAdmin
    .from("convocations")
    .select("status")
    .eq("event_id", eventId);
  if (!convs || convs.length === 0) return { dispatched: 0, complete: false };

  let present = 0;
  let absent = 0;
  let uncertain = 0;
  let pending = 0;
  for (const c of convs as any[]) {
    if (c.status === "present") present++;
    else if (c.status === "absent") absent++;
    else if (c.status === "uncertain") uncertain++;
    else pending++;
  }
  if (pending > 0) return { dispatched: 0, complete: false };

  const { data: ev } = await supabaseAdmin
    .from("events")
    .select("id, title, type, starts_at, team_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || !(ev as any).team_id) return { dispatched: 0, complete: true };

  const typeLabel = (ev as any).type === "match" ? "Match" : (ev as any).title || "Événement";
  const dateStr = (ev as any).starts_at ? fmtDate((ev as any).starts_at) : "";

  const body = `${present} présent${present > 1 ? "s" : ""} · ${absent} absent${absent > 1 ? "s" : ""} · ${uncertain} incertain${uncertain > 1 ? "s" : ""} — ${typeLabel} ${dateStr}`.trim();

  const { data: coaches } = await supabaseAdmin
    .from("team_members")
    .select("user_id")
    .eq("team_id", (ev as any).team_id)
    .in("role", ["coach", "admin"]);

  const targets = new Set<string>();
  for (const c of coaches ?? []) {
    const uid = (c as any).user_id as string | null;
    if (uid) targets.add(uid);
  }
  for (const uid of targets) {
    sendPushToUserFireAndForget(uid, {
      title: "🎯 Toute l'équipe a répondu",
      body,
      url: `/events/${eventId}`,
      tag: `complete-${eventId}`,
    });
  }
  return { dispatched: targets.size, complete: true };
}

/* ------------------------------------------------------------------ */
/* Helper — resolve target users for a tournament team                 */
/* ------------------------------------------------------------------ */
async function resolveTournamentTeamUserIds(
  tournamentTeamIds: string[],
): Promise<Set<string>> {
  const targets = new Set<string>();
  if (tournamentTeamIds.length === 0) return targets;

  const { data: tteams } = await supabaseAdmin
    .from("tournament_teams")
    .select("id, team_id")
    .in("id", tournamentTeamIds);

  const realTeamIds = (tteams ?? [])
    .map((t: any) => t.team_id as string | null)
    .filter((x): x is string => !!x);

  if (realTeamIds.length > 0) {
    // Team members of the linked real club teams
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .in("team_id", realTeamIds);
    for (const m of tm ?? []) if ((m as any).user_id) targets.add((m as any).user_id);

    // Players + linked parents
    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id, user_id, team_id")
      .in("team_id", realTeamIds);
    const playerIds: string[] = [];
    for (const p of players ?? []) {
      const uid = (p as any).user_id as string | null;
      if (uid) targets.add(uid);
      playerIds.push((p as any).id);
    }
    if (playerIds.length > 0) {
      const { data: parents } = await supabaseAdmin
        .from("player_parents")
        .select("parent_user_id")
        .in("player_id", playerIds);
      for (const p of parents ?? [])
        if ((p as any).parent_user_id) targets.add((p as any).parent_user_id);
    }
  }
  return targets;
}

/* ------------------------------------------------------------------ */
/* #9 — Tournament match starting in ~30 min                           */
/* ------------------------------------------------------------------ */
export async function fanoutTournamentMatchReminder(matchId: string): Promise<{ dispatched: number }> {
  const { data: m } = await supabaseAdmin
    .from("tournament_matches")
    .select(
      "id, tournament_id, team_a_id, team_b_id, scheduled_at, field, tournaments:tournament_id(slug, name)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!m) return { dispatched: 0 };

  const teamA = (m as any).team_a_id as string | null;
  const teamB = (m as any).team_b_id as string | null;
  if (!teamA || !teamB) return { dispatched: 0 };

  const { data: tteams } = await supabaseAdmin
    .from("tournament_teams")
    .select("id, name")
    .in("id", [teamA, teamB]);
  const nameById = new Map<string, string>();
  for (const t of tteams ?? []) nameById.set((t as any).id, (t as any).name);

  const slug = ((m as any).tournaments?.slug as string) || ((m as any).tournament_id as string);
  const time = (m as any).scheduled_at
    ? new Date((m as any).scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const field = ((m as any).field as string) || "—";

  let dispatched = 0;
  for (const tid of [teamA, teamB]) {
    const opp = tid === teamA ? nameById.get(teamB) ?? "Adversaire" : nameById.get(teamA) ?? "Adversaire";
    const targets = await resolveTournamentTeamUserIds([tid]);
    for (const uid of targets) {
      sendPushToUserFireAndForget(uid, {
        title: "🏟️ Votre match commence bientôt",
        body: `vs ${opp} — ${time} · Terrain ${field}`,
        url: `/t/${slug}`,
        tag: `tournament-match-${matchId}-${uid}`,
      });
      dispatched++;
    }
  }
  return { dispatched };
}

/* ------------------------------------------------------------------ */
/* #10 — Draw published                                                */
/* ------------------------------------------------------------------ */
export async function fanoutTournamentDraw(tournamentId: string): Promise<{ dispatched: number }> {
  const { data: t } = await supabaseAdmin
    .from("tournaments")
    .select("id, name, slug")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return { dispatched: 0 };

  const { data: tteams } = await supabaseAdmin
    .from("tournament_teams")
    .select("id")
    .eq("tournament_id", tournamentId);
  const ids = (tteams ?? []).map((x: any) => x.id as string);
  const targets = await resolveTournamentTeamUserIds(ids);

  // Also include tournament_members (organizers/refs/etc.)
  const { data: members } = await supabaseAdmin
    .from("tournament_members")
    .select("user_id")
    .eq("tournament_id", tournamentId);
  for (const m of members ?? []) if ((m as any).user_id) targets.add((m as any).user_id);

  const slug = ((t as any).slug as string) || tournamentId;
  const name = ((t as any).name as string) || "le tournoi";
  for (const uid of targets) {
    sendPushToUserFireAndForget(uid, {
      title: "🎲 Les poules sont disponibles",
      body: `Tournoi ${name} — Consultez votre groupe`,
      url: `/t/${slug}`,
      tag: `draw-${tournamentId}`,
    });
  }
  return { dispatched: targets.size };
}

// Touch SUPPORTED so unused-var lints stay quiet without changing semantics
void SUPPORTED;
