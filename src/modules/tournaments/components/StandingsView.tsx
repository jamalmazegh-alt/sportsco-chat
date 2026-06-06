import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { getGroupStandings } from "../tournaments.functions";

interface Props {
  tournamentId: string;
}

export function StandingsView({ tournamentId }: Props) {
  const { t } = useTranslation("tournaments");
  const fn = useServerFn(getGroupStandings);
  const q = useQuery({
    queryKey: ["tournament-standings", tournamentId],
    queryFn: () => fn({ data: { tournament_id: tournamentId } }),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const standings = q.data?.standings ?? [];
  if (standings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t("standings.noGroupsYet")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {standings.map(({ group, rows }) => (
        <section key={group.id} className="rounded-xl border border-border bg-card overflow-hidden">
          <header className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
            <h3 className="font-medium text-sm">{group.name}</h3>
            <span className="text-xs text-muted-foreground">
              {t("standings.qualifiers", { count: group.qualifiers_count })}
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
              {rows.map((r: any, i: number) => {
                const qualified = i < group.qualifiers_count;
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
                      {r.team?.name ?? "—"}
                    </td>
                    <td className="px-1 py-2 text-center tabular-nums">
                      {r.played}
                    </td>
                    <td className="px-1 py-2 text-center tabular-nums">{r.won}</td>
                    <td className="px-1 py-2 text-center tabular-nums">{r.drawn}</td>
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
      ))}
    </div>
  );
}
