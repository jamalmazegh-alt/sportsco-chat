/**
 * Source de vérité du schéma des règles de tournoi.
 * Stocké dans `tournaments.settings` (jsonb), donc 100% rétro-compatible.
 */
import type { Tiebreaker, PointsConfig, FairPlayConfig } from "./standings";
import {
  DEFAULT_POINTS,
  DEFAULT_TIEBREAKERS,
  DEFAULT_FAIR_PLAY,
} from "./standings";

export type TournamentLanguage = "fr" | "en";

export interface QualificationRules {
  perGroup: number;
  bestThirds?: number;
  wildcards?: string[];
}

export interface ForfeitRules {
  /** Score attribué au vainqueur du forfait. */
  winnerScore: number;
  /** Score attribué au perdant du forfait. */
  loserScore: number;
  /** Si true, un match abandonné compte comme forfait pour l'équipe responsable. */
  abandonedAsForfeit: boolean;
  /** Repos minimum (en minutes) entre 2 matchs d'une même équipe (PR6). */
  minRestMinutes: number;
}

export interface RegistrationRules {
  enabled: boolean;
  opensAt?: string | null;   // ISO datetime
  closesAt?: string | null;  // ISO datetime
  maxTeams?: number | null;
  requiresApproval: boolean;
  collectPlayers: boolean;
  publicMessage?: string;
}

export interface TournamentRules {
  points: PointsConfig;
  tiebreakers: Tiebreaker[];
  qualification: QualificationRules;
  fairPlay: FairPlayConfig;
  overtime: { enabled: boolean; minutes?: number };
  penaltyShootout: { enabled: boolean };
  matchValidation: { requireValidation: boolean }; // si true, standings ne comptent que les matchs validés
  forfeit: ForfeitRules;
  registration: RegistrationRules;
  language: TournamentLanguage;
  branding: { primaryColor?: string; organizerName?: string };
}

export const DEFAULT_RULES: TournamentRules = {
  points: DEFAULT_POINTS,
  tiebreakers: DEFAULT_TIEBREAKERS,
  qualification: { perGroup: 2, bestThirds: 0, wildcards: [] },
  fairPlay: DEFAULT_FAIR_PLAY,
  overtime: { enabled: false, minutes: 10 },
  penaltyShootout: { enabled: true },
  matchValidation: { requireValidation: false },
  forfeit: {
    winnerScore: 3,
    loserScore: 0,
    abandonedAsForfeit: true,
    minRestMinutes: 30,
  },
  registration: {
    enabled: false,
    opensAt: null,
    closesAt: null,
    maxTeams: null,
    requiresApproval: true,
    collectPlayers: false,
    publicMessage: "",
  },
  language: "fr",
  branding: {},
};

export const ALL_TIEBREAKERS: { key: Tiebreaker; labelFr: string; labelEn: string }[] = [
  { key: "points", labelFr: "Points", labelEn: "Points" },
  {
    key: "head_to_head_points",
    labelFr: "Confrontations directes — points",
    labelEn: "Head-to-head points",
  },
  {
    key: "head_to_head_gd",
    labelFr: "Confrontations directes — diff. de buts",
    labelEn: "Head-to-head goal difference",
  },
  {
    key: "head_to_head_gf",
    labelFr: "Confrontations directes — buts marqués",
    labelEn: "Head-to-head goals scored",
  },
  { key: "goal_diff", labelFr: "Différence de buts générale", labelEn: "Overall goal difference" },
  { key: "goals_for", labelFr: "Buts marqués", labelEn: "Goals scored" },
  { key: "wins", labelFr: "Nombre de victoires", labelEn: "Number of wins" },
  { key: "fair_play", labelFr: "Fair-play (cartons)", labelEn: "Fair play (cards)" },
  { key: "draw_lot", labelFr: "Tirage au sort", labelEn: "Random draw" },
];

/** Merge des règles persistées avec les défauts (rétro-compat). */
export function mergeRules(settings: unknown): TournamentRules {
  const s = (settings ?? {}) as Partial<TournamentRules> & Record<string, unknown>;
  return {
    points: { ...DEFAULT_RULES.points, ...(s.points ?? {}) },
    tiebreakers:
      Array.isArray(s.tiebreakers) && s.tiebreakers.length > 0
        ? (s.tiebreakers as Tiebreaker[])
        : DEFAULT_RULES.tiebreakers,
    qualification: {
      ...DEFAULT_RULES.qualification,
      ...((s.qualification as QualificationRules | undefined) ?? {}),
    },
    fairPlay: { ...DEFAULT_RULES.fairPlay, ...(s.fairPlay ?? {}) },
    overtime: { ...DEFAULT_RULES.overtime, ...(s.overtime ?? {}) },
    penaltyShootout: { ...DEFAULT_RULES.penaltyShootout, ...(s.penaltyShootout ?? {}) },
    matchValidation: { ...DEFAULT_RULES.matchValidation, ...(s.matchValidation ?? {}) },
    forfeit: { ...DEFAULT_RULES.forfeit, ...((s.forfeit as Partial<ForfeitRules> | undefined) ?? {}) },
    registration: { ...DEFAULT_RULES.registration, ...((s.registration as Partial<RegistrationRules> | undefined) ?? {}) },
    language: (s.language as TournamentLanguage) ?? DEFAULT_RULES.language,
    branding: { ...DEFAULT_RULES.branding, ...(s.branding ?? {}) },
  };
}
