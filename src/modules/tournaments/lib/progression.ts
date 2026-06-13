/**
 * Progression de bracket — fonction pure (B2).
 *
 * Après la saisie / validation d'un score de match à élimination, le vainqueur
 * (et le perdant pour les petites finales / loser bracket) doit être propagé
 * vers les matchs avals dont un slot pointe sur ce match via {fromMatch, outcome}.
 *
 * Le moteur encode ces pointeurs par "compteur de bracket" (1-based) = position
 * ordinale du match dans son bracket, triée par `match_number` :
 *   - KO principal  : matchs `flight_id` null et `round != "group"`.
 *   - chaque Flight : matchs d'un même `flight_id` (le compteur repart à 1 par flight).
 *
 * Garanties :
 *   - seuls les slots à source {fromMatch} sont (ré)écrits ; les seeds directs
 *     (source {teamId} ou nulle) et les déplacements manuels ne sont jamais écrasés ;
 *   - le calcul part toujours de l'état courant => idempotent : rejouer la
 *     propagation ne change rien, et une dévalidation efface proprement les
 *     équipes / vainqueurs avals.
 */

export type BracketSource =
  | { teamId: string }
  | { fromMatch: number; outcome: "winner" | "loser" }
  | null;

export interface ProgressionMatch {
  id: string;
  flight_id: string | null;
  round: string | null;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_source: unknown;
  team_b_source: unknown;
  score_a: number | null;
  score_b: number | null;
  penalty_score_a: number | null;
  penalty_score_b: number | null;
  status: string | null;
  winner_team_id: string | null;
}

export interface ProgressionUpdate {
  id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
}

const FORFEIT_A = new Set(["forfeit_a", "no_show_a"]);
const FORFEIT_B = new Set(["forfeit_b", "no_show_b"]);

/** Vainqueur / perdant décidé d'un match, ou null des deux côtés si indécis. */
export function decideMatchWinner(m: {
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  penalty_score_a: number | null;
  penalty_score_b: number | null;
  status: string | null;
}): { winnerId: string | null; loserId: string | null } {
  const a = m.team_a_id;
  const b = m.team_b_id;
  const status = m.status ?? "";

  // Forfait / no-show : l'équipe présente l'emporte.
  if (FORFEIT_A.has(status)) return { winnerId: b, loserId: a };
  if (FORFEIT_B.has(status)) return { winnerId: a, loserId: b };

  if (status !== "completed") return { winnerId: null, loserId: null };
  if (!a || !b) return { winnerId: null, loserId: null };

  const sa = m.score_a ?? 0;
  const sb = m.score_b ?? 0;
  if (sa > sb) return { winnerId: a, loserId: b };
  if (sb > sa) return { winnerId: b, loserId: a };

  // Égalité au score => tirs au but / tie-break.
  const pa = m.penalty_score_a ?? 0;
  const pb = m.penalty_score_b ?? 0;
  if (pa > pb) return { winnerId: a, loserId: b };
  if (pb > pa) return { winnerId: b, loserId: a };

  return { winnerId: null, loserId: null };
}

function asSource(v: unknown): BracketSource {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.teamId === "string") return { teamId: o.teamId };
    if (typeof o.fromMatch === "number" && (o.outcome === "winner" || o.outcome === "loser")) {
      return { fromMatch: o.fromMatch, outcome: o.outcome };
    }
  }
  return null;
}

/** Clé du bracket auquel appartient un match (null = poule, pas de progression). */
function bracketKey(m: ProgressionMatch): string | null {
  if (m.flight_id) return `flight:${m.flight_id}`;
  if ((m.round ?? "group") === "group") return null;
  return "ko";
}

/**
 * Calcule les mises à jour (team_a_id / team_b_id / winner_team_id) à appliquer
 * pour faire progresser tous les brackets d'un tournoi à partir de l'état courant.
 * Ne renvoie que les matchs réellement modifiés.
 */
export function computeProgressionUpdates(matches: ProgressionMatch[]): ProgressionUpdate[] {
  const groups = new Map<string, ProgressionMatch[]>();
  for (const m of matches) {
    const key = bracketKey(m);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  const updates: ProgressionUpdate[] = [];

  for (const arr of groups.values()) {
    // Tri par match_number => compteur ordinal 1-based (= `fromMatch`).
    const ordered = [...arr].sort((x, y) => (x.match_number ?? 0) - (y.match_number ?? 0));
    const decided = ordered.map((m) => decideMatchWinner(m));

    ordered.forEach((m, idx) => {
      const resolve = (src: BracketSource, current: string | null): string | null => {
        if (src && "fromMatch" in src) {
          const up = decided[src.fromMatch - 1];
          if (!up) return null;
          return src.outcome === "winner" ? up.winnerId : up.loserId;
        }
        // Seed direct (teamId / null) ou déplacement manuel : on conserve.
        return current;
      };

      const nextA = resolve(asSource(m.team_a_source), m.team_a_id);
      const nextB = resolve(asSource(m.team_b_source), m.team_b_id);
      const winnerId = decided[idx].winnerId;

      if (
        nextA !== m.team_a_id ||
        nextB !== m.team_b_id ||
        (winnerId ?? null) !== (m.winner_team_id ?? null)
      ) {
        updates.push({
          id: m.id,
          team_a_id: nextA,
          team_b_id: nextB,
          winner_team_id: winnerId,
        });
      }
    });
  }

  return updates;
}
