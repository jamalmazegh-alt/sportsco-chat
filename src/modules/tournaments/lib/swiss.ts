/**
 * Système suisse — appariements par classement à chaque ronde.
 *
 * Règles V1 :
 *  - Ronde 1 : appariement par seed (haut vs bas).
 *  - Rondes suivantes : tri par points puis appariement haut/bas dans la
 *    même tranche de score, en évitant les rematchs si possible.
 *  - Nombre impair : la dernière équipe non appariée reçoit un BYE
 *    (équivalent à une victoire forfaitaire, hors V1 — exclu de l'output).
 *
 * Fonctions pures, testables, déterministes.
 */

export interface SwissTeamState {
  id: string;
  seed: number; // 1 = meilleur seed
  points: number;
  opponents: string[]; // ids des équipes déjà affrontées
  byes: number;
}

export interface SwissPairing {
  teamAId: string;
  teamBId: string | null; // null = BYE
  round: number;
}

/**
 * Génère les appariements d'une ronde donnée.
 */
export function generateSwissRound(
  state: SwissTeamState[],
  round: number,
): SwissPairing[] {
  if (state.length < 2) return [];

  // Tri : par points décroissants, puis par seed croissant (meilleur d'abord)
  // Pour la ronde 1, tout le monde est à 0 pt → trié uniquement par seed.
  const sorted = [...state].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.seed - b.seed;
  });

  const pairings: SwissPairing[] = [];
  const available = new Set(sorted.map((s) => s.id));
  const byId = new Map(sorted.map((s) => [s.id, s]));

  // Ronde 1 spéciale : split haut/bas (1 vs n/2+1, 2 vs n/2+2, ...)
  if (round === 1) {
    const half = Math.floor(sorted.length / 2);
    for (let i = 0; i < half; i++) {
      pairings.push({
        teamAId: sorted[i].id,
        teamBId: sorted[i + half].id,
        round,
      });
    }
    if (sorted.length % 2 === 1) {
      pairings.push({ teamAId: sorted[sorted.length - 1].id, teamBId: null, round });
    }
    return pairings;
  }

  // Rondes ≥ 2 : on parcourt par groupes de score
  for (const team of sorted) {
    if (!available.has(team.id)) continue;
    available.delete(team.id);

    // Cherche l'adversaire idéal : même tranche de score, pas déjà rencontré,
    // sinon on relâche progressivement la contrainte.
    let opponent: SwissTeamState | null = null;
    for (const candidate of sorted) {
      if (!available.has(candidate.id)) continue;
      if (team.opponents.includes(candidate.id)) continue;
      opponent = candidate;
      break;
    }
    // Fallback : autoriser un rematch si nécessaire
    if (!opponent) {
      for (const candidate of sorted) {
        if (available.has(candidate.id)) {
          opponent = candidate;
          break;
        }
      }
    }

    if (opponent) {
      available.delete(opponent.id);
      pairings.push({ teamAId: team.id, teamBId: opponent.id, round });
    } else {
      // BYE pour l'équipe qui en a eu le moins
      pairings.push({ teamAId: team.id, teamBId: null, round });
    }
  }

  void byId;
  return pairings;
}

/**
 * Nombre de rondes recommandé pour N équipes (≈ log2 N arrondi sup).
 */
export function recommendedSwissRounds(numTeams: number): number {
  if (numTeams < 2) return 0;
  return Math.ceil(Math.log2(numTeams));
}
