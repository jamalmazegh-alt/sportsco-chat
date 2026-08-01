import { useTranslation } from "react-i18next";
import { Check, X, HelpCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConvocationCounts = {
  present: number;
  absent: number;
  uncertain: number;
  pending: number;
};

/**
 * Compact present/absent/uncertain/pending summary shown on event rows for staff.
 * Purely presentational — counts are computed by the caller.
 */
export function ConvocationSummaryPill({
  counts,
  className,
}: {
  counts: ConvocationCounts;
  className?: string;
}) {
  const { t } = useTranslation();
  const total = counts.present + counts.absent + counts.uncertain + counts.pending;
  if (total === 0) return null;

  const items: Array<{
    key: string;
    value: number;
    label: string;
    Icon: typeof Check;
    bg: string;
    fg: string;
  }> = [
    {
      key: "present",
      value: counts.present,
      label: t("attendance.present"),
      Icon: Check,
      bg: "bg-present/10",
      fg: "text-present",
    },
    {
      key: "absent",
      value: counts.absent,
      label: t("attendance.absent"),
      Icon: X,
      bg: "bg-defeat/10",
      fg: "text-defeat",
    },
    {
      key: "uncertain",
      value: counts.uncertain,
      label: t("attendance.uncertain"),
      Icon: HelpCircle,
      bg: "bg-amber-500/10",
      fg: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "pending",
      value: counts.pending,
      label: t("attendance.pending"),
      Icon: Clock,
      bg: "bg-muted",
      fg: "text-muted-foreground",
    },
  ];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={items.map((i) => `${i.value} ${i.label}`).join(" · ")}
    >
      {items.map((i) => (
        <span
          key={i.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-bold tabular-nums",
            i.bg,
            i.fg,
            i.key === "present" && "border-present/20",
            i.key === "absent" && "border-defeat/20",
            i.key === "uncertain" && "border-amber-500/20",
            i.key === "pending" && "border-border",
          )}
        >
          <i.Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          {i.value}
        </span>
      ))}
    </span>
  );
}

export function buildConvocationCounts(
  rows: Array<{ event_id: string; status: string | null }>,
): Map<string, ConvocationCounts> {
  const map = new Map<string, ConvocationCounts>();
  for (const r of rows) {
    const c = map.get(r.event_id) ?? { present: 0, absent: 0, uncertain: 0, pending: 0 };
    if (r.status === "present") c.present += 1;
    else if (r.status === "absent") c.absent += 1;
    else if (r.status === "uncertain") c.uncertain += 1;
    else c.pending += 1;
    map.set(r.event_id, c);
  }
  return map;
}
