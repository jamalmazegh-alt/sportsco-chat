/**
 * Deterministic tournament planner (Sprint 3, v1 — NO LLM).
 *
 * Two pure functions feed both:
 *  - the AI Assistant (recommendFormat → reco card)
 *  - the Simulator    (computeSchedule → live timing/verdict)
 *
 * Hybrid LLM seam (documented, NOT implemented in v1):
 *  - parseNaturalLanguage(text) → AssistantAnswers   // future
 *  - explainRecommendation(reco) → string            // future
 *
 * Guarantee: every LLM call must funnel back through recommendFormat,
 * so the LLM can never produce an unplayable format.
 */

// ---------- Types

export type FlightsTemplate = "champions" | null;

export type RecommendedFormat = "pools_finals" | "round_robin" | "single_elim";

export interface AssistantAnswers {
  teams: number;
  allDay: boolean;
  multipleTrophies: boolean;
  paid: boolean;
}

export interface ScheduleInput {
  teams: number;
  terrains: number;
  durationMin: number;
  flights: boolean;
  /** "HH:MM" — default 09:00. */
  startHHMM?: string;
  /** "HH:MM" — default 18:00. */
  deadlineHHMM?: string;
  /** Minutes between matches on the same court — default 3. */
  changeoverMin?: number;
  /** Lunch break in minutes — default 45. */
  lunchMin?: number;
}

export type ScheduleVerdict = "ok" | "warn" | "bad";

export interface ScheduleResult {
  pools: number;
  perPool: number;
  poolMatches: number;
  finalMatches: number;
  total: number;
  rounds: number;
  slotMin: number;
  endHHMM: string;
  marginMin: number;
  verdict: ScheduleVerdict;
}

export interface Recommendation {
  pools: number;
  perPool: number;
  flights: FlightsTemplate;
  format: RecommendedFormat;
  totalMatches: number;
  estimatedEndHHMM: string;
  terrainsSuggested: number;
  marginMin: number;
  verdict: ScheduleVerdict;
}

// ---------- Internal helpers

/**
 * POOLCFG aligned with what generateGroups actually supports.
 * Keep in sync with src/modules/tournaments/lib/* group generators.
 */
const POOLCFG: Record<number, { pools: number; size: number }> = {
  8: { pools: 2, size: 4 },
  12: { pools: 4, size: 3 },
  16: { pools: 4, size: 4 },
  24: { pools: 4, size: 6 },
  32: { pools: 8, size: 4 },
};

const SUPPORTED_TEAM_COUNTS: readonly number[] = [8, 12, 16, 24, 32];

function nearestSupportedTeams(teams: number): number {
  let best = SUPPORTED_TEAM_COUNTS[0];
  let bestDiff = Math.abs(teams - best);
  for (const n of SUPPORTED_TEAM_COUNTS) {
    const d = Math.abs(teams - n);
    if (d < bestDiff) {
      best = n;
      bestDiff = d;
    }
  }
  return best;
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatHHMM(totalMin: number): string {
  // Clamp negatives to 00:00 for display, but real margin is returned separately.
  const t = Math.max(0, totalMin);
  const h = Math.floor(t / 60) % 24;
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------- Public API

/**
 * computeSchedule — pure timing math for the Simulator.
 * Monotonic: more terrains → earlier end ; longer duration → later end.
 */
export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const teams = nearestSupportedTeams(input.teams);
  const cfg = POOLCFG[teams];
  const terrains = Math.max(1, Math.floor(input.terrains));
  const duration = Math.max(1, Math.floor(input.durationMin));
  const changeover = input.changeoverMin ?? 3;
  const lunch = input.lunchMin ?? 45;
  const startMin = parseHHMM(input.startHHMM ?? "09:00");
  const deadlineMin = parseHHMM(input.deadlineHHMM ?? "18:00");

  const poolMatches = cfg.pools * ((cfg.size * (cfg.size - 1)) / 2);
  const finalMatches = input.flights ? 3 * cfg.pools : cfg.pools;
  const total = poolMatches + finalMatches;
  const slotMin = duration + changeover;
  const rounds = Math.ceil(total / terrains);
  const endMin = startMin + rounds * slotMin + lunch;
  const marginMin = deadlineMin - endMin;

  let verdict: ScheduleVerdict;
  if (marginMin >= 60) verdict = "ok";
  else if (marginMin >= 0) verdict = "warn";
  else verdict = "bad";

  return {
    pools: cfg.pools,
    perPool: cfg.size,
    poolMatches,
    finalMatches,
    total,
    rounds,
    slotMin,
    endHHMM: formatHHMM(endMin),
    marginMin,
    verdict,
  };
}

/**
 * recommendFormat — pure recommendation for the AI Assistant.
 *
 * Mapping rules (only outputs formats the existing engine can generate):
 *  - multipleTrophies → pools + 'champions' flights template
 *  - allDay (everyone plays the day) → pools + finals (no straight knockout)
 *  - !allDay && !multipleTrophies && small bracket → single_elim
 *  - large round-robin only chosen for very small teams (<=8 + allDay)
 */
export function recommendFormat(answers: AssistantAnswers): Recommendation {
  const teams = nearestSupportedTeams(answers.teams);
  const cfg = POOLCFG[teams];

  let format: RecommendedFormat;
  let flights: FlightsTemplate = null;

  if (answers.multipleTrophies) {
    format = "pools_finals";
    flights = "champions";
  } else if (!answers.allDay && teams <= 16) {
    format = "single_elim";
  } else if (teams === 8 && answers.allDay) {
    // Small + everyone plays → round robin is the friendliest
    format = "round_robin";
  } else {
    format = "pools_finals";
  }

  // Terrains suggestion: rough heuristic, then validate via computeSchedule.
  let terrainsSuggested = Math.max(2, Math.ceil(teams / 6));

  // Probe schedule with the suggested terrains; bump until ok if needed.
  let schedule = computeSchedule({
    teams,
    terrains: terrainsSuggested,
    durationMin: 20,
    flights: flights === "champions",
  });
  while (schedule.verdict === "bad" && terrainsSuggested < 12) {
    terrainsSuggested += 1;
    schedule = computeSchedule({
      teams,
      terrains: terrainsSuggested,
      durationMin: 20,
      flights: flights === "champions",
    });
  }

  return {
    pools: cfg.pools,
    perPool: cfg.size,
    flights,
    format,
    totalMatches: schedule.total,
    estimatedEndHHMM: schedule.endHHMM,
    terrainsSuggested,
    marginMin: schedule.marginMin,
    verdict: schedule.verdict,
  };
}

/**
 * Map a Recommendation to the existing TournamentWizard `format` enum.
 * Keeps the AI path identical to a manual creation.
 */
export function recommendationToWizardFormat(
  reco: Recommendation,
): { format: "mixed" | "group" | "knockout"; numTeams: number } {
  return {
    format:
      reco.format === "round_robin"
        ? "group"
        : reco.format === "single_elim"
          ? "knockout"
          : "mixed",
    numTeams: reco.pools * reco.perPool,
  };
}

// ---------- Future LLM seam (documented only — DO NOT implement in v1)
//
// export async function parseNaturalLanguage(text: string): Promise<AssistantAnswers> { ... }
// export async function explainRecommendation(reco: Recommendation, locale: string): Promise<string> { ... }
//
// Both MUST funnel back through recommendFormat. The LLM never bypasses
// the deterministic engine — it only (a) fills the structured answers and
// (b) narrates the already-computed recommendation.
