/**
 * Configuration complète produite par l'assistant IA de création tournoi.
 * Chaque réponse alimente le payload réel (createTournament + patchs).
 */
import {
  computeSchedule,
  nearestSupportedTeams,
  type Recommendation,
  type ScheduleResult,
} from "./planner";
import { defaultRulesForSport } from "./rules";

export type ScheduleFormatChoice = "pools_finals" | "round_robin" | "single_elim";
export type FlightsTemplateChoice = "champions" | "simple";

export interface AssistantTournamentConfig {
  sport: string;
  customSportName?: string;
  playersPerTeam: number;
  numTeams: number;
  scheduleFormat: ScheduleFormatChoice;
  /** true = éliminés des poules continuent (flights / classement). */
  eliminatedContinue: boolean;
  flightsTemplate: FlightsTemplateChoice;
  matchDurationMin: number;
  terrains: number;
  paid: boolean;
  registrationFeeCents: number;
  registrationCurrency: string;
  name: string;
  startsOn: string;
  endsOn: string;
  location: string;
  category: string;
}

export type AssistantStepId =
  | "sport"
  | "playersPerTeam"
  | "numTeams"
  | "scheduleFormat"
  | "eliminatedContinue"
  | "flightsTemplate"
  | "matchDuration"
  | "terrains"
  | "paid"
  | "paidAmount"
  | "name"
  | "date"
  | "location"
  | "summary";

export const TEAM_COUNT_PRESETS = [8, 12, 16, 24, 32] as const;
export const MATCH_DURATION_PRESETS = [8, 10, 12, 15, 20] as const;
export const TERRAIN_PRESETS = [1, 2, 3, 4, 5] as const;

const FOOTBALL_PLAYERS = [5, 7, 8, 9, 11] as const;
const GENERIC_PLAYERS = [5, 7, 11] as const;

export function playersPerTeamOptions(sport: string): readonly number[] {
  if (sport === "football" || sport === "futsal") return FOOTBALL_PLAYERS;
  if (sport === "handball") return [7] as const;
  if (sport === "volleyball") return [6] as const;
  if (sport === "basketball") return [5] as const;
  return GENERIC_PLAYERS;
}

export function defaultPlayersPerTeam(sport: string): number {
  const opts = playersPerTeamOptions(sport);
  if (sport === "football") return 11;
  if (sport === "futsal") return 5;
  return opts[opts.length - 1] ?? 11;
}

export function defaultMatchDuration(sport: string, playersPerTeam: number): number {
  if (sport === "football" || sport === "futsal") {
    return playersPerTeam <= 5 ? 12 : playersPerTeam <= 8 ? 15 : 20;
  }
  if (sport === "basketball") return 20;
  if (sport === "volleyball") return 15;
  return 15;
}

export function defaultTerrains(numTeams: number): number {
  return Math.max(2, Math.min(5, Math.ceil(numTeams / 6)));
}

export function emptyConfig(partial?: Partial<AssistantTournamentConfig>): AssistantTournamentConfig {
  return {
    sport: "football",
    playersPerTeam: 11,
    numTeams: 16,
    scheduleFormat: "pools_finals",
    eliminatedContinue: true,
    flightsTemplate: "champions",
    matchDurationMin: 20,
    terrains: 3,
    paid: false,
    registrationFeeCents: 0,
    registrationCurrency: "eur",
    name: "",
    startsOn: "",
    endsOn: "",
    location: "",
    category: "",
    ...partial,
  };
}

/** Étapes actives selon les réponses déjà données. */
export function assistantStepOrder(cfg: Partial<AssistantTournamentConfig>): AssistantStepId[] {
  const steps: AssistantStepId[] = ["sport", "playersPerTeam", "numTeams", "scheduleFormat"];
  if (cfg.scheduleFormat === "pools_finals") {
    steps.push("eliminatedContinue");
    if (cfg.eliminatedContinue) steps.push("flightsTemplate");
  }
  steps.push("matchDuration", "terrains", "paid");
  if (cfg.paid) steps.push("paidAmount");
  steps.push("name", "date", "location", "summary");
  return steps;
}

export function isConfigComplete(cfg: AssistantTournamentConfig): boolean {
  if (!cfg.name.trim() || cfg.name.trim().length < 2) return false;
  if (!cfg.startsOn) return false;
  if (!cfg.location.trim()) return false;
  if (cfg.numTeams < 2) return false;
  if (cfg.paid && cfg.registrationFeeCents <= 0) return false;
  return true;
}

