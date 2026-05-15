import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BarChart3, Target, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Period = "30d" | "90d" | "season" | "all";
type EventTypeFilter = "all" | "match" | "training";

function periodSince(p: Period): Date | null {
  const now = new Date();
  if (p === "all") return null;
  if (p === "30d") return new Date(now.getTime() - 30 * 86400 * 1000);
  if (p === "90d") return new Date(now.getTime() - 90 * 86400 * 1000);
  // season: aug 1 of current or previous year
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 7, 1);
}

export function PlayerAttendanceStats({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("season");
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("all");

  const { data: convocs } = useQuery({
    queryKey: ["player-convocs", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("convocations")
        .select("id, status, event_id, events:event_id(starts_at, type, title)")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: goalCount } = useQuery({
    queryKey: ["player-goals-count", playerId],
    queryFn: async () => {
      const { count } = await supabase
        .from("event_goals")
        .select("id", { count: "exact", head: true })
        .eq("scorer_player_id", playerId);
      return count ?? 0;
    },
  });

  const { data: assistCount } = useQuery({
    queryKey: ["player-assists-count", playerId],
    queryFn: async () => {
      const { count } = await supabase
        .from("event_goals")
        .select("id", { count: "exact", head: true })
        .eq("assist_player_id", playerId);
      return count ?? 0;
    },
  });

  const filtered = useMemo(() => {
    if (!convocs) return [];
    const since = periodSince(period);
    return convocs.filter((c: any) => {
      const ev = c.events;
      if (!ev) return false;
      if (typeFilter !== "all" && ev.type !== typeFilter) return false;
      if (since && new Date(ev.starts_at) < since) return false;
      // Only count past events for attendance ratio
      return new Date(ev.starts_at).getTime() <= Date.now();
    });
  }, [convocs, period, typeFilter]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, uncertain: 0, pending: 0 };
    filtered.forEach((x: any) => {
      const k = x.status as keyof typeof c;
      if (k in c) c[k]++;
    });
    return c;
  }, [filtered]);

  const total = counts.present + counts.absent + counts.uncertain + counts.pending;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> {t("stats.title")}
        </h2>
      </div>

      {/* Filters */}
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
        {(["all", "match", "training"] as EventTypeFilter[]).map((p) => (
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

      {/* Attendance grid */}
      <div className="grid grid-cols-4 gap-2">
        <Stat
          label={t("attendance.present")}
          value={`${pct(counts.present)}%`}
          sub={`${counts.present}/${total}`}
          cls="bg-present/15 text-present-foreground border-present/30"
        />
        <Stat
          label={t("attendance.absent")}
          value={`${pct(counts.absent)}%`}
          sub={`${counts.absent}/${total}`}
          cls="bg-absent/10 text-absent border-absent/30"
        />
        <Stat
          label={t("attendance.uncertain")}
          value={`${pct(counts.uncertain)}%`}
          sub={`${counts.uncertain}/${total}`}
          cls="bg-uncertain/15 text-uncertain-foreground border-uncertain/30"
        />
        <Stat
          label={t("attendance.pending")}
          value={`${counts.pending}`}
          sub=""
          cls="bg-pending/40 text-pending-foreground border-border"
        />
      </div>

      {/* Goals/assists */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        <Stat
          label={t("stats.goals")}
          value={String(goalCount ?? 0)}
          sub=""
          cls="bg-primary/10 text-primary border-primary/30"
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <Stat
          label={t("stats.assists")}
          value={String(assistCount ?? 0)}
          sub=""
          cls="bg-secondary/30 text-foreground border-border"
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
      </div>

      {total === 0 && (
        <p className="text-xs text-muted-foreground italic">{t("stats.empty")}</p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  cls,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  cls: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border p-2.5 text-center", cls)}>
      <p className="text-lg font-bold leading-none flex items-center justify-center gap-1">
        {icon}
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-wider mt-1.5 opacity-90">{label}</p>
      {sub && <p className="text-[9px] mt-0.5 opacity-70 tabular-nums">{sub}</p>}
    </div>
  );
}
