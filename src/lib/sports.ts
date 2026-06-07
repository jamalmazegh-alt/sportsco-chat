// Supported sports in V1.
export const TOP_SPORTS = ["football", "basketball"] as const;

export const COLLECTIVE_SPORTS = [
  "handball",
  "volleyball",
  "rugby",
  "futsal",
  "ice_hockey",
  "field_hockey",
] as const;

/** Sports de raquette (élimination directe par défaut, score par sets, pas de nul). */
export const RACKET_SPORTS = ["tennis", "padel"] as const;

/** Marqueur "sport personnalisé" : le nom réel est stocké dans tournaments.custom_sport_name. */
export const CUSTOM_SPORT = "custom" as const;

export type SportKey =
  | (typeof TOP_SPORTS)[number]
  | (typeof COLLECTIVE_SPORTS)[number]
  | (typeof RACKET_SPORTS)[number]
  | typeof CUSTOM_SPORT;

/** Sports où un match ne peut pas se terminer sur un score d'égalité. */
export const SPORTS_WITHOUT_DRAW: readonly SportKey[] = [
  "volleyball",
  "tennis",
  "padel",
];

export function sportAllowsDraw(sport: string | null | undefined): boolean {
  if (!sport) return true;
  return !SPORTS_WITHOUT_DRAW.includes(sport as SportKey);
}

/** Label affiché d'un sport (tient compte du sport personnalisé). */
export function sportLabel(
  sport: string | null | undefined,
  customName: string | null | undefined,
  fallback: string,
): string {
  if (sport === CUSTOM_SPORT && customName) return customName;
  return fallback;
}
