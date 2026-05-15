// Supported sports in V1. Limited to the sports for which match scoring &
// player stats are configured in `src/lib/sport-config.ts`.
export const TOP_SPORTS = ["football", "basketball"] as const;

export const COLLECTIVE_SPORTS = [
  "handball",
  "volleyball",
  "rugby",
  "futsal",
  "ice_hockey",
] as const;

export type SportKey = (typeof TOP_SPORTS)[number] | (typeof COLLECTIVE_SPORTS)[number];
