/**
 * Sélection des équipes qualifiées depuis les classements de poules.
 *
 * Règles supportées :
 *  - N premiers de chaque poule (perGroup)
 *  - Meilleurs Nèmes (bestThirds) classés entre eux selon les tiebreakers déjà appliqués
 *  - Wildcards manuels (team_ids)
 */

import type { StandingRow } from "./standings";

export interface QualificationRules {
  perGroup: number;
  bestThirds?: number;
  wildcards?: string[];
}

export interface GroupStandings {
  groupId: string;
  rows: StandingRow[]; // déjà triés
}

export interface QualifiedTeam {
  teamId: string;
  groupId: string | null;
  source: "group_top" | "best_third" | "wildcard";
  groupRank?: number;
}

export function selectQualified(
  groups: GroupStandings[],
  rules: QualificationRules,
): QualifiedTeam[] {
  const out: QualifiedTeam[] = [];
  const taken = new Set<string>();

  // 1. Top N per group
  for (const g of groups) {
    for (let i = 0; i < Math.min(rules.perGroup, g.rows.length); i++) {
      const r = g.rows[i];
      if (taken.has(r.teamId)) continue;
      out.push({
        teamId: r.teamId,
        groupId: g.groupId,
        source: "group_top",
        groupRank: r.rank,
      });
      taken.add(r.teamId);
    }
  }

  // 2. Best Nth (default N = perGroup+1, e.g. 3rd place)
  if (rules.bestThirds && rules.bestThirds > 0) {
    const nthPos = rules.perGroup + 1; // ex: perGroup=2 → 3èmes
    const candidates: { row: StandingRow; groupId: string }[] = [];
    for (const g of groups) {
      const cand = g.rows[nthPos - 1];
      if (cand && !taken.has(cand.teamId)) {
        candidates.push({ row: cand, groupId: g.groupId });
      }
    }
    // Trier par les critères généraux : points → GD → GF → wins → fair-play
    candidates.sort((a, b) => {
      if (b.row.points !== a.row.points) return b.row.points - a.row.points;
      if (b.row.goalDiff !== a.row.goalDiff) return b.row.goalDiff - a.row.goalDiff;
      if (b.row.goalsFor !== a.row.goalsFor) return b.row.goalsFor - a.row.goalsFor;
      if (b.row.won !== a.row.won) return b.row.won - a.row.won;
      return b.row.fairPlay - a.row.fairPlay;
    });
    for (let i = 0; i < Math.min(rules.bestThirds, candidates.length); i++) {
      out.push({
        teamId: candidates[i].row.teamId,
        groupId: candidates[i].groupId,
        source: "best_third",
        groupRank: nthPos,
      });
      taken.add(candidates[i].row.teamId);
    }
  }

  // 3. Wildcards
  for (const tid of rules.wildcards ?? []) {
    if (taken.has(tid)) continue;
    out.push({ teamId: tid, groupId: null, source: "wildcard" });
    taken.add(tid);
  }

  return out;
}
