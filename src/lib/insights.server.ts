// Server-only helpers for coach insights detection + AI message generation.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

type InsightType =
  | "pending_convocations"
  | "consecutive_absences"
  | "missing_score"
  | "missing_guardian";

type Priority = "high" | "medium" | "low";
type ActionType = "send_reminder" | "view_event" | "view_player";

interface DetectedInsight {
  insight_type: InsightType;
  club_id: string;
  team_id: string | null;
  payload: Record<string, unknown>;
  priority: Priority;
  action_type: ActionType | null;
  action_payload: Record<string, unknown> | null;
  dedup_key: string;
  expires_at: string | null;
  // AI prompt context
  userPrompt: string;
}

function isoDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function isoWeek(d: Date = new Date()): string {
  // YYYY-Www
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function ageFromBirth(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

async function loadClubTeamIds(clubId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("club_id", clubId)
    .is("deleted_at", null);
  return (data ?? []).map((t: any) => t.id);
}

// INSIGHT 1: pending convocations within 48h, >=3 pending
async function detectPendingConvocations(clubId: string): Promise<DetectedInsight[]> {
  const teamIds = await loadClubTeamIds(clubId);
  if (teamIds.length === 0) return [];
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, title, starts_at, team_id, status")
    .in("team_id", teamIds)
    .neq("status", "cancelled")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon);

  const out: DetectedInsight[] = [];
  for (const ev of (events ?? []) as any[]) {
    const { data: convs } = await supabaseAdmin
      .from("convocations")
      .select("status, player_id, players:player_id(first_name, last_name)")
      .eq("event_id", ev.id);
    const all = (convs ?? []) as any[];
    const pending = all.filter((c) => c.status === "pending");
    if (pending.length < 3) continue;
    const present = all.filter((c) => c.status === "present").length;
    const pendingNames = pending
      .map((c) => `${c.players?.first_name ?? ""} ${c.players?.last_name ?? ""}`.trim())
      .filter(Boolean);
    out.push({
      insight_type: "pending_convocations",
      club_id: clubId,
      team_id: ev.team_id,
      payload: {
        event_id: ev.id,
        event_title: ev.title,
        starts_at: ev.starts_at,
        pending_count: pending.length,
        present_count: present,
        pending_names: pendingNames,
      },
      priority: "high",
      action_type: "send_reminder",
      action_payload: { event_id: ev.id },
      dedup_key: `pending_convocations:${ev.id}:${isoDay()}`,
      expires_at: ev.starts_at,
      userPrompt: `Match '${ev.title}' starts in less than 48h. ${pending.length} players haven't responded yet: ${pendingNames.join(", ")}. Generate a short alert message for the coach.`,
    });
  }
  return out;
}

// INSIGHT 2: 3+ consecutive absences in last 30 days
async function detectConsecutiveAbsences(clubId: string): Promise<DetectedInsight[]> {
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  // 1. All active players for this club
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, first_name, last_name, club_id")
    .eq("club_id", clubId)
    .is("deleted_at", null);

  if (!players || players.length === 0) return [];
  const playerIds = (players as any[]).map((p) => p.id);

  // 2. All convocations for these players in last 30 days — ONE query
  const { data: convs } = await supabaseAdmin
    .from("convocations")
    .select("player_id, status, event:event_id(id, starts_at, team_id, status)")
    .in("player_id", playerIds)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 3. All team names — ONE query
  const teamIds = [
    ...new Set(
      ((convs ?? []) as any[])
        .map((c) => c.event?.team_id)
        .filter(Boolean),
    ),
  ];
  const { data: teams } = teamIds.length
    ? await supabaseAdmin.from("teams").select("id, name").in("id", teamIds)
    : { data: [] as any[] };
  const teamMap = new Map(((teams ?? []) as any[]).map((t) => [t.id, t.name]));

  // 4. Group convocations by player and check consecutive absences
  const byPlayer = new Map<string, any[]>();
  for (const c of ((convs ?? []) as any[])) {
    if (!c.event || c.event.status === "cancelled") continue;
    const arr = byPlayer.get(c.player_id) ?? [];
    arr.push(c);
    byPlayer.set(c.player_id, arr);
  }

  const out: DetectedInsight[] = [];
  const playerMap = new Map(((players ?? []) as any[]).map((p) => [p.id, p]));

  for (const [playerId, items] of byPlayer.entries()) {
    const sorted = items.sort(
      (a: any, b: any) =>
        new Date(b.event.starts_at).getTime() - new Date(a.event.starts_at).getTime(),
    );
    if (sorted.length < 3) continue;
    const lastThree = sorted.slice(0, 3);
    const allAbsent = lastThree.every(
      (c: any) => c.status === "absent" || c.status === "no_show",
    );
    if (!allAbsent) continue;

    const p = playerMap.get(playerId);
    if (!p) continue;
    const teamId = lastThree[0].event.team_id;
    const fullName = `${p.first_name} ${p.last_name}`.trim();

    out.push({
      insight_type: "consecutive_absences",
      club_id: clubId,
      team_id: teamId,
      payload: {
        player_id: playerId,
        player_name: fullName,
        team_id: teamId,
        team_name: teamMap.get(teamId) ?? "",
        absence_count: lastThree.length,
        last_event_date: lastThree[0].event.starts_at,
      },
      priority: "medium",
      action_type: "view_player",
      action_payload: { player_id: playerId },
      dedup_key: `consecutive_absences:${playerId}:${isoWeek()}`,
      expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      userPrompt: `${fullName} has been absent or no-show ${lastThree.length} times in a row. Generate a short alert suggesting the coach check in.`,
    });
  }
  return out;
}

// INSIGHT 3: past matches in last 14 days without score
async function detectMissingScore(clubId: string): Promise<DetectedInsight[]> {
  const teamIds = await loadClubTeamIds(clubId);
  if (teamIds.length === 0) return [];
  const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, title, starts_at, team_id, teams:team_id(name)")
    .in("team_id", teamIds)
    .eq("type", "match")
    .neq("status", "cancelled")
    .gte("starts_at", since)
    .lt("starts_at", now);

  const out: DetectedInsight[] = [];
  for (const ev of (events ?? []) as any[]) {
    const { data: result } = await supabaseAdmin
      .from("match_results")
      .select("id")
      .eq("event_id", ev.id)
      .maybeSingle();
    if (result) continue;
    out.push({
      insight_type: "missing_score",
      club_id: clubId,
      team_id: ev.team_id,
      payload: {
        event_id: ev.id,
        event_title: ev.title,
        starts_at: ev.starts_at,
        team_id: ev.team_id,
        team_name: ev.teams?.name ?? "",
      },
      priority: "low",
      action_type: "view_event",
      action_payload: { event_id: ev.id },
      dedup_key: `missing_score:${ev.id}`,
      expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
      userPrompt: `Match '${ev.title}' on ${ev.starts_at} has no score recorded yet. Generate a short reminder to enter the score.`,
    });
  }
  return out;
}

// INSIGHT 4: minor players without a guardian
async function detectMissingGuardian(clubId: string): Promise<DetectedInsight[]> {
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, first_name, last_name, birth_date")
    .eq("club_id", clubId)
    .is("deleted_at", null)
    .not("birth_date", "is", null);

  const out: DetectedInsight[] = [];
  for (const p of (players ?? []) as any[]) {
    const age = ageFromBirth(p.birth_date);
    if (age === null || age >= 18) continue;
    const { count } = await supabaseAdmin
      .from("player_parents")
      .select("id", { count: "exact", head: true })
      .eq("player_id", p.id);
    if ((count ?? 0) > 0) continue;
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("team_id, teams:team_id(name)")
      .eq("player_id", p.id)
      .limit(1)
      .maybeSingle();
    const fullName = `${p.first_name} ${p.last_name}`.trim();
    out.push({
      insight_type: "missing_guardian",
      club_id: clubId,
      team_id: tm?.team_id ?? null,
      payload: {
        player_id: p.id,
        player_name: fullName,
        team_id: tm?.team_id ?? null,
        team_name: (tm as any)?.teams?.name ?? "",
        birth_date: p.birth_date,
      },
      priority: "medium",
      action_type: "view_player",
      action_payload: { player_id: p.id },
      dedup_key: `missing_guardian:${p.id}`,
      expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      userPrompt: `${fullName} is a minor with no guardian linked in the system. Generate a short GDPR compliance reminder.`,
    });
  }
  return out;
}

async function generateMessages(
  userPrompt: string,
): Promise<{ fr: string; en: string } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[insights] LOVABLE_API_KEY missing — falling back to default messages");
    return null;
  }
  const system = `You are a helpful assistant for sports club coaches.
Generate two short, friendly, actionable insight messages
for a coach based on the structured data provided.
One in French, one in English.
Keep each message under 120 characters.
Be direct and specific — include names and numbers.
Return JSON only: { "fr": "...", "en": "..." }`;

  try {
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash-lite");
    const { text } = await generateText({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.fr === "string" && typeof parsed?.en === "string") {
      return { fr: parsed.fr, en: parsed.en };
    }
    return null;
  } catch (e) {
    console.error("[insights] AI generation failed", e);
    return null;
  }
}

