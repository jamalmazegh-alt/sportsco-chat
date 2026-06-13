/**
 * Sprint 1 — Tournament workflow V2
 *
 * Pure helpers driving the Centre de contrôle:
 *  - stepper progress (Inscriptions → Tirage → Poules → Flights → Finales)
 *  - "Continue" CTA (strict priority algorithm)
 *  - live/upcoming/done counters
 *
 * Reads only existing data shapes (tournaments / tournament_teams / tournament_groups
 * / tournament_matches / tournament_flights). No schema change.
 */

export type StepId = "registrations" | "draw" | "pools" | "flights" | "finals";

export type StepState = "todo" | "current" | "done";

export interface StepperStep {
  id: StepId;
  state: StepState;
}

export type ContinueActionKind =
  | "add_team"
  | "run_draw"
  | "generate_matches"
  | "enter_next_score"
  | "create_flights"
  | "share_results"
  | "publish_tournament"
  | "all_done";

export interface ContinueAction {
  kind: ContinueActionKind;
  /** First unplayed/live match to focus when kind === "enter_next_score". */
  matchId?: string | null;
  /** Optional anchor id to scroll to. */
  anchor?: string;
}

interface MatchLike {
  id: string;
  round: string;
  status: string;
  scheduled_at: string | null;
  score_a: number | null;
  score_b: number | null;
  validated_at?: string | null;
  field?: string | null;
  referee_user_id?: string | null;
  referee_name?: string | null;
}

interface TournamentLike {
  status: string;
  format?: string | null;
  match_duration_min?: number | null;
}

/**
 * Minimum number of teams required to start the workflow.
 * IMPORTANT: `tournaments.num_teams` is the MAX capacity (e.g. "3 / 16 équipes"),
 * never use it as a requirement — otherwise the CTA stays stuck on "Ajouter
 * une équipe" until the tournament is full.
 */
const MIN_TEAMS_TO_START = 2;

const LIVE_STATUSES = new Set(["live"]);
const DONE_STATUSES = new Set([
  "completed",
  "forfeit_a",
  "forfeit_b",
  "no_show_a",
  "no_show_b",
  "abandoned",
]);
const UPCOMING_STATUSES = new Set(["scheduled"]);

const FORMATS_WITHOUT_POOLS = new Set([
  "knockout",
  "double_elimination",
  "swiss",
  "round_robin_home_away",
]);

const FORMATS_WITH_FLIGHTS = new Set(["mixed", "flighted_finals"]);

export function isPoolMatch(m: MatchLike): boolean {
  return m.round === "group";
}
export function isKnockoutMatch(m: MatchLike): boolean {
  return m.round !== "group";
}

export function countMatches(matches: MatchLike[]) {
  let done = 0;
  let live = 0;
  let upcoming = 0;
  for (const m of matches) {
    if (DONE_STATUSES.has(m.status)) done++;
    else if (LIVE_STATUSES.has(m.status)) live++;
    else if (UPCOMING_STATUSES.has(m.status)) upcoming++;
  }
  return { done, live, upcoming, total: matches.length };
}

export function getLiveMatches<T extends MatchLike>(matches: T[]): T[] {
  return matches.filter((m) => LIVE_STATUSES.has(m.status));
}

/** Sort matches "next first": scheduled_at asc, ids fallback. */
function chronological<T extends MatchLike>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const ta = a.scheduled_at ? Date.parse(a.scheduled_at) : Number.MAX_SAFE_INTEGER;
    const tb = b.scheduled_at ? Date.parse(b.scheduled_at) : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/** Next match that needs a score entered (live first, then upcoming chronologically). */
export function findNextScoreMatch<T extends MatchLike>(matches: T[]): T | null {
  const live = chronological(matches.filter((m) => LIVE_STATUSES.has(m.status)));
  if (live.length > 0) return live[0];
  const upcoming = chronological(
    matches.filter(
      (m) => UPCOMING_STATUSES.has(m.status) && (m.score_a === null || m.score_b === null),
    ),
  );
  return upcoming[0] ?? null;
}

function poolsRequired(format: string | null | undefined): boolean {
  if (!format) return true;
  return !FORMATS_WITHOUT_POOLS.has(format);
}

function flightsExpected(format: string | null | undefined, flightsCount: number): boolean {
  if (!format) return flightsCount > 0;
  return FORMATS_WITH_FLIGHTS.has(format) || flightsCount > 0;
}

