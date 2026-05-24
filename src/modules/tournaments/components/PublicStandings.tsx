/**
 * Public standings view — calcule le classement côté client à partir
 * des données publiques (pas d'auth requise).
 */
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tournaments");
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t("standings.noGroupsPhase")}
      </div>
    );
  }
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      {sorted.map((g) => {
        const ids = teams.filter((tm) => tm.group_id === g.id).map((tm) => tm.id);
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
                {t("standings.topQualifiers", { count: g.qualifiers_count })}
              </span>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-3 py-1.5 w-8">#</th>
                  <th className="text-left px-1 py-1.5">{t("standings.team")}</th>
                  <th className="px-1 py-1.5 w-8">{t("standings.played")}</th>
                  <th className="px-1 py-1.5 w-8">{t("standings.won")}</th>
                  <th className="px-1 py-1.5 w-8">{t("standings.drawn")}</th>
                  <th className="px-1 py-1.5 w-8">{t("standings.lost")}</th>
                  <th className="px-1 py-1.5 w-10">{t("standings.diff")}</th>
                  <th className="px-2 py-1.5 w-10 font-semibold">{t("standings.points")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const qualified = i < g.qualifiers_count;
                  const isFirstNonQualified = i === g.qualifiers_count;
                  const tm = teamMap.get(r.teamId);
                  return (
                    <tr
                      key={r.teamId}
                      className={`border-t ${
                        isFirstNonQualified ? "border-t-2 border-t-primary/30" : "border-border"
                      } ${qualified ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted-foreground tabular-nums relative">
                        {qualified && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary"
                          />
                        )}
                        {i + 1}
                      </td>
                      <td className="px-1 py-2 font-medium truncate max-w-[140px]">
                        <span className="inline-flex items-center gap-1.5">
                          {tm?.name ?? "—"}
                          {qualified && (
                            <span className="hidden sm:inline-block rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                              {t("public.standings.qualifiedTag", { defaultValue: "Qualifié" })}
                            </span>
                          )}
                        </span>
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
                      <td className={`px-1 py-2 text-center tabular-nums ${r.goalDiff > 0 ? "text-emerald-600 dark:text-emerald-400" : r.goalDiff < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
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
