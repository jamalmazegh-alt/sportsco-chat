/**
 * Sport-specific scoring profiles.
 * Stored under `tournaments.settings.scoring` (jsonb), so 100% retrocompatible.
 *
 * Mode "simple" : score brut (foot, basket, hand, rugby, hockey, futsal).
 * Mode "sets"   : score par sets (volley) avec bestOf, pointsToWin, tieBreak.
 */

import type { SportKey } from "@/lib/sports";

export type ScoringMode = "simple" | "sets";

export interface SetsRules {
  /** "Best of N" — partie remportée par le premier à (N/2 + 0.5) sets. */
  bestOf: 3 | 5;
  /** Points pour gagner un set classique. */
  pointsToWin: number;
  /** Points pour gagner le set décisif (tie-break). 0 = même que pointsToWin. */
  tieBreakPoints: number;
  /** Écart minimum requis pour gagner un set. */
  winBy: number;
}

export interface PeriodsRules {
  count: number;
  durationMin: number;
}

export interface ScoringRules {
  mode: ScoringMode;
  sets: SetsRules;
  periods?: PeriodsRules;
}

export const DEFAULT_SETS_RULES: SetsRules = {
  bestOf: 3,
  pointsToWin: 25,
  tieBreakPoints: 15,
  winBy: 2,
};

const PROFILES: Record<string, ScoringRules> = {
  volleyball: {
    mode: "sets",
    sets: { bestOf: 5, pointsToWin: 25, tieBreakPoints: 15, winBy: 2 },
  },
  football: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 2, durationMin: 45 },
  },
  futsal: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 2, durationMin: 20 },
  },
  basketball: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 4, durationMin: 10 },
  },
  handball: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 2, durationMin: 30 },
  },
  rugby: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 2, durationMin: 40 },
  },
  ice_hockey: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 3, durationMin: 20 },
  },
  field_hockey: {
    mode: "simple",
    sets: DEFAULT_SETS_RULES,
    periods: { count: 4, durationMin: 15 },
  },
  tennis: {
    mode: "sets",
    sets: { bestOf: 3, pointsToWin: 6, tieBreakPoints: 7, winBy: 2 },
  },
  padel: {
    mode: "sets",
    sets: { bestOf: 3, pointsToWin: 6, tieBreakPoints: 7, winBy: 2 },
  },
};

export function defaultScoringForSport(sport: string | null | undefined): ScoringRules {
  if (!sport) return { mode: "simple", sets: DEFAULT_SETS_RULES };
  return PROFILES[sport] ?? { mode: "simple", sets: DEFAULT_SETS_RULES };
}

/** Merge stored scoring config with sport defaults. */
export function resolveScoring(
  sport: string | null | undefined,
  stored: Partial<ScoringRules> | null | undefined,
): ScoringRules {
  const base = defaultScoringForSport(sport);
  if (!stored) return base;
  return {
    mode: (stored.mode as ScoringMode) ?? base.mode,
    sets: { ...base.sets, ...(stored.sets ?? {}) },
    periods: stored.periods ?? base.periods,
  };
}

export type SetScore = { a: number; b: number };

/** Sets won by each team given an array of set scores. */
export function setsWon(sets: SetScore[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of sets) {
    if (s.a > s.b) a++;
    else if (s.b > s.a) b++;
  }
  return { a, b };
}

/**
 * Compute global score from sets (number of sets won by each team).
 * Used to write back into matches.score_a / score_b so standings logic
 * remains unchanged.
 */
export function aggregateSetsScore(sets: SetScore[]): { score_a: number; score_b: number } {
  const { a, b } = setsWon(sets);
  return { score_a: a, score_b: b };
}

/** Format a single line: "25-22, 23-25, 15-12". */
export function formatSets(sets: SetScore[] | null | undefined): string {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.a}-${s.b}`).join(", ");
}

export type SupportedSport = SportKey;
