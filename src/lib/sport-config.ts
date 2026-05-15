// Sport-specific scoring & player-stats configuration (V1, intentionally simple).
// Adds new sports: just register them here — UI adapts automatically.

export type ScoreUnit = "goals" | "points" | "sets";

export type StatKind =
  | "goal"
  | "own_goal"
  | "penalty"
  | "assist"
  | "try"
  | "point"
  | "yellow_card"
  | "red_card"
  | "foul";

export interface SportConfig {
  scoreUnit: ScoreUnit;
  statKinds: StatKind[];
  assistsEnabled: boolean;
  cardsEnabled: boolean;
  setScoresEnabled: boolean;
  minuteEnabled: boolean;
  defaultStatKind: StatKind;
}

const FOOTBALL: SportConfig = {
  scoreUnit: "goals",
  statKinds: ["goal", "assist", "yellow_card", "red_card"],
  assistsEnabled: true,
  cardsEnabled: true,
  setScoresEnabled: false,
  minuteEnabled: true,
  defaultStatKind: "goal",
};

const CONFIGS: Record<string, SportConfig> = {
  football: FOOTBALL,
  futsal: { ...FOOTBALL },
  basketball: {
    scoreUnit: "points",
    statKinds: ["point", "assist", "foul"],
    assistsEnabled: true,
    cardsEnabled: false,
    setScoresEnabled: false,
    minuteEnabled: false,
    defaultStatKind: "point",
  },
  rugby: {
    scoreUnit: "points",
    statKinds: ["try", "yellow_card", "red_card"],
    assistsEnabled: false,
    cardsEnabled: true,
    setScoresEnabled: false,
    minuteEnabled: true,
    defaultStatKind: "try",
  },
  handball: {
    scoreUnit: "goals",
    statKinds: ["goal", "assist", "yellow_card", "red_card"],
    assistsEnabled: true,
    cardsEnabled: true,
    setScoresEnabled: false,
    minuteEnabled: true,
    defaultStatKind: "goal",
  },
  volleyball: {
    scoreUnit: "sets",
    statKinds: ["point"],
    assistsEnabled: false,
    cardsEnabled: false,
    setScoresEnabled: true,
    minuteEnabled: false,
    defaultStatKind: "point",
  },
  ice_hockey: {
    scoreUnit: "goals",
    statKinds: ["goal", "assist", "penalty"],
    assistsEnabled: true,
    cardsEnabled: false,
    setScoresEnabled: false,
    minuteEnabled: true,
    defaultStatKind: "goal",
  },
};

const FALLBACK: SportConfig = {
  scoreUnit: "points",
  statKinds: [],
  assistsEnabled: false,
  cardsEnabled: false,
  setScoresEnabled: false,
  minuteEnabled: false,
  defaultStatKind: "point",
};

export function getSportConfig(sport: string | null | undefined): SportConfig {
  if (!sport) return FOOTBALL; // sensible default
  return CONFIGS[sport] ?? FALLBACK;
}

// Stat kinds that target a single player (no assist), used to hide the assist
// picker in the UI form.
export const SOLO_STAT_KINDS: StatKind[] = [
  "yellow_card",
  "red_card",
  "foul",
  "penalty",
  "own_goal",
];
