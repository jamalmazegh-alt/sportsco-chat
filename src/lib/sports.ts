// Supported sports in V1. Limited to the sports for which match scoring &
// player stats are configured in `src/lib/sport-config.ts`.
export const TOP_SPORTS = ["football", "basketball"] as const;

export const COLLECTIVE_SPORTS = [
  "handball",
  "volleyball",
  "rugby",
  "futsal",
  "ice_hockey",
  "field_hockey",
] as const;

export type SportKey = (typeof TOP_SPORTS)[number] | (typeof COLLECTIVE_SPORTS)[number];

/** Sports où un match ne peut pas se terminer sur un score d'égalité. */
export const SPORTS_WITHOUT_DRAW: readonly SportKey[] = ["volleyball"];

export function sportAllowsDraw(sport: string | null | undefined): boolean {
  if (!sport) return true;
  return !SPORTS_WITHOUT_DRAW.includes(sport as SportKey);
}
