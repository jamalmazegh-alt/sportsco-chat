import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Crown, TrendingUp, Minus } from "lucide-react";
import { getGroupStandings } from "../tournaments.functions";
import { cn } from "@/lib/utils";

interface Props {
  tournamentId: string;
}

// Anime Premium green gradient (matches Tournament Hero)
const GREEN_GRADIENT = "linear-gradient(135deg, #0f4a26 0%, #1d7a45 60%, #2d9d5f 100%)";

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
      <div className="rounded-[16px] border-[1.5px] border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        {t("standings.noGroupsYet")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {standings.map(({ group, rows }) => (
        <section
          key={group.id}
          className="rounded-[16px] border-[1.5px] border-border bg-card overflow-hidden"
          style={{ boxShadow: "0 2px 8px rgba(15,74,38,0.06)" }}
        >
          {/* Pool header — gradient green strip */}
          <header
            className="relative px-4 py-2.5 flex items-center justify-between text-white overflow-hidden"
            style={{ background: GREEN_GRADIENT }}
          >
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
              viewBox="0 0 200 40"
              preserveAspectRatio="none"
            >
              <path
                d="M -10 30 L 50 -5 M 30 45 L 110 -10 M 90 45 L 170 -5"
                stroke="#ffffff"
                strokeWidth="1"
              />
            </svg>
            <h3 className="relative font-extrabold text-[14px] tracking-tight">{group.name}</h3>
            <span className="relative inline-flex items-center gap-1 rounded-full bg-card/15 ring-1 ring-white/25 backdrop-blur px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              <Crown className="h-2.5 w-2.5" />
              {t("standings.qualifiers", { count: group.qualifiers_count })}
            </span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                  <th className="text-left px-3 py-2 w-8">#</th>
                  <th className="text-left px-1 py-2">{t("standings.team")}</th>
                  <th className="px-1 py-2 w-8">{t("standings.played")}</th>
                  <th className="px-1 py-2 w-8">{t("standings.won")}</th>
                  <th className="px-1 py-2 w-8">{t("standings.drawn")}</th>
                  <th className="px-1 py-2 w-8">{t("standings.lost")}</th>
                  <th className="px-1 py-2 w-10">{t("standings.diff")}</th>
                  <th className="px-2 py-2 w-10 font-extrabold text-foreground">
                    {t("standings.points")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => {
                  const rank = i + 1;
                  const qualified = i < group.qualifiers_count;
                  const isLeader = rank === 1;
                  const diff: number = r.goalDiff ?? 0;
                  return (
                    <tr
                      key={r.teamId}
                      className={cn(
                        "border-t border-border transition-colors",
                        qualified ? "bg-emerald-50/60 dark:bg-emerald-950/15" : "hover:bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <RankBadge rank={rank} qualified={qualified} isLeader={isLeader} />
                      </td>
                      <td className="px-1 py-2.5 font-semibold truncate max-w-[140px]">
                        <span className={cn(isLeader && "text-emerald-700 dark:text-emerald-400")}>
                          {r.team?.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-1 py-2.5 text-center tabular-nums text-muted-foreground">
                        {r.played}
                      </td>
                      <td className="px-1 py-2.5 text-center tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                        {r.won}
                      </td>
                      <td className="px-1 py-2.5 text-center tabular-nums text-muted-foreground">
                        {r.drawn}
                      </td>
                      <td className="px-1 py-2.5 text-center tabular-nums text-rose-600/80 dark:text-rose-400/80">
                        {r.lost}
                      </td>
                      <td className="px-1 py-2.5 text-center tabular-nums">
                        <DiffCell diff={diff} />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[28px] h-6 rounded-md font-extrabold tabular-nums text-[13px]",
                            qualified ? "bg-emerald-600 text-white" : "bg-muted text-foreground",
                          )}
                        >
                          {r.points}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function RankBadge({
  rank,
  qualified,
  isLeader,
}: {
  rank: number;
  qualified: boolean;
  isLeader: boolean;
}) {
  if (isLeader) {
    return (
      <span
        className="inline-flex items-center justify-center h-6 w-6 rounded-full text-white font-extrabold text-[11px] tabular-nums shadow-sm"
        style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
      >
        {rank}
      </span>
    );
  }
  if (qualified) {
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30 font-bold text-[11px] tabular-nums">
        {rank}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 text-muted-foreground font-medium text-[11px] tabular-nums">
      {rank}
    </span>
  );
}

function DiffCell({ diff }: { diff: number }) {
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium">
        <Minus className="h-2.5 w-2.5" />0
      </span>
    );
  }
  const positive = diff > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {positive && <TrendingUp className="h-2.5 w-2.5" />}
      {positive ? `+${diff}` : diff}
    </span>
  );
}
