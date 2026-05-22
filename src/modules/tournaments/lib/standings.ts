/**
 * Classements de poule — fonction pure, déterministe.
 *
 * Calcule un classement à partir des matchs joués selon les règles
 * de points, fair-play et tiebreakers configurés.
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
  fairPlay: number; // pénalité négative (ex: -3 pour un rouge)
  rank: number;
}

export interface MatchInput {
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
  penaltyA?: number | null;
  penaltyB?: number | null;
}

export interface ForfeitConfig {
  winnerScore: number;
  loserScore: number;
  abandonedAsForfeit: boolean;
}

export const DEFAULT_FORFEIT: ForfeitConfig = {
  winnerScore: 3,
  loserScore: 0,
  abandonedAsForfeit: true,
};

/**
 * Normalise un match selon son statut spécial (forfait, équipe absente, abandon).
 * Retourne null si le match doit être ignoré (annulé, non joué).
 */
function normalizeSpecialStatus(
  m: MatchInput,
  forfeit: ForfeitConfig,
): MatchInput | null {
  switch (m.status) {
    case "completed":
      return m.scoreA !== null && m.scoreB !== null ? m : null;
    case "forfeit_a":
    case "no_show_a":
      // équipe A perd par forfait
      return { ...m, scoreA: forfeit.loserScore, scoreB: forfeit.winnerScore, status: "completed" };
    case "forfeit_b":
    case "no_show_b":
      return { ...m, scoreA: forfeit.winnerScore, scoreB: forfeit.loserScore, status: "completed" };
    case "abandoned":
      if (!forfeit.abandonedAsForfeit) {
        // Garder le score figé au moment de l'abandon
        return m.scoreA !== null && m.scoreB !== null ? { ...m, status: "completed" } : null;
      }
      // Sinon : l'équipe qui mène garde la victoire par forfait ; à défaut, équipe A perd
      if (m.scoreA !== null && m.scoreB !== null) {
        if (m.scoreA > m.scoreB) {
          return { ...m, scoreA: forfeit.winnerScore, scoreB: forfeit.loserScore, status: "completed" };
        }
        if (m.scoreB > m.scoreA) {
          return { ...m, scoreA: forfeit.loserScore, scoreB: forfeit.winnerScore, status: "completed" };
        }
      }
      return null;
    case "cancelled":
    default:
      return null;
  }
}


export interface MatchEventInput {
  matchId: string;
  teamId: string | null;
  kind:
    | "goal"
    | "own_goal"
    | "assist"
    | "yellow_card"
    | "red_card"
    | "second_yellow"
    | "penalty"
    | "foul";
}

export interface PointsConfig {
  win: number;
  draw: number;
  loss: number;
  bonusWin?: number;
}

export interface FairPlayConfig {
  enabled: boolean;
  yellow: number; // ex: -1
  red: number; // ex: -3
  secondYellow?: number;
}

export type Tiebreaker =
  | "points"
  | "head_to_head_points"
  | "head_to_head_gd"
  | "head_to_head_gf"
  | "goal_diff"
  | "goals_for"
  | "wins"
  | "fair_play"
  | "draw_lot"
  // legacy alias accepted for backward compat
  | "head_to_head";

export const DEFAULT_POINTS: PointsConfig = { win: 3, draw: 1, loss: 0 };
export const DEFAULT_TIEBREAKERS: Tiebreaker[] = [
  "points",
  "head_to_head_points",
  "head_to_head_gd",
  "goal_diff",
  "goals_for",
];
export const DEFAULT_FAIR_PLAY: FairPlayConfig = {
  enabled: false,
  yellow: -1,
  red: -3,
  secondYellow: -3,
};

function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}

