// Position suggestions per sport. Free-text remains allowed everywhere —
// these are only autocomplete hints.
import type { SportKey } from "./sports";

export interface PositionOption {
  /** Stable key used as the stored value (FR label kept for backward compat). */
  value: string;
  /** Localized labels. */
  fr: string;
  en: string;
  /** Short tag e.g. "GK". */
  abbr?: string;
  /** Optional grouping label (defensive / midfield / attack…). */
  group?: "goalkeeper" | "defense" | "midfield" | "attack" | "other";
}

// NB: `value` mirrors the French label to preserve existing free-text rows.
const FOOTBALL: PositionOption[] = [
  { value: "Gardien de but", fr: "Gardien de but", en: "Goalkeeper", abbr: "GK", group: "goalkeeper" },
  { value: "Arrière droit", fr: "Arrière droit", en: "Right Back", abbr: "RB", group: "defense" },
  { value: "Arrière gauche", fr: "Arrière gauche", en: "Left Back", abbr: "LB", group: "defense" },
  { value: "Défenseur central", fr: "Défenseur central", en: "Center Back", abbr: "CB", group: "defense" },
  { value: "Milieu défensif", fr: "Milieu défensif", en: "Defensive Midfielder", abbr: "DM", group: "midfield" },
  { value: "Milieu central", fr: "Milieu central", en: "Central Midfielder", abbr: "CM", group: "midfield" },
  { value: "Milieu offensif", fr: "Milieu offensif", en: "Attacking Midfielder", abbr: "AM", group: "midfield" },
  { value: "Ailier droit", fr: "Ailier droit", en: "Right Winger", abbr: "RW", group: "attack" },
  { value: "Ailier gauche", fr: "Ailier gauche", en: "Left Winger", abbr: "LW", group: "attack" },
  { value: "Attaquant", fr: "Attaquant", en: "Striker", abbr: "ST", group: "attack" },
];

const BASKETBALL: PositionOption[] = [
  { value: "Meneur", fr: "Meneur", en: "Point Guard", abbr: "PG" },
  { value: "Arrière", fr: "Arrière", en: "Shooting Guard", abbr: "SG" },
  { value: "Ailier", fr: "Ailier", en: "Small Forward", abbr: "SF" },
  { value: "Ailier fort", fr: "Ailier fort", en: "Power Forward", abbr: "PF" },
  { value: "Pivot", fr: "Pivot", en: "Center", abbr: "C" },
];

const RUGBY: PositionOption[] = [
  { value: "Pilier", fr: "Pilier", en: "Prop" },
  { value: "Talonneur", fr: "Talonneur", en: "Hooker" },
  { value: "Deuxième ligne", fr: "Deuxième ligne", en: "Lock" },
  { value: "Troisième ligne", fr: "Troisième ligne", en: "Flanker" },
  { value: "Demi de mêlée", fr: "Demi de mêlée", en: "Scrum-half" },
  { value: "Demi d'ouverture", fr: "Demi d'ouverture", en: "Fly-half" },
  { value: "Centre", fr: "Centre", en: "Center" },
  { value: "Ailier", fr: "Ailier", en: "Wing" },
  { value: "Arrière", fr: "Arrière", en: "Fullback" },
];

const VOLLEYBALL: PositionOption[] = [
  { value: "Passeur", fr: "Passeur", en: "Setter" },
  { value: "Réceptionneur-attaquant", fr: "Réceptionneur-attaquant", en: "Outside Hitter" },
  { value: "Central", fr: "Central", en: "Middle Blocker" },
  { value: "Libéro", fr: "Libéro", en: "Libero" },
];

const HANDBALL: PositionOption[] = [
  { value: "Gardien", fr: "Gardien", en: "Goalkeeper", group: "goalkeeper" },
  { value: "Ailier", fr: "Ailier", en: "Winger" },
  { value: "Pivot", fr: "Pivot", en: "Pivot" },
  { value: "Arrière", fr: "Arrière", en: "Back" },
  { value: "Demi-centre", fr: "Demi-centre", en: "Center Back" },
];

const ICE_HOCKEY: PositionOption[] = [
  { value: "Gardien", fr: "Gardien", en: "Goalkeeper", group: "goalkeeper" },
  { value: "Défenseur", fr: "Défenseur", en: "Defender", group: "defense" },
  { value: "Milieu", fr: "Milieu", en: "Midfielder", group: "midfield" },
  { value: "Attaquant", fr: "Attaquant", en: "Forward", group: "attack" },
];

const FIELD_HOCKEY = ICE_HOCKEY;

const FUTSAL: PositionOption[] = [
  { value: "Gardien", fr: "Gardien", en: "Goalkeeper", group: "goalkeeper" },
  { value: "Défenseur", fr: "Défenseur", en: "Defender" },
  { value: "Ailier", fr: "Ailier", en: "Winger" },
  { value: "Pivot", fr: "Pivot", en: "Pivot" },
];

const TENNIS: PositionOption[] = [
  { value: "Joueur de simple", fr: "Joueur de simple", en: "Singles Player" },
  { value: "Joueur de double", fr: "Joueur de double", en: "Doubles Player" },
];

const BADMINTON = TENNIS;

export const POSITIONS_BY_SPORT: Partial<Record<SportKey | string, PositionOption[]>> = {
  football: FOOTBALL,
  basketball: BASKETBALL,
  rugby: RUGBY,
  volleyball: VOLLEYBALL,
  handball: HANDBALL,
  ice_hockey: ICE_HOCKEY,
  field_hockey: FIELD_HOCKEY,
  futsal: FUTSAL,
  tennis: TENNIS,
  badminton: BADMINTON,
};

/** Returns suggestions for the given sport, or an empty array when unknown. */
export function getPositionSuggestions(sport: string | null | undefined): PositionOption[] {
  if (!sport) return [];
  return POSITIONS_BY_SPORT[sport] ?? [];
}

/** Localized label for an option, with the chosen language. */
export function localizedPositionLabel(opt: PositionOption, lang: string): string {
  return lang?.startsWith("en") ? opt.en : opt.fr;
}
