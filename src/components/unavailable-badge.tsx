import { useTranslation } from "react-i18next";
import { ShieldAlert, AlertTriangle, Plane, GraduationCap, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export type UnavailableReason =
  | "suspension"
  | "injury"
  | "vacation"
  | "school"
  | "family";

interface Props {
  reason: UnavailableReason;
  detail?: string;
  size?: "sm" | "md";
  className?: string;
}

const REASON_META: Record<
  UnavailableReason,
  { Icon: typeof ShieldAlert; tone: string; i18n: string }
> = {
  suspension: {
    Icon: ShieldAlert,
    tone: "bg-destructive/10 text-destructive border-destructive/30",
    i18n: "unavailable.suspension",
  },
  injury: {
    Icon: Heart,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    i18n: "unavailable.injury",
  },
  vacation: {
    Icon: Plane,
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
    i18n: "unavailable.vacation",
  },
  school: {
    Icon: GraduationCap,
    tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
    i18n: "unavailable.school",
  },
  family: {
    Icon: AlertTriangle,
    tone: "bg-muted text-muted-foreground border-border",
    i18n: "unavailable.family",
  },
};

export function UnavailableBadge({ reason, detail, size = "sm", className }: Props) {
  const { t } = useTranslation();
  const meta = REASON_META[reason];
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1",
        meta.tone,
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{t(meta.i18n, { defaultValue: reason })}</span>
      {detail && <span className="opacity-80">· {detail}</span>}
    </span>
  );
}