export function computeStandings(
  teamIds: string[],
  matches: MatchInput[],
  points: PointsConfig = DEFAULT_POINTS,
  tiebreakers: Tiebreaker[] = DEFAULT_TIEBREAKERS,
  options: {
    fairPlay?: FairPlayConfig;
    events?: MatchEventInput[];
    drawLotSalt?: string; // pour rendre draw_lot transparent et stable par tournoi
    forfeit?: ForfeitConfig;
  } = {},
): StandingRow[] {
  const fp = options.fairPlay ?? DEFAULT_FAIR_PLAY;
  const events = options.events ?? [];
  const salt = options.drawLotSalt ?? "";
  const forfeit = options.forfeit ?? DEFAULT_FORFEIT;

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
      fairPlay: 0,
      rank: 0,
    });
  }

  const playedMatches = matches
    .map((m) =>
      m.teamAId && m.teamBId ? normalizeSpecialStatus(m, forfeit) : null,
    )
    .filter((m): m is MatchInput => m !== null);

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

  // Fair play scoring
  if (fp.enabled) {
    for (const ev of events) {
      if (!ev.teamId) continue;
      const r = rows.get(ev.teamId);
      if (!r) continue;
      if (ev.kind === "yellow_card") r.fairPlay += fp.yellow;
      else if (ev.kind === "red_card") r.fairPlay += fp.red;
      else if (ev.kind === "second_yellow")
        r.fairPlay += fp.secondYellow ?? fp.red;
    }
  }

  // Pre-compute head-to-head matrices (points / GD / GF)
  const h2hPts = new Map<string, number>();
  const h2hGd = new Map<string, number>();
  const h2hGf = new Map<string, number>();
  const k = (x: string, y: string) => `${x}|${y}`;
  for (const m of playedMatches) {
    const a = m.teamAId!;
    const b = m.teamBId!;
    const sa = m.scoreA!;
    const sb = m.scoreB!;
    const pa = sa > sb ? points.win : sa < sb ? points.loss : points.draw;
    const pb = sb > sa ? points.win : sb < sa ? points.loss : points.draw;
    h2hPts.set(k(a, b), (h2hPts.get(k(a, b)) ?? 0) + pa);
    h2hPts.set(k(b, a), (h2hPts.get(k(b, a)) ?? 0) + pb);
    h2hGd.set(k(a, b), (h2hGd.get(k(a, b)) ?? 0) + (sa - sb));
    h2hGd.set(k(b, a), (h2hGd.get(k(b, a)) ?? 0) + (sb - sa));
    h2hGf.set(k(a, b), (h2hGf.get(k(a, b)) ?? 0) + sa);
    h2hGf.set(k(b, a), (h2hGf.get(k(b, a)) ?? 0) + sb);
  }

  // Mini-league h2h for groups of ≥3 tied teams: sub-rank using only their
  // matches between each other (FIFA rule).
  function miniLeague(teams: StandingRow[]): Map<string, number> {
    if (teams.length < 3) return new Map();
    const sub = new Map<string, { pts: number; gd: number; gf: number }>();
    for (const t of teams) sub.set(t.teamId, { pts: 0, gd: 0, gf: 0 });
    for (const m of playedMatches) {
      if (!sub.has(m.teamAId!) || !sub.has(m.teamBId!)) continue;
      const sa = m.scoreA!;
      const sb = m.scoreB!;
      const a = sub.get(m.teamAId!)!;
      const b = sub.get(m.teamBId!)!;
      a.gd += sa - sb;
      b.gd += sb - sa;
      a.gf += sa;
      b.gf += sb;
      if (sa > sb) {
        a.pts += points.win;
        b.pts += points.loss;
      } else if (sa < sb) {
        b.pts += points.win;
        a.pts += points.loss;
      } else {
        a.pts += points.draw;
        b.pts += points.draw;
      }
    }
    const ordered = [...sub.entries()].sort((x, y) => {
      if (y[1].pts !== x[1].pts) return y[1].pts - x[1].pts;
      if (y[1].gd !== x[1].gd) return y[1].gd - x[1].gd;
      return y[1].gf - x[1].gf;
    });
    const out = new Map<string, number>();
    ordered.forEach(([id], i) => out.set(id, ordered.length - i));
    return out;
  }

  const compareSingle = (a: StandingRow, b: StandingRow, tb: Tiebreaker): number => {
    switch (tb) {
      case "points":
        return b.points - a.points;
      case "goal_diff":
        return b.goalDiff - a.goalDiff;
      case "goals_for":
        return b.goalsFor - a.goalsFor;
      case "wins":
        return b.won - a.won;
      case "fair_play":
        return b.fairPlay - a.fairPlay; // higher (less negative) wins
      case "head_to_head":
      case "head_to_head_points":
        return (
          (h2hPts.get(k(b.teamId, a.teamId)) ?? 0) -
          (h2hPts.get(k(a.teamId, b.teamId)) ?? 0)
        );
      case "head_to_head_gd":
        return (
          (h2hGd.get(k(b.teamId, a.teamId)) ?? 0) -
          (h2hGd.get(k(a.teamId, b.teamId)) ?? 0)
        );
      case "head_to_head_gf":
        return (
          (h2hGf.get(k(b.teamId, a.teamId)) ?? 0) -
          (h2hGf.get(k(a.teamId, b.teamId)) ?? 0)
        );
      case "draw_lot": {
        // Deterministic pseudo-random based on team id + salt
        return djb2(salt + a.teamId) - djb2(salt + b.teamId);
      }
    }
  };

  // Multi-pass sort: detect groups of ties on the *current* criterion and
  // apply remaining tiebreakers within each group.
  function sortWith(list: StandingRow[], tbs: Tiebreaker[]): StandingRow[] {
    if (list.length <= 1 || tbs.length === 0) return list;
    const [head, ...rest] = tbs;
    // Special case: mini-league h2h points when ≥3 tied
    if (head === "head_to_head_points" || head === "head_to_head") {
      // First sort everyone by raw h2h points
      const sorted = [...list].sort((x, y) => compareSingle(x, y, head));
      // Group equals
      const groups: StandingRow[][] = [];
      let cur: StandingRow[] = [];
      for (const r of sorted) {
        if (cur.length === 0 || compareSingle(cur[0], r, head) === 0) cur.push(r);
        else {
          groups.push(cur);
          cur = [r];
        }
      }
      if (cur.length) groups.push(cur);
      const out: StandingRow[] = [];
      for (const g of groups) {
        if (g.length >= 3) {
          // mini-league refinement
          const mini = miniLeague(g);
          const refined = [...g].sort(
            (x, y) => (mini.get(y.teamId) ?? 0) - (mini.get(x.teamId) ?? 0),
          );
          // recurse into remaining tbs for still-tied subgroups
          out.push(...sortWith(refined, rest));
        } else {
          out.push(...sortWith(g, rest));
        }
      }
      return out;
    }
    const sorted = [...list].sort((x, y) => compareSingle(x, y, head));
    const groups: StandingRow[][] = [];
    let cur: StandingRow[] = [];
    for (const r of sorted) {
      if (cur.length === 0 || compareSingle(cur[0], r, head) === 0) cur.push(r);
      else {
        groups.push(cur);
        cur = [r];
      }
    }
    if (cur.length) groups.push(cur);
    return groups.flatMap((g) => sortWith(g, rest));
  }

  const sorted = sortWith([...rows.values()], tiebreakers);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}
