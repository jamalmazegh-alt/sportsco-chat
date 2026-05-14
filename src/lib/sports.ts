// Collective / team sports list. Football and Basketball are pinned on top
// (separated from the rest), per product requirement.
export const TOP_SPORTS = ["football", "basketball"] as const;

export const COLLECTIVE_SPORTS = [
  "handball",
  "volleyball",
  "rugby",
  "futsal",
  "field_hockey",
  "ice_hockey",
  "water_polo",
  "baseball",
  "softball",
  "cricket",
  "american_football",
  "lacrosse",
  "netball",
  "korfball",
  "ultimate_frisbee",
  "rowing",
  "cheerleading",
  "esports",
] as const;

export type SportKey = (typeof TOP_SPORTS)[number] | (typeof COLLECTIVE_SPORTS)[number];
