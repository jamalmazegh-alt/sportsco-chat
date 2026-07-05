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
    aggregate: "cumulative",
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
export function getTemplatesForSport(
  sport: string | null | undefined,
): ChallengeTemplate[] {
  return CHALLENGE_TEMPLATES.filter(
    (t) => t.sport === "generic" || (!!sport && t.sport === sport),
  );
}
