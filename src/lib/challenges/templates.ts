/**
 * Prêt-à-l'emploi challenge templates.
 *
 * The coach picks one of these to create a challenge without configuration.
 * Names/descriptions are i18n keys (namespace `challenges`), so labels
 * translate for the 7 supported languages.
 *
 * Each template carries a `sport` scope: either the literal `"generic"` (visible
 * to every sport) or a real sport key coming from `src/lib/sports.ts`. The
 * single filter helper `getTemplatesForSport()` at the bottom of this file is
 * the ONLY sport-branching point for challenge templates — do not add ad-hoc
 * `if (sport === ...)` elsewhere.
 */
import type { Database } from "@/integrations/supabase/types";
import type { SportKey } from "@/lib/sports";

type ChallengeInsert = Database["public"]["Tables"]["challenges"]["Insert"];

/**
 * A template scope. `"generic"` means "any sport". Otherwise it must be a real
 * sport key from `src/lib/sports.ts` (never a new / invented key).
 */
export type TemplateSport = "generic" | SportKey;

export type ChallengeTemplate = {
  key: string;
  icon: string;
  sport: TemplateSport;
  kind: ChallengeInsert["kind"];
  unit: ChallengeInsert["unit"];
  direction: ChallengeInsert["direction"];
  aggregate: ChallengeInsert["aggregate"];
  recurrence: ChallengeInsert["recurrence"];
  /** Default visibility for the ranking. Physical tests are always staff-only. */
  ranking_visibility: ChallengeInsert["ranking_visibility"];
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  // --- Generic templates (available to every sport) ---
  {
    key: "cooper",
    icon: "🏃",
    sport: "generic",
    kind: "physical_test",
    unit: "distance_meters",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "half_season",
    ranking_visibility: "staff",
  },
  {
    key: "leger",
    icon: "🫁",
    sport: "generic",
    kind: "physical_test",
    unit: "stage",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "half_season",
    ranking_visibility: "staff",
  },
  {
    key: "sprint20m",
    icon: "⚡",
    sport: "generic",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "plankHold",
    icon: "🧱",
    sport: "generic",
    kind: "physical_test",
    unit: "time_seconds",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "half_season",
    ranking_visibility: "staff",
  },
  {
    key: "shuttleRun",
    icon: "🔁",
    sport: "generic",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Football ---
  {
    key: "crossbar",
    icon: "🎯",
    sport: "football",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    // Best score in a single session — record so a new personal best
    // triggers the "Nouveau record" badge in the leaderboard.
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "juggling",
    icon: "⚽",
    sport: "football",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "jugglingLeftFoot",
    icon: "⚽",
    sport: "football",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "jugglingRightFoot",
    icon: "⚽",
    sport: "football",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "jugglingHead",
    icon: "⚽",
    sport: "football",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "slalomBall",
    icon: "🐍",
    sport: "football",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Basketball ---
  {
    key: "freeThrows",
    icon: "🏀",
    sport: "basketball",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "threePointShots",
    icon: "🎯",
    sport: "basketball",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "dribbleCourse",
    icon: "⏱️",
    sport: "basketball",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "layupSeries",
    icon: "🏀",
    sport: "basketball",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Handball ---
  {
    key: "handballDribbleSlalom",
    icon: "🤾",
    sport: "handball",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Rugby ---
  {
    key: "sprint40m",
    icon: "⚡",
    sport: "rugby",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "agilityRunRugby",
    icon: "🏉",
    sport: "rugby",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Volleyball ---
  {
    key: "successfulPasses",
    icon: "🏐",
    sport: "volleyball",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Tennis ---
  {
    key: "rallyConsistency",
    icon: "🎾",
    sport: "tennis",
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "movementSpeed",
    icon: "⏱️",
    sport: "tennis",
    kind: "challenge",
    unit: "time_seconds",
    direction: "lower_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },

  // --- Phase 3: score-unit precision/evaluation templates ---
  // Football
  {
    key: "shotAccuracy",
    icon: "🎯",
    sport: "football",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  // Handball
  {
    key: "handballShotAccuracy",
    icon: "🎯",
    sport: "handball",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  {
    key: "passingAccuracy",
    icon: "🎯",
    sport: "handball",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  // Rugby
  {
    key: "rugbyPassingAccuracy",
    icon: "🎯",
    sport: "rugby",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  {
    key: "pushPower",
    icon: "💪",
    sport: "rugby",
    kind: "physical_test",
    unit: "score",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  // Volleyball
  {
    key: "serveAccuracy",
    icon: "🎯",
    sport: "volleyball",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  {
    key: "receptionControl",
    icon: "🛡️",
    sport: "volleyball",
    kind: "physical_test",
    unit: "score",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  {
    key: "attackAccuracy",
    icon: "🎯",
    sport: "volleyball",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  // Tennis
  {
    key: "tennisServeAccuracy",
    icon: "🎯",
    sport: "tennis",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
  {
    key: "targetShots",
    icon: "🎯",
    sport: "tennis",
    kind: "challenge",
    unit: "score",
    direction: "higher_better",
    aggregate: "cumulative",
    recurrence: "season",
    ranking_visibility: "staff",
  },
];

export function findTemplate(key: string | null | undefined): ChallengeTemplate | undefined {
  if (!key) return undefined;
  return CHALLENGE_TEMPLATES.find((t) => t.key === key);
}

/**
 * Single filtering entry point: return generic templates plus templates that
 * match the given sport. When `sport` is null/undefined/unknown, fall back to
 * generic templates only so the picker never crashes and never leaks templates
 * from unrelated sports.
 */
export function getTemplatesForSport(sport: string | null | undefined): ChallengeTemplate[] {
  // Normalize case: some teams historically stored the sport with a
  // capital first letter (e.g. "Football" instead of "football"), which
  // otherwise hides sport-scoped templates like crossbar / juggling.
  const norm = typeof sport === "string" ? sport.trim().toLowerCase() : "";
  return CHALLENGE_TEMPLATES.filter((t) => t.sport === "generic" || (!!norm && t.sport === norm));
}
