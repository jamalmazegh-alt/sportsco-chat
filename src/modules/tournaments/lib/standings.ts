/**
 * Classements de poule — fonction pure.
 *
 * Calcule un classement à partir des matchs joués selon les règles
 * de points et tiebreakers du tournoi.
 */

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;
}

export interface MatchInput {
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
}

export interface PointsConfig {
  win: number;
  draw: number;
  loss: number;
}

export type Tiebreaker = "points" | "goal_diff" | "goals_for" | "head_to_head" | "wins";

/**
 * Calcule le classement d'une poule.
 * Ne prend en compte que les matchs `completed`.
 */
export function computeStandings(
  teamIds: string[],
  matches: MatchInput[],
  points: PointsConfig = { win: 3, draw: 1, loss: 0 },
  tiebreakers: Tiebreaker[] = ["points", "goal_diff", "goals_for", "head_to_head"],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of teamIds) {
    rows.set(id, {
      teamId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
      rank: 0,
    });
  }

  const playedMatches = matches.filter(
    (m) =>
      m.status === "completed" &&
      m.teamAId &&
      m.teamBId &&
      m.scoreA !== null &&
      m.scoreB !== null,
  );

  for (const m of playedMatches) {
    const a = rows.get(m.teamAId!);
    const b = rows.get(m.teamBId!);
    if (!a || !b) continue;
    const sa = m.scoreA!;
    const sb = m.scoreB!;
    a.played++;
    b.played++;
    a.goalsFor += sa;
    a.goalsAgainst += sb;
    b.goalsFor += sb;
    b.goalsAgainst += sa;
    if (sa > sb) {
      a.won++;
      b.lost++;
      a.points += points.win;
      b.points += points.loss;
    } else if (sa < sb) {
      b.won++;
      a.lost++;
      b.points += points.win;
      a.points += points.loss;
    } else {
      a.drawn++;
      b.drawn++;
      a.points += points.draw;
      b.points += points.draw;
    }
  }
  for (const row of rows.values()) row.goalDiff = row.goalsFor - row.goalsAgainst;

  // Head-to-head: pré-calcule points entre paires
  const h2hPoints = new Map<string, number>(); // key = `${a}|${b}` -> points de a contre b
  const key = (x: string, y: string) => `${x}|${y}`;
  for (const m of playedMatches) {
    const a = m.teamAId!;
    const b = m.teamBId!;
    const sa = m.scoreA!;
    const sb = m.scoreB!;
    const pa = sa > sb ? points.win : sa < sb ? points.loss : points.draw;
    const pb = sb > sa ? points.win : sb < sa ? points.loss : points.draw;
    h2hPoints.set(key(a, b), (h2hPoints.get(key(a, b)) ?? 0) + pa);
    h2hPoints.set(key(b, a), (h2hPoints.get(key(b, a)) ?? 0) + pb);
  }

  const compare = (a: StandingRow, b: StandingRow): number => {
    for (const tb of tiebreakers) {
      let diff = 0;
      switch (tb) {
        case "points":
          diff = b.points - a.points;
          break;
        case "goal_diff":
          diff = b.goalDiff - a.goalDiff;
          break;
        case "goals_for":
          diff = b.goalsFor - a.goalsFor;
          break;
        case "wins":
          diff = b.won - a.won;
          break;
        case "head_to_head":
          diff =
            (h2hPoints.get(key(b.teamId, a.teamId)) ?? 0) -
            (h2hPoints.get(key(a.teamId, b.teamId)) ?? 0);
          break;
      }
      if (diff !== 0) return diff;
    }
    return 0;
  };

  const sorted = [...rows.values()].sort(compare);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}
