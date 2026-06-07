/**
 * Double élimination — fonction pure.
 *
 * Génère winner bracket + loser bracket + grande finale.
 * V1 : pas de "reset" (le vainqueur du WB n'a pas besoin de battre 2× le LB
 * champion). Cela simplifie nettement la structure ; on pourra l'ajouter en V2.
 */

import { generateKnockoutBracket, type BracketMatch, type KnockoutRound } from "./bracket";

export type BracketSide = "winner" | "loser" | "grand_final";

export interface DoubleElimMatch extends BracketMatch {
  side: BracketSide;
  /** Identifiant interne (séquentiel global) — utile pour brancher les pointeurs. */
  id: number;
}

/**
 * Construit le bracket double élimination complet pour N équipes seedées.
 * Seul un sous-ensemble de tailles est supporté en V1 : 4, 8, 16.
 */
export function generateDoubleEliminationBracket(
  seededTeamIds: string[],
): DoubleElimMatch[] {
  const n = seededTeamIds.length;
  if (n < 4) return [];
  if (![4, 8, 16].includes(n)) {
    throw new Error(`Double elimination: ${n} équipes non supporté (V1: 4, 8, 16)`);
  }

  // 1) Winner bracket = bracket simple
  const winnerRaw = generateKnockoutBracket(seededTeamIds);
  let counter = 0;
  const winner: DoubleElimMatch[] = winnerRaw.map((m) => {
    counter++;
    return { ...m, side: "winner", id: counter };
  });

  // 2) Loser bracket : alimenté par les perdants de chaque tour du WB.
  //    Structure standard : alternance "minor" (perdants du WB rejoignent) et
  //    "major" (les survivants LB s'affrontent).
  const loser: DoubleElimMatch[] = [];
  const winnerByRound = new Map<KnockoutRound, DoubleElimMatch[]>();
  for (const m of winner) {
    const list = winnerByRound.get(m.round) ?? [];
    list.push(m);
    winnerByRound.set(m.round, list);
  }

  // Ordre des rounds WB (du premier au dernier, hors final)
  const wbRoundOrder: KnockoutRound[] = ["r32", "r16", "qf", "sf"];
  const activeRounds = wbRoundOrder.filter((r) => winnerByRound.has(r));

  // Ronde LB 1 : perdants de la 1re ronde WB s'affrontent
  const firstWb = winnerByRound.get(activeRounds[0])!;
  let prevLb: DoubleElimMatch[] = [];
  for (let i = 0; i < firstWb.length; i += 2) {
    counter++;
    const a = firstWb[i];
    const b = firstWb[i + 1];
    const match: DoubleElimMatch = {
      side: "loser",
      id: counter,
      round: activeRounds[0],
      bracketPosition: i / 2 + 1,
      teamASource: { fromMatch: a.id, outcome: "loser" },
      teamBSource: b ? { fromMatch: b.id, outcome: "loser" } : null,
    };
    loser.push(match);
    prevLb.push(match);
  }

  // Rondes LB suivantes : alternance major (survivants LB) / minor (rejoint par WB)
  for (let r = 1; r < activeRounds.length; r++) {
    const wbRound = activeRounds[r];
    const wbLosers = winnerByRound.get(wbRound)!;

    // Major round : survivants LB s'affrontent 2 à 2
    const major: DoubleElimMatch[] = [];
    for (let i = 0; i < prevLb.length; i += 2) {
      counter++;
      const a = prevLb[i];
      const b = prevLb[i + 1];
      if (!b) {
        // nombre impair, on garde tel quel pour la minor round
        major.push(a);
        continue;
      }
      const m: DoubleElimMatch = {
        side: "loser",
        id: counter,
        round: wbRound,
        bracketPosition: i / 2 + 1,
        teamASource: { fromMatch: a.id, outcome: "winner" },
        teamBSource: { fromMatch: b.id, outcome: "winner" },
      };
      loser.push(m);
      major.push(m);
    }

    // Minor round : survivants major vs perdants du WB de cette ronde
    const minor: DoubleElimMatch[] = [];
    const count = Math.min(major.length, wbLosers.length);
    for (let i = 0; i < count; i++) {
      counter++;
      const m: DoubleElimMatch = {
        side: "loser",
        id: counter,
        round: wbRound,
        bracketPosition: i + 1,
        teamASource: { fromMatch: major[i].id, outcome: "winner" },
        teamBSource: { fromMatch: wbLosers[i].id, outcome: "loser" },
      };
      loser.push(m);
      minor.push(m);
    }
    prevLb = minor;
  }

  // 3) Finale du loser bracket (si plusieurs survivants restent)
  while (prevLb.length > 1) {
    const next: DoubleElimMatch[] = [];
    for (let i = 0; i < prevLb.length; i += 2) {
      counter++;
      const a = prevLb[i];
      const b = prevLb[i + 1];
      if (!b) {
        next.push(a);
        continue;
      }
      const m: DoubleElimMatch = {
        side: "loser",
        id: counter,
        round: "final",
        bracketPosition: i / 2 + 1,
        teamASource: { fromMatch: a.id, outcome: "winner" },
        teamBSource: { fromMatch: b.id, outcome: "winner" },
      };
      loser.push(m);
      next.push(m);
    }
    prevLb = next;
  }

  // 4) Grande finale : champion WB vs champion LB
  const wbFinal = winnerByRound.get("final")?.[0];
  const lbChampion = prevLb[0];
  const grandFinal: DoubleElimMatch[] = [];
  if (wbFinal && lbChampion) {
    counter++;
    grandFinal.push({
      side: "grand_final",
      id: counter,
      round: "final",
      bracketPosition: 1,
      teamASource: { fromMatch: wbFinal.id, outcome: "winner" },
      teamBSource: { fromMatch: lbChampion.id, outcome: "winner" },
    });
  }

  return [...winner, ...loser, ...grandFinal];
}
