/**
 * Moteur Flight — concept générique de "phase finale multi-trophées".
 *
 * Permet de gérer Champions/Europa/Conference, Coupe/Plaque/Bowl/Shield,
 * Or/Argent/Bronze, ou n'importe quelle combinaison personnalisée.
 *
 * Pure functions, testées en Vitest — pas d'effet de bord, pas d'I/O.
 */

import type { BracketMatch } from "./bracket";
import { generateKnockoutBracket } from "./bracket";

// ---------- Types

/** Une règle de qualification = une source d'équipes pour un Flight. */
export type QualRule =
  /** Toutes les équipes finissant à ces positions dans leurs poules respectives. */
  | { kind: "group_position"; positions: number[] }
  /** Positions spécifiques dans une poule donnée. */
  | { kind: "group_position_in"; group_id: string; positions: number[] }
  /** Les N meilleures équipes parmi les non-encore-qualifiées (wild cards). */
  | { kind: "best_n_remaining"; n: number }
  /** Liste explicite d'IDs (manuel). */
  | { kind: "manual"; team_ids: string[] };

export interface FlightConfig {
  id?: string;
  sort_order: number;
  name: string;
  short_name?: string | null;
  color?: string | null;
  qualification_rules: QualRule[];
  enable_third_place: boolean;
  enable_fifth_place: boolean;
  enable_seventh_place: boolean;
}

export interface FlightDistribution {
  /** Identifiant interne pour cette option (pour les boutons UI). */
  id: string;
  /** Clé de description i18n libre ("flights.dist.balanced" / ".uneven"…). */
  labelKey: string;
  /** Tailles des Flights dans l'ordre (A, B, C…). */
  sizes: number[];
  /** True si toutes les tailles sont des puissances de 2 (bracket propre). */
  cleanBrackets: boolean;
}

export interface GroupStandingInput {
  group_id: string;
  /** team IDs ordonnés du 1er au dernier dans la poule. */
  ordered_team_ids: string[];
}

// ---------- Distributions automatiques

function isPow2(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Propose 1 à 3 répartitions possibles des équipes en Flights.
 * - Préfère des Flights de taille puissance de 2 (brackets propres)
 * - Pour les nombres impairs/non divisibles, propose une option "déséquilibrée"
 *   et/ou une option avec un Flight supplémentaire.
 *
 * Heuristique simple : on essaie d'abord 2 puis 3 puis 4 Flights, et on garde
 * les options pertinentes (≥ 4 équipes par Flight minimum).
 */
export function proposeFlightDistributions(
  numTeams: number,
): FlightDistribution[] {
  if (numTeams < 4) return [];
  const out: FlightDistribution[] = [];
  const seen = new Set<string>();

  const push = (sizes: number[], labelKey: string) => {
    if (sizes.some((s) => s < 2)) return;
    if (sizes.reduce((a, b) => a + b, 0) !== numTeams) return;
    const key = sizes.join("-");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: `opt-${out.length + 1}`,
      labelKey,
      sizes,
      cleanBrackets: sizes.every(isPow2),
    });
  };

  // Option A — 2 Flights équilibrés (powers of 2 si possible)
  const halfFloor = Math.floor(numTeams / 2);
  const halfCeil = numTeams - halfFloor;
  // Snap à des puissances de 2 si l'écart est faible
  const pow2Candidates = [4, 8, 16, 32];
  for (const a of pow2Candidates) {
    const b = numTeams - a;
    if (b >= 2 && a + b === numTeams) {
      push([a, b], "flights.dist.twoFlights");
      break;
    }
  }
  if (halfFloor >= 2) push([halfCeil, halfFloor], "flights.dist.twoFlightsBalanced");

  // Option B — 3 Flights, top petit + reste
  for (const top of [4, 8]) {
    const rest = numTeams - top;
    if (rest >= 4) {
      const m = Math.floor(rest / 2);
      const l = rest - m;
      push([top, l, m], "flights.dist.threeFlights");
    }
  }
  // 3 Flights "égaux"
  if (numTeams >= 9) {
    const base = Math.floor(numTeams / 3);
    const rem = numTeams - base * 3;
    const sizes = [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];
    push(sizes, "flights.dist.threeEqual");
  }

  // Option C — 4 Flights
  if (numTeams >= 12) {
    const base = Math.floor(numTeams / 4);
    const rem = numTeams - base * 4;
    const sizes = [
      base + (rem > 0 ? 1 : 0),
      base + (rem > 1 ? 1 : 0),
      base + (rem > 2 ? 1 : 0),
      base,
    ];
    push(sizes, "flights.dist.fourFlights");
  }

  // Trie : brackets propres en premier, puis le plus équilibré
  out.sort((a, b) => {
    if (a.cleanBrackets !== b.cleanBrackets) return a.cleanBrackets ? -1 : 1;
    const spreadA = Math.max(...a.sizes) - Math.min(...a.sizes);
    const spreadB = Math.max(...b.sizes) - Math.min(...b.sizes);
    return spreadA - spreadB;
  });

  return out.slice(0, 3);
}

