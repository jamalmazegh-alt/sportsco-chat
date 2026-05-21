/**
 * Génération de bracket knockout (élimination directe) — fonction pure.
 *
 * Construit la liste des matchs des phases finales en partant de N qualifiés
 * (puissance de 2 idéale ; sinon BYEs automatiques pour les meilleurs seeds).
 */

export type KnockoutRound = "r32" | "r16" | "qf" | "sf" | "final" | "third_place";

export interface BracketMatch {
  round: KnockoutRound;
  bracketPosition: number; // 1..N dans la phase
  /** Soit teamId direct (qualifié connu), soit pointeur vers un match précédent. */
  teamASource: { teamId: string } | { fromMatch: number; outcome: "winner" | "loser" } | null;
  teamBSource: { teamId: string } | { fromMatch: number; outcome: "winner" | "loser" } | null;
}

const ROUND_FOR_SIZE: Record<number, KnockoutRound> = {
  32: "r32",
  16: "r16",
  8: "qf",
  4: "sf",
  2: "final",
};

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Génère un bracket à élimination directe.
 * `seededTeamIds` est dans l'ordre 1..N (seed 1 d'abord).
 * Le seeding utilise le standard pour faire que seed 1 affronte le pire,
 * seed 2 le 2e pire, etc.
 */
export function generateKnockoutBracket(
  seededTeamIds: string[],
  options: { thirdPlace?: boolean } = {},
): BracketMatch[] {
  const n = seededTeamIds.length;
  if (n < 2) return [];
  const size = Math.max(2, nextPow2(n));
  if (!(size in ROUND_FOR_SIZE)) {
    // Au-delà de r32 V1 on ne gère pas.
    throw new Error(`Bracket size ${size} non supporté (V1: max 32 équipes)`);
  }

  // Padding avec nulls (BYE)
  const padded: (string | null)[] = [...seededTeamIds];
  while (padded.length < size) padded.push(null);

  // Ordre de seeding standard (1 vs N, 2 vs N-1, ...) avec mirroring équilibré
  const seedOrder = buildSeedOrder(size);
  const firstRoundTeams = seedOrder.map((s) => padded[s - 1]);

  const matches: BracketMatch[] = [];
  let matchCounter = 0;

  // Premier tour
  const firstRound = ROUND_FOR_SIZE[size];
  const firstRoundMatchIds: number[] = [];
  for (let i = 0; i < size / 2; i++) {
    matchCounter++;
    const a = firstRoundTeams[i * 2];
    const b = firstRoundTeams[i * 2 + 1];
    matches.push({
      round: firstRound,
      bracketPosition: i + 1,
      teamASource: a ? { teamId: a } : null,
      teamBSource: b ? { teamId: b } : null,
    });
    firstRoundMatchIds.push(matchCounter);
  }

  // Tours suivants
  let prevIds = firstRoundMatchIds;
  let prevSize = size / 2;
  while (prevSize >= 2) {
    const round = ROUND_FOR_SIZE[prevSize];
    const newIds: number[] = [];
    for (let i = 0; i < prevSize / 2; i++) {
      matchCounter++;
      matches.push({
        round,
        bracketPosition: i + 1,
        teamASource: { fromMatch: prevIds[i * 2], outcome: "winner" },
        teamBSource: { fromMatch: prevIds[i * 2 + 1], outcome: "winner" },
      });
      newIds.push(matchCounter);
    }
    prevIds = newIds;
    prevSize = prevSize / 2;
  }

  // Match pour la 3e place (perdants des demi-finales)
  if (options.thirdPlace && size >= 4) {
    const semis = matches.filter((m) => m.round === "sf");
    if (semis.length === 2) {
      // Les ids de match des SF
      const sfIds: number[] = [];
      let counter = 0;
      for (const m of matches) {
        counter++;
        if (m.round === "sf") sfIds.push(counter);
      }
      matchCounter++;
      matches.push({
        round: "third_place",
        bracketPosition: 1,
        teamASource: { fromMatch: sfIds[0], outcome: "loser" },
        teamBSource: { fromMatch: sfIds[1], outcome: "loser" },
      });
    }
  }

  return matches;
}

/**
 * Génère l'ordre de seeding standard pour un bracket de taille `size` (puissance de 2).
 * Ex: size=8 → [1,8,4,5,2,7,3,6]
 */
function buildSeedOrder(size: number): number[] {
  let order = [1, 2];
  let current = 2;
  while (current < size) {
    current *= 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(current + 1 - s);
    }
    order = next;
  }
  return order;
}
