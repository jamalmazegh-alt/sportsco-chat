import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type ConvocationCounts = {
  present: number;
  absent: number;
  uncertain: number;
  pending: number;
};

/**
 * Discreet present/absent/uncertain summary shown on event rows for staff.
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

  const items: Array<{ key: string; value: number; label: string; color: string }> = [
    {
      key: "present",
      value: counts.present,
      label: t("attendance.present"),
      color: "text-present",
    },
    {
      key: "absent",
      value: counts.absent,
      label: t("attendance.absent"),
      color: "text-defeat",
    },
    {
      key: "uncertain",
      value: counts.uncertain,
      label: t("attendance.uncertain"),
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "pending",
      value: counts.pending,
      label: t("attendance.pending"),
      color: "text-muted-foreground",
    },
  ];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-semibold tabular-nums",
        className,
      )}
      title={items.map((i) => `${i.value} ${i.label}`).join(" · ")}
    >
      {items.map((i) => (
        <span key={i.key} className={cn("inline-flex items-center gap-0.5", i.color)}>
          <span aria-hidden className="text-[13px] leading-none">
            {i.key === "present" ? "✓" : i.key === "absent" ? "✕" : i.key === "uncertain" ? "?" : "·"}
          </span>
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