function fallbackMessages(ins: DetectedInsight): { fr: string; en: string } {
  switch (ins.insight_type) {
    case "pending_convocations": {
      const p = ins.payload as any;
      return {
        fr: `${p.pending_count} joueurs n'ont pas répondu pour ${p.event_title}.`,
        en: `${p.pending_count} players haven't responded for ${p.event_title}.`,
      };
    }
    case "consecutive_absences": {
      const p = ins.payload as any;
      return {
        fr: `${p.player_name} a été absent ${p.absence_count} fois d'affilée.`,
        en: `${p.player_name} has been absent ${p.absence_count} times in a row.`,
      };
    }
    case "missing_score": {
      const p = ins.payload as any;
      return {
        fr: `Score manquant pour le match ${p.event_title}.`,
        en: `Missing score for the match ${p.event_title}.`,
      };
    }
    case "missing_guardian": {
      const p = ins.payload as any;
      return {
        fr: `${p.player_name} est mineur·e sans tuteur enregistré.`,
        en: `${p.player_name} is a minor with no guardian on file.`,
      };
    }
  }
}

export async function detectAndGenerateInsightsForClub(
  clubId: string,
  options?: { types?: InsightType[] },
) {
  // Resolve expired insights first
  await supabaseAdmin
    .from("coach_insights")
    .update({ resolved_at: new Date().toISOString() })
    .lt("expires_at", new Date().toISOString())
    .is("resolved_at", null);

  const wanted = options?.types ? new Set(options.types) : null;
  const include = (t: InsightType) => !wanted || wanted.has(t);

  const detected: DetectedInsight[] = [
    ...(include("pending_convocations") ? await detectPendingConvocations(clubId) : []),
    ...(include("consecutive_absences") ? await detectConsecutiveAbsences(clubId) : []),
    ...(include("missing_score") ? await detectMissingScore(clubId) : []),
    ...(include("missing_guardian") ? await detectMissingGuardian(clubId) : []),
  ];

  if (detected.length === 0) return { detected: 0, created: 0 };

  // Filter out existing dedup_keys
  const keys = detected.map((d) => d.dedup_key);
  const { data: existing } = await supabaseAdmin
    .from("coach_insights")
    .select("dedup_key")
    .in("dedup_key", keys);
  const existingKeys = new Set((existing ?? []).map((r: any) => r.dedup_key));
  const fresh = detected.filter((d) => !existingKeys.has(d.dedup_key));

  let created = 0;
  for (const ins of fresh) {
    const ai = await generateMessages(ins.userPrompt);
    const msgs = ai ?? fallbackMessages(ins);
    const { error } = await supabaseAdmin.from("coach_insights").insert({
      club_id: ins.club_id,
      team_id: ins.team_id,
      insight_type: ins.insight_type,
      payload: ins.payload as any,
      message_fr: msgs.fr,
      message_en: msgs.en,
      priority: ins.priority,
      action_type: ins.action_type,
      action_payload: ins.action_payload as any,
      dedup_key: ins.dedup_key,
      expires_at: ins.expires_at,
    });
    if (!error) created++;
    else if (!/duplicate key/i.test(error.message)) console.error("[insights] insert failed", error);
  }
  return { detected: detected.length, created };
}

export async function detectInsightsForAllActiveClubs() {
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  // Active club = at least one event in last 30 days
  const { data: rows } = await supabaseAdmin
    .from("events")
    .select("team_id, teams:team_id(club_id)")
    .gte("starts_at", since);
  const clubIds = new Set<string>();
  for (const r of (rows ?? []) as any[]) {
    const cid = r?.teams?.club_id;
    if (cid) clubIds.add(cid);
  }
  let totalCreated = 0;
  for (const clubId of clubIds) {
    try {
      const res = await detectAndGenerateInsightsForClub(clubId);
      totalCreated += res.created;
    } catch (e) {
      console.error("[insights] club failed", clubId, e);
    }
  }
  return { clubs: clubIds.size, created: totalCreated };
}