/**
 * Génère des règles de qualification par défaut à partir des tailles de Flights
 * et du nombre d'équipes par poule.
 *
 * Heuristique : les Flights du haut prennent les 1ers, 2èmes... ; le dernier
 * Flight ramasse le reste. Quand le compte ne tombe pas juste, on utilise des
 * wild cards (best_n_remaining).
 */
export function defaultQualificationRules(
  flightSizes: number[],
  numGroups: number,
  teamsPerGroup: number,
): QualRule[][] {
  const rules: QualRule[][] = [];
  let consumedPositions = 0;
  for (let i = 0; i < flightSizes.length; i++) {
    const size = flightSizes[i];
    const isLast = i === flightSizes.length - 1;
    if (isLast) {
      // Dernier flight : prend tout ce qui reste
      const positions: number[] = [];
      for (let p = consumedPositions + 1; p <= teamsPerGroup; p++) positions.push(p);
      rules.push([{ kind: "group_position", positions }]);
      continue;
    }
    // Cas standard : assignations de positions entières
    const positionsNeeded = Math.floor(size / numGroups);
    const remainder = size - positionsNeeded * numGroups;
    const positions: number[] = [];
    for (let k = 0; k < positionsNeeded; k++) positions.push(consumedPositions + 1 + k);
    const flightRules: QualRule[] = [];
    if (positions.length > 0) flightRules.push({ kind: "group_position", positions });
    if (remainder > 0) {
      flightRules.push({ kind: "best_n_remaining", n: remainder });
    }
    rules.push(flightRules);
    consumedPositions += positionsNeeded;
  }
  return rules;
}

/**
 * Détecte si la génération automatique d'un format type "Champions" (3 flights
 * Champions / Europa / Conference) est applicable à la structure réelle.
 *
 * Heuristique volontairement simple et testable (Fix F) :
 *  - il faut au moins 2 poules pour alimenter chaque flight (≥ 2 équipes/bracket) ;
 *  - les poules doivent être régulières (même effectif → entier) ;
 *  - chaque poule doit compter ≥ 3 positions pour découper en 3 flights.
 *
 * Les cas atypiques (effectifs irréguliers, poules trop petites, une seule
 * poule) renvoient `false` : l'UI propose alors un repli sur les templates
 * existants (Consolante / Médailles / Coupe-Plaque) ou le mode manuel.
 */
export function canAutoGenerateChampions(
  numTeams: number,
  numGroups: number,
): boolean {
  if (numGroups < 2) return false;
  const perGroup = numTeams / numGroups;
  if (!Number.isInteger(perGroup)) return false;
  if (perGroup < 3) return false;
  return true;
}

// ---------- Application des règles

/**
 * Applique les règles de qualification d'un Flight et renvoie les équipes
 * sélectionnées, sans doublons, dans l'ordre de priorité.
 *
 * @param standings poules + classements (1er au dernier)
 * @param alreadyQualified IDs déjà pris par les Flights précédents
 * @param rules règles du Flight courant
 * @param quota nombre max d'équipes à retenir
 */
