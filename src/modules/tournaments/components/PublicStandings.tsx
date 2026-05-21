/**
 * Public standings view — calcule le classement côté client à partir
 * des données publiques (pas d'auth requise).
 */
import { computeStandings } from "../lib/standings";

interface Team {
  id: string;
  group_id: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
}
interface Group {
  id: string;
  name: string;
  sort_order: number;
  qualifiers_count: number;
}
interface Match {
  group_id: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string;
  round: string;
}

interface Props {
  groups: Group[];
  teams: Team[];
  matches: Match[];
}

export function PublicStandings({ groups, teams, matches }: Props) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Pas de phase de groupes.
      </div>
    );
  }
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      {sorted.map((g) => {
        const ids = teams.filter((t) => t.group_id === g.id).map((t) => t.id);
        const groupMatches = matches
          .filter((m) => m.round === "group" && m.group_id === g.id)
          .map((m) => ({
            teamAId: m.team_a_id,
            teamBId: m.team_b_id,
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status,
          }));
        const rows = computeStandings(ids, groupMatches);
        return (
          <section
            key={g.id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <header className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <h3 className="font-medium text-sm">{g.name}</h3>
              <span className="text-xs text-muted-foreground">
                Top {g.qualifiers_count} qualifié{g.qualifiers_count > 1 ? "s" : ""}
              </span>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-3 py-1.5 w-8">#</th>
                  <th className="text-left px-1 py-1.5">Équipe</th>
                  <th className="px-1 py-1.5 w-8">J</th>
                  <th className="px-1 py-1.5 w-8">G</th>
                  <th className="px-1 py-1.5 w-8">N</th>
                  <th className="px-1 py-1.5 w-8">P</th>
                  <th className="px-1 py-1.5 w-10">+/-</th>
                  <th className="px-2 py-1.5 w-10 font-semibold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const qualified = i < g.qualifiers_count;
                  const t = teamMap.get(r.teamId);
                  return (
                    <tr
                      key={r.teamId}
                      className={`border-t border-border ${
                        qualified ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-1 py-2 font-medium truncate max-w-[140px]">
                        {t?.name ?? "—"}
                      </td>
                      <td className="px-1 py-2 text-center tabular-nums">
                        {r.played}
                      </td>
                      <td className="px-1 py-2 text-center tabular-nums">{r.won}</td>
                      <td className="px-1 py-2 text-center tabular-nums">
                        {r.drawn}
                      </td>
                      <td className="px-1 py-2 text-center tabular-nums">
                        {r.lost}
                      </td>
                      <td className="px-1 py-2 text-center tabular-nums">
                        {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                      </td>
                      <td className="px-2 py-2 text-center font-bold tabular-nums">
                        {r.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
