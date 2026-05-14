import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["attendance_status"];

const STYLES: Record<Status, string> = {
  present: "bg-present text-present-foreground",
  absent: "bg-absent text-absent-foreground",
  uncertain: "bg-uncertain text-uncertain-foreground",
  pending: "bg-pending text-pending-foreground",
};

const LABELS: Record<Status, string> = {
  present: "attendance.present",
  absent: "attendance.absent",
  uncertain: "attendance.uncertain",
  pending: "attendance.pending",
};

import { useTranslation } from "react-i18next";

export function AttendancePill({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STYLES[status],
        className
      )}
    >
      {t(LABELS[status])}
    </span>
  );
}
