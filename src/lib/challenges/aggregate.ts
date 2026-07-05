/**
 * Ranking aggregate helpers — pure, isomorphic.
 *
 * - `cumulative` challenges (e.g. Cross Bar season total) sum every value.
 * - `record` challenges (jonglerie, sprint, Léger) keep the best value based
 *   on direction (max for higher_better, min for lower_better).
 */
export type Direction = "higher_better" | "lower_better";
export type Aggregate = "cumulative" | "record";

export type RankRow<T = Record<string, unknown>> = T & {
  player_id: string;
  score: number; // aggregate value used to sort
  count: number; // number of raw results
};

export function aggregateResults<T extends { player_id: string; value: number }>(
  rows: T[],
  aggregate: Aggregate,
  direction: Direction,
): RankRow<{ raw: T[] }>[] {
  const byPlayer = new Map<string, T[]>();
  for (const r of rows) {
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }

  const out: RankRow<{ raw: T[] }>[] = [];
  for (const [player_id, raw] of byPlayer) {
    let score: number;
    if (aggregate === "cumulative") {
      score = raw.reduce((s, r) => s + r.value, 0);
    } else {
      score =
        direction === "higher_better"
          ? Math.max(...raw.map((r) => r.value))
          : Math.min(...raw.map((r) => r.value));
    }
    out.push({ player_id, score, count: raw.length, raw });
  }

  out.sort((a, b) => (direction === "higher_better" ? b.score - a.score : a.score - b.score));
  return out;
}