export interface ComputeArgs {
  tournament: TournamentLike;
  teamsCount: number;
  groupsCount: number;
  matches: MatchLike[];
  flightsCount: number;
}

/** Returns the 5-step progress array with computed state. */
export function computeStepper(args: ComputeArgs): StepperStep[] {
  const { tournament, teamsCount, groupsCount, matches, flightsCount } = args;
  const regDone = teamsCount >= MIN_TEAMS_TO_START && tournament.status !== "draft";
  const drawDone = groupsCount > 0 || (!poolsRequired(tournament.format) && matches.length > 0);
  const poolMatches = matches.filter(isPoolMatch);
  const koMatches = matches.filter(isKnockoutMatch);
  const poolsDone =
    !poolsRequired(tournament.format) ||
    (poolMatches.length > 0 && poolMatches.every((m) => DONE_STATUSES.has(m.status)));
  const flightsDone = !flightsExpected(tournament.format, flightsCount) || flightsCount > 0;
  const finalsDone = koMatches.length > 0 && koMatches.every((m) => DONE_STATUSES.has(m.status));

  const flags: Record<StepId, boolean> = {
    registrations: regDone,
    draw: drawDone,
    pools: poolsDone,
    flights: flightsDone,
    finals: finalsDone,
  };
  const order: StepId[] = ["registrations", "draw", "pools", "flights", "finals"];
  let currentSet = false;
  return order.map<StepperStep>((id) => {
    if (flags[id]) return { id, state: "done" };
    if (!currentSet) {
      currentSet = true;
      return { id, state: "current" };
    }
    return { id, state: "todo" };
  });
}

/**
 * Continue button — priority order (first match wins).
 *
 *  1. Missing teams         -> "add_team"
 *  2. Draw not generated    -> "run_draw"
 *  3. Matches not generated -> "generate_matches"
 *  4. A score is pending    -> "enter_next_score"
 *  5. Pools done, no flights-> "create_flights"
 *  6. Everything finished   -> "share_results"
 */