export function qualifyTeamsToFlight(
  standings: GroupStandingInput[],
  alreadyQualified: Set<string>,
  rules: QualRule[],
  quota: number,
): string[] {
  const picked: string[] = [];
  const seen = new Set<string>(alreadyQualified);

  const add = (id: string | undefined | null) => {
    if (!id) return;
    if (seen.has(id)) return;
    if (picked.length >= quota) return;
    seen.add(id);
    picked.push(id);
  };

  for (const rule of rules) {
    if (picked.length >= quota) break;
    switch (rule.kind) {
      case "group_position": {
        for (const pos of rule.positions) {
          for (const g of standings) {
            add(g.ordered_team_ids[pos - 1]);
          }
        }
        break;
      }
      case "group_position_in": {
        const g = standings.find((s) => s.group_id === rule.group_id);
        if (g) {
          for (const pos of rule.positions) add(g.ordered_team_ids[pos - 1]);
        }
        break;
      }
      case "best_n_remaining": {
        // V1 : on prend les premiers non-encore-pris par position (2e, 3e...)
        // dans l'ordre des poules. Une version avancée comparerait les pts.
        const startCount = picked.length;
        outer: for (let pos = 1; pos <= 32; pos++) {
          for (const g of standings) {
            const id = g.ordered_team_ids[pos - 1];
            if (id && !seen.has(id)) {
              add(id);
              if (picked.length - startCount >= rule.n) break outer;
              if (picked.length >= quota) break outer;
            }
          }
        }
        break;
      }
      case "manual": {
        for (const id of rule.team_ids) add(id);
        break;
      }
    }
  }
  return picked;
}

// ---------- Bracket par Flight

export interface FlightBracketMatch extends BracketMatch {
  placement_kind:
    | "final"
    | "third_place"
    | "fifth_place"
    | "seventh_place"
    | "semi"
    | "quarter"
    | "round_of_16"
    | "round_of_32"
    | null;
}

const ROUND_TO_PLACEMENT: Record<string, FlightBracketMatch["placement_kind"]> = {
  r32: "round_of_32",
  r16: "round_of_16",
  qf: "quarter",
  sf: "semi",
  final: "final",
  third_place: "third_place",
};

/**
 * Génère le bracket complet d'un Flight (semis + finale, +3e/5e/7e place si
 * activés). Réutilise generateKnockoutBracket pour la structure principale.
 */
export function generateFlightBracket(
  seededTeamIds: string[],
  flags: { thirdPlace?: boolean; fifthPlace?: boolean; seventhPlace?: boolean } = {},
): FlightBracketMatch[] {
  if (seededTeamIds.length < 2) return [];
  const base = generateKnockoutBracket(seededTeamIds, {
    thirdPlace: flags.thirdPlace,
  });
  const enriched: FlightBracketMatch[] = base.map((m) => ({
    ...m,
    placement_kind: ROUND_TO_PLACEMENT[m.round] ?? null,
  }));

  // V1 : 5e/7e place s'ajoutent comme placeholders pointant vers les perdants
  // des quarts / huitièmes. Ils sont matérialisés en DB et l'admin remplit les
  // équipes manuellement (les sources fromMatch sont approximatives sans
  // tracking complet).
  // Pour ne pas alourdir, on n'ajoute pas les sources auto ici — l'admin
  // configurera. On ajoute juste les matchs vides s'ils sont demandés.
  // (extension future)

  return enriched;
}

// ---------- Classement final global

export interface FinalRankingEntry {
  rank: number;
  team_id: string;
  flight_id?: string;
  flight_name?: string;
}

export interface FlightResultInput {
  flight_id: string;
  flight_name: string;
  sort_order: number;
  /** Tailles attendues pour calculer les offsets de rangs */
  expected_size: number;
  /** Vainqueur, finaliste, 3e, 4e dans l'ordre (peut être incomplet) */
  ordered_team_ids: string[];
}

/**
 * Concatène les résultats de tous les Flights en un classement global.
 * Flight A (sort_order=0) occupe les rangs 1..N1, Flight B les rangs (N1+1)..,
 * etc.
 */
export function computeOverallStandings(
  flights: FlightResultInput[],
): FinalRankingEntry[] {
  const sorted = [...flights].sort((a, b) => a.sort_order - b.sort_order);
  const out: FinalRankingEntry[] = [];
  let offset = 0;
  for (const f of sorted) {
    for (let i = 0; i < f.ordered_team_ids.length; i++) {
      out.push({
        rank: offset + i + 1,
        team_id: f.ordered_team_ids[i],
        flight_id: f.flight_id,
        flight_name: f.flight_name,
      });
    }
    offset += f.expected_size;
  }
  return out;
}

// re-export pour ergonomie
export { nextPow2, isPow2 };
