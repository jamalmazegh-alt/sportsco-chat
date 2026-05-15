import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Period = "30d" | "90d" | "season" | "all";
type EventTypeFilter = "all" | "training" | "match";

function periodSince(p: Period): Date | null {
  const now = new Date();
  if (p === "all") return null;
  if (p === "30d") return new Date(now.getTime() - 30 * 86400 * 1000);
  if (p === "90d") return new Date(now.getTime() - 90 * 86400 * 1000);
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 7, 1);
}

type Row = {
  player_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  present: number;
  absent: number;
  uncertain: number;
  pending: number;
  total: number;
};

export function TeamAttendanceStats({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("season");
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("training");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["team-attendance", teamId],
    queryFn: async () => {
      const { data: tm } = await supabase
        .from("team_members")
        .select("player_id, players:player_id(id, first_name, last_name, jersey_number)")
        .eq("team_id", teamId)
        .eq("role", "player");
      const players = (tm ?? []).map((r: any) => r.players).filter(Boolean);

      const { data: events } = await supabase
        .from("events")
        .select("id, type, starts_at")
        .eq("team_id", teamId);

      const { data: convs } = await supabase
        .from("convocations")
        .select("player_id, status, event_id")
        .in("event_id", (events ?? []).map((e: any) => e.id));

      return { players, events: events ?? [], convs: convs ?? [] };
    },
  });

  const aggregated: Row[] = useMemo(() => {
    if (!rows) return [];
    const since = periodSince(period);
    const eventMap = new Map<string, any>(rows.events.map((e: any) => [e.id, e]));
    const filterEvent = (eid: string) => {
      const ev = eventMap.get(eid);
      if (!ev) return false;
      if (typeFilter !== "all" && ev.type !== typeFilter) return false;
      if (since && new Date(ev.starts_at) < since) return false;
      return new Date(ev.starts_at).getTime() <= Date.now();
    };
    return rows.players
      .map((p: any) => {
        const cs = rows.convs.filter((c: any) => c.player_id === p.id && filterEvent(c.event_id));
        const counts = { present: 0, absent: 0, uncertain: 0, pending: 0 };
        for (const c of cs) {
          const k = c.status as keyof typeof counts;
          if (k in counts) counts[k]++;
        }
        const total = counts.present + counts.absent + counts.uncertain + counts.pending;
        return {
          player_id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          jersey_number: p.jersey_number,
          ...counts,
          total,
        };
      })
      .sort((a: Row, b: Row) => {
        const ra = a.total === 0 ? -1 : a.present / a.total;
        const rb = b.total === 0 ? -1 : b.present / b.total;
        return rb - ra;
      });
  }, [rows, period, typeFilter]);

  const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> {t("stats.teamTitle")}
        </h2>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["30d", "90d", "season", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "text-xs rounded-full px-3 py-1 border transition-colors",
              period === p
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {t(`stats.period.${p}`)}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {(["training", "match", "all"] as EventTypeFilter[]).map((p) => (
          <button
            key={p}
            onClick={() => setTypeFilter(p)}
            className={cn(
              "text-xs rounded-full px-3 py-1 border transition-colors",
              typeFilter === p
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {t(`stats.type.${p}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : aggregated.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("stats.empty")}</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm border-separate border-spacing-y-1 px-2">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium py-1">{t("teams.players")}</th>
                <th className="text-right font-medium px-2">%</th>
                <th className="text-right font-medium px-2">{t("attendance.present")}</th>
                <th className="text-right font-medium px-2">{t("attendance.absent")}</th>
                <th className="text-right font-medium px-2">{t("attendance.uncertain")}</th>
              </tr>
            </thead>
            <tbody>
              {aggregated.map((r) => {
                const ratio = pct(r.present, r.total);
                return (
                  <tr key={r.player_id} className="bg-muted/30">
                    <td className="rounded-l-lg py-2 pl-2 pr-1 truncate max-w-[140px]">
                      <span className="font-medium">{r.first_name} {r.last_name}</span>
                      {r.jersey_number ? <span className="text-muted-foreground"> · #{r.jersey_number}</span> : null}
                    </td>
                    <td className="px-2 text-right tabular-nums">
                      <span
                        className={cn(
                          "inline-block min-w-[42px] rounded-md px-1.5 py-0.5 text-xs font-semibold",
                          r.total === 0
                            ? "bg-muted text-muted-foreground"
                            : ratio >= 75
                            ? "bg-present/20 text-present-foreground"
                            : ratio >= 50
                            ? "bg-uncertain/20 text-uncertain-foreground"
                            : "bg-absent/15 text-absent"
                        )}
                      >
                        {r.total === 0 ? "—" : `${ratio}%`}
                      </span>
                    </td>
                    <td className="px-2 text-right tabular-nums text-present-foreground">{r.present}</td>
                    <td className="px-2 text-right tabular-nums text-absent">{r.absent}</td>
                    <td className="rounded-r-lg px-2 text-right tabular-nums text-uncertain-foreground">{r.uncertain}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
