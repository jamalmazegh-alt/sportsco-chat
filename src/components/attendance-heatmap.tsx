import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Convoc = {
  id: string;
  status: "present" | "absent" | "uncertain" | "pending" | string;
  events: { starts_at: string; title?: string; type?: string } | null;
};

const WEEKS = 12;
const DAYS = WEEKS * 7;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const STATUS_RANK: Record<string, number> = {
  // higher rank wins when multiple events share a day
  pending: 1,
  uncertain: 2,
  absent: 3,
  present: 4,
};

const STATUS_CLASS: Record<string, string> = {
  present: "bg-present/80 hover:bg-present",
  absent: "bg-absent/80 hover:bg-absent",
  uncertain: "bg-uncertain/80 hover:bg-uncertain",
  pending: "bg-pending hover:bg-pending/80",
};

export function AttendanceHeatmap({ convocations }: { convocations: Convoc[] }) {
  const { t } = useTranslation();

  const { days, monthLabels } = useMemo(() => {
    const today = startOfDay(new Date());
    // Align end-of-grid to Saturday (so weeks render as columns)
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (DAYS - 1));

    // Bucket events by day, keep best status + titles
    const buckets = new Map<string, { status: string; titles: string[]; date: Date }>();
    for (const c of convocations) {
      if (!c.events?.starts_at) continue;
      const d = startOfDay(new Date(c.events.starts_at));
      if (d < start || d > end) continue;
      if (d > today) continue; // only past/today
      const k = dayKey(d);
      const existing = buckets.get(k);
      const rank = STATUS_RANK[c.status] ?? 0;
      const titles = [c.events.title ?? ""].filter(Boolean);
      if (!existing || rank > (STATUS_RANK[existing.status] ?? 0)) {
        buckets.set(k, { status: c.status, titles: [...(existing?.titles ?? []), ...titles], date: d });
      } else {
        existing.titles.push(...titles);
      }
    }

    const days: Array<{
      date: Date;
      status: string | null;
      titles: string[];
      isFuture: boolean;
    }> = [];
    const monthLabels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;

    for (let i = 0; i < DAYS; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = dayKey(d);
      const b = buckets.get(k);
      days.push({
        date: d,
        status: b?.status ?? null,
        titles: b?.titles ?? [],
        isFuture: d > today,
      });
      const col = Math.floor(i / 7);
      const dayOfWeek = d.getDay();
      // Add month label at the first row of a column (Sunday) when month changes
      if (dayOfWeek === 0 && d.getMonth() !== lastMonth) {
        monthLabels.push({
          col,
          label: d.toLocaleDateString(undefined, { month: "short" }),
        });
        lastMonth = d.getMonth();
      }
    }

    return { days, monthLabels };
  }, [convocations]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, uncertain: 0 };
    for (const d of days) {
      if (d.status && d.status in c) c[d.status as keyof typeof c]++;
    }
    return c;
  }, [days]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> {t("heatmap.title", { defaultValue: "Carte de présence" })}
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {t("heatmap.lastWeeks", { defaultValue: "{{n}} dernières semaines", n: WEEKS })}
        </span>
      </div>

      {/* Grid: columns = weeks, rows = days */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-flex flex-col gap-1 min-w-full">
          {/* Month labels row */}
          <div className="flex gap-1 h-3 ml-6">
            {Array.from({ length: WEEKS }, (_, col) => {
              const m = monthLabels.find((x) => x.col === col);
              return (
                <div key={col} className="w-3.5 text-[9px] text-muted-foreground leading-3">
                  {m?.label ?? ""}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-1 mr-1 text-[9px] text-muted-foreground leading-3 w-5">
              {["", "M", "", "W", "", "F", ""].map((d, i) => (
                <div key={i} className="h-3.5 flex items-center">{d}</div>
              ))}
            </div>
            {/* Week columns */}
            {Array.from({ length: WEEKS }, (_, col) => (
              <div key={col} className="flex flex-col gap-1">
                {Array.from({ length: 7 }, (_, row) => {
                  const idx = col * 7 + row;
                  const d = days[idx];
                  if (!d) return <div key={row} className="w-3.5 h-3.5" />;
                  const cls = d.status ? STATUS_CLASS[d.status] ?? "bg-muted" : "bg-muted/40";
                  const dateLabel = d.date.toLocaleDateString();
                  const tip = d.titles.length
                    ? `${dateLabel} · ${d.titles.join(", ")}`
                    : d.isFuture
                      ? dateLabel
                      : `${dateLabel} — ${t("heatmap.noEvent", { defaultValue: "Pas d'événement" })}`;
                  return (
                    <div
                      key={row}
                      title={tip}
                      className={cn(
                        "w-3.5 h-3.5 rounded-[3px] transition-colors",
                        cls,
                        d.isFuture && "opacity-30"
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground pt-1">
        <LegendDot cls="bg-present/80" label={t("attendance.present")} count={counts.present} />
        <LegendDot cls="bg-uncertain/80" label={t("attendance.uncertain")} count={counts.uncertain} />
        <LegendDot cls="bg-absent/80" label={t("attendance.absent")} count={counts.absent} />
        <LegendDot cls="bg-muted/40" label={t("heatmap.noEvent", { defaultValue: "Pas d'événement" })} />
      </div>
    </section>
  );
}

function LegendDot({ cls, label, count }: { cls: string; label: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-2.5 h-2.5 rounded-[2px]", cls)} />
      {label}
      {count != null && count > 0 && <span className="tabular-nums opacity-70">({count})</span>}
    </span>
  );
}