export function configUsesFlights(cfg: AssistantTournamentConfig): boolean {
  return cfg.scheduleFormat === "pools_finals" && cfg.eliminatedContinue;
}

export function buildSchedulePreview(cfg: AssistantTournamentConfig): ScheduleResult {
  const teams = nearestSupportedTeams(cfg.numTeams);
  return computeSchedule({
    teams,
    terrains: cfg.terrains,
    durationMin: cfg.matchDurationMin,
    flights: configUsesFlights(cfg),
  });
}

export function buildRecommendation(cfg: AssistantTournamentConfig): Recommendation {
  const schedule = buildSchedulePreview(cfg);
  const teams = nearestSupportedTeams(cfg.numTeams);
  const poolCfg = computeSchedule({
    teams,
    terrains: 1,
    durationMin: cfg.matchDurationMin,
    flights: configUsesFlights(cfg),
  });

  let format: Recommendation["format"];
  if (cfg.scheduleFormat === "round_robin") format = "round_robin";
  else if (cfg.scheduleFormat === "single_elim") format = "single_elim";
  else format = "pools_finals";

  return {
    pools: poolCfg.pools,
    perPool: poolCfg.perPool,
    flights: configUsesFlights(cfg) ? "champions" : null,
    format,
    totalMatches: schedule.total,
    estimatedEndHHMM: schedule.endHHMM,
    terrainsSuggested: cfg.terrains,
    marginMin: schedule.marginMin,
    verdict: schedule.verdict,
  };
}

export type WizardFormat = "mixed" | "group" | "knockout" | "flighted_finals" | "consolation";

export function configToWizardFormat(cfg: AssistantTournamentConfig): {
  format: WizardFormat;
  numTeams: number;
} {
  const numTeams = nearestSupportedTeams(cfg.numTeams);
  if (cfg.scheduleFormat === "round_robin") {
    return { format: "group", numTeams };
  }
  if (cfg.scheduleFormat === "single_elim") {
    return { format: "knockout", numTeams };
  }
  if (configUsesFlights(cfg)) {
    return {
      format: cfg.flightsTemplate === "champions" ? "flighted_finals" : "consolation",
      numTeams,
    };
  }
  return { format: "mixed", numTeams };
}

export function configToCreatePayload(
  clubId: string,
  cfg: AssistantTournamentConfig,
): {
  create: {
    club_id: string;
    name: string;
    sport: string;
    custom_sport_name: string | null;
    category: string | null;
    starts_on: string;
    ends_on: string | null;
    format: WizardFormat;
    num_teams: number;
    location: string | null;
  };
  update: {
    match_duration_min: number;
    fields: string[];
    settings: ReturnType<typeof defaultRulesForSport>;
  };
  payment: {
    registration_fee: number;
    registration_currency: string;
  } | null;
} {
  const { format, numTeams } = configToWizardFormat(cfg);
  const rules = defaultRulesForSport(cfg.sport);
  rules.roster = {
    ...rules.roster,
    playersPerTeam: cfg.playersPerTeam,
  };

  return {
    create: {
      club_id: clubId,
      name: cfg.name.trim(),
      sport: cfg.sport,
      custom_sport_name: cfg.sport === "custom" ? cfg.customSportName?.trim() || null : null,
      category: cfg.category.trim() || null,
      starts_on: cfg.startsOn,
      ends_on: cfg.endsOn.trim() || null,
      format,
      num_teams: numTeams,
      location: cfg.location.trim() || null,
    },
    update: {
      match_duration_min: cfg.matchDurationMin,
      fields: Array.from({ length: cfg.terrains }, (_, i) => `Terrain ${i + 1}`),
      settings: rules,
    },
    payment: cfg.paid
      ? {
          registration_fee: cfg.registrationFeeCents,
          registration_currency: cfg.registrationCurrency,
        }
      : null,
  };
}

/** Rétro-compat LLM : anciennes réponses → config partielle. */
export function legacyAnswersToConfig(answers: {
  teams: number;
  allDay: boolean;
  multipleTrophies: boolean;
  paid: boolean;
}): Partial<AssistantTournamentConfig> {
  return {
    numTeams: answers.teams,
    scheduleFormat: answers.multipleTrophies
      ? "pools_finals"
      : !answers.allDay
        ? "single_elim"
        : "pools_finals",
    eliminatedContinue: answers.multipleTrophies || answers.allDay,
    flightsTemplate: "champions",
    paid: answers.paid,
  };
}
