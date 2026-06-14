import { Calendar, Volleyball, Goal, Trophy, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  training: Volleyball,
  match: Goal,
  tournament: Trophy,
  meeting: Users,
  other: Calendar,
};

const COLORS: Record<string, string> = {
  training: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  match: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  tournament: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  meeting: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  other: "bg-muted text-muted-foreground",
};

export function getEventTypeIcon(type: string | null | undefined): LucideIcon {
  return ICONS[type ?? "other"] ?? Calendar;
}

export function EventTypeBadge({
  type,
  className,
  size = "sm",
}: {
  type: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = getEventTypeIcon(type);
  const dim = size === "md" ? "h-7 w-7" : "h-6 w-6";
  const ic = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg shrink-0",
        COLORS[type ?? "other"] ?? COLORS.other,
        dim,
        className,
      )}
      aria-hidden
    >
      <Icon className={ic} />
    </span>
  );
}