export function computeContinueAction(args: ComputeArgs): ContinueAction {
  const { tournament, teamsCount, groupsCount, matches, flightsCount } = args;

  // 0) A draft must always offer a way to go live — independent of the team
  // count. Publishing is *not* gated on teams (online-registration tournaments
  // are published precisely to start collecting them). Since the standalone
  // "Publier" button was removed from PublishWorkflow (Fix D), the CTA is now
  // the single publish surface, so it must surface publish even with 0–1 teams.
  if (tournament.status === "draft") {
    return { kind: "publish_tournament" };
  }

  // 1) Missing teams (only relevant once the tournament is live)
  if (teamsCount < MIN_TEAMS_TO_START) {
    return { kind: "add_team", anchor: "section-teams" };
  }

  // 2) Draw not generated (only when pools are expected)
  if (poolsRequired(tournament.format) && groupsCount === 0) {
    return { kind: "run_draw", anchor: "section-matches" };
  }

  // 3) Matches not generated
  if (matches.length === 0) {
    return { kind: "generate_matches", anchor: "section-matches" };
  }

  // 4) A score is pending (live or scheduled)
  const next = findNextScoreMatch(matches);
  if (next) {
    return { kind: "enter_next_score", matchId: next.id, anchor: "section-matches" };
  }

  // 5) Pools done, no flights yet (only when flights make sense)
  const poolMatches = matches.filter(isPoolMatch);
  const poolsDone = poolMatches.length > 0 && poolMatches.every((m) => DONE_STATUSES.has(m.status));
  if (poolsDone && flightsExpected(tournament.format, flightsCount) && flightsCount === 0) {
    return { kind: "create_flights", anchor: "section-flights" };
  }

  // 6) Everything finished → share the results (spec priority 6).
  // Once the tournament is closed, fall back to a plain "all done" state.
  if (tournament.status === "completed") {
    return { kind: "all_done" };
  }
  return { kind: "share_results" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 2 — Cockpit (jour J) — pure helpers
// All read-only over existing data shapes. No schema change.
// ─────────────────────────────────────────────────────────────────────────────

export const COCKPIT_LATE_THRESHOLD_MIN = 10;
export const COCKPIT_SOON_WINDOW_MIN = 30;
export const COCKPIT_DEFAULT_MATCH_DURATION_MIN = 30;

/**
 * Estimated end-of-tournament time.
 * = max(scheduled_at) of unfinished matches + match duration.
 * Returns null when no unfinished match has a scheduled_at (don't invent a value).
 */
export function computeEstimatedEnd(
  matches: MatchLike[],
  matchDurationMin?: number | null,
): Date | null {
  const unfinished = matches.filter((m) => !DONE_STATUSES.has(m.status) && m.scheduled_at);
  if (unfinished.length === 0) return null;
  const latestMs = unfinished.reduce((acc, m) => {
    const ts = Date.parse(m.scheduled_at!);
    return Number.isFinite(ts) && ts > acc ? ts : acc;
  }, Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(latestMs)) return null;
  const duration =
    typeof matchDurationMin === "number" && matchDurationMin > 0
      ? matchDurationMin
      : COCKPIT_DEFAULT_MATCH_DURATION_MIN;
  return new Date(latestMs + duration * 60_000);
}

/**
 * Average delay (in minutes), over live/scheduled matches whose scheduled_at is past.
 * Returns null when no such match exists (don't invent a value).
 */
export function computeAverageDelay(matches: MatchLike[], now: Date = new Date()): number | null {
  const nowMs = now.getTime();
  const lateOrLive = matches.filter((m) => {
    if (DONE_STATUSES.has(m.status)) return false;
    if (!m.scheduled_at) return false;
    const ts = Date.parse(m.scheduled_at);
    return Number.isFinite(ts) && ts <= nowMs;
  });
  if (lateOrLive.length === 0) return null;
  const total = lateOrLive.reduce((acc, m) => acc + (nowMs - Date.parse(m.scheduled_at!)), 0);
  return Math.round(total / lateOrLive.length / 60_000);
}

// ─── Alerts ─────────────────────────────────────────────────────────────────
export type AlertKind = "late_match" | "missing_referee" | "finals_not_generated";
export type AlertSeverity = "high" | "medium" | "low";

export interface CockpitAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  matchId?: string;
  /** Late minutes for late_match, soon-in-minutes for missing_referee. */
  minutes?: number;
}

export interface AlertsArgs {
  tournament: TournamentLike;
  matches: MatchLike[];
  flightsCount: number;
  now?: Date;
  lateThresholdMin?: number;
  soonWindowMin?: number;
}

/**
 * Pure detector. Alerts only DETECT and POINT — they never auto-correct.
 * Sorted by severity (high → low).
 */
export function computeAlerts(args: AlertsArgs): CockpitAlert[] {
  const now = (args.now ?? new Date()).getTime();
  const lateThreshold = args.lateThresholdMin ?? COCKPIT_LATE_THRESHOLD_MIN;
  const soonWindow = args.soonWindowMin ?? COCKPIT_SOON_WINDOW_MIN;
  const out: CockpitAlert[] = [];

  for (const m of args.matches) {
    if (DONE_STATUSES.has(m.status)) continue;
    if (!m.scheduled_at) continue;
    const ts = Date.parse(m.scheduled_at);
    if (!Number.isFinite(ts)) continue;
    const lateMin = Math.round((now - ts) / 60_000);

    // Late match (high)
    if (lateMin >= lateThreshold) {
      out.push({
        id: `late:${m.id}`,
        kind: "late_match",
        severity: "high",
        matchId: m.id,
        minutes: lateMin,
      });
    }

    // Missing referee within the soon window (medium)
    const minutesUntil = Math.round((ts - now) / 60_000);
    const startingSoon = minutesUntil >= 0 && minutesUntil <= soonWindow;
    const isLive = LIVE_STATUSES.has(m.status);
    if ((startingSoon || isLive) && !m.referee_user_id && !m.referee_name) {
      out.push({
        id: `ref:${m.id}`,
        kind: "missing_referee",
        severity: "medium",
        matchId: m.id,
        minutes: isLive ? 0 : minutesUntil,
      });
    }
  }

  // Finals/knockout not generated yet
  const poolMatches = args.matches.filter(isPoolMatch);
  const koMatches = args.matches.filter(isKnockoutMatch);
  const poolsDone = poolMatches.length > 0 && poolMatches.every((m) => DONE_STATUSES.has(m.status));
  // Only alert when a finals/flights phase is actually expected for this format
  // (reuse the same predicate as computeContinueAction → CTA and alert never
  // contradict each other). A pure round-robin with no finals must not alert.
  if (
    poolsDone &&
    koMatches.length === 0 &&
    flightsExpected(args.tournament.format, args.flightsCount)
  ) {
    out.push({
      id: "finals:not-generated",
      kind: "finals_not_generated",
      severity: "low",
    });
  }

  const rank: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
