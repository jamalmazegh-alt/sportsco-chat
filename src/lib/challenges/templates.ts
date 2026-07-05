/**
 * Prêt-à-l'emploi challenge templates.
 *
 * The coach picks one of these to create a challenge without configuration.
 * Names/descriptions are i18n keys (namespace `challenges`), so labels
 * translate for the 7 supported languages.
 */
import type { Database } from "@/integrations/supabase/types";

type ChallengeInsert = Database["public"]["Tables"]["challenges"]["Insert"];

export type ChallengeTemplate = {
  key: string;
  icon: string;
  kind: ChallengeInsert["kind"];
  unit: ChallengeInsert["unit"];
  direction: ChallengeInsert["direction"];
  aggregate: ChallengeInsert["aggregate"];
  recurrence: ChallengeInsert["recurrence"];
  /** Default visibility for the ranking. Physical tests are always staff-only. */
  ranking_visibility: ChallengeInsert["ranking_visibility"];
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    key: "crossbar",
    icon: "🎯",
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
    kind: "challenge",
    unit: "count",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "season",
    ranking_visibility: "category",
  },
  {
    key: "leger",
    icon: "🫁",
    kind: "physical_test",
    unit: "stage",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "half_season",
    ranking_visibility: "staff",
  },
  {
    key: "cooper",
    icon: "🏃",
    kind: "physical_test",
    unit: "distance_meters",
    direction: "higher_better",
    aggregate: "record",
    recurrence: "half_season",
    ranking_visibility: "staff",
  },
  {
    key: "sprint20m",
    icon: "⚡",
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
