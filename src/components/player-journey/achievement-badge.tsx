import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const ACHIEVEMENT_ICONS: Record<string, string> = {
  champion: "🏆", tournament_winner: "🏆",
  runner_up: "🥈", tournament_finalist: "🥈",
  semi_finalist: "🥉", mvp: "⭐", top_scorer: "⚽",
  best_goalkeeper: "🧤", best_defender: "🛡️",
  captain: "©️", matches_100: "🔥", selection: "🎖️",
  special_award: "🏅", other: "🏅",
};

export const ACHIEVEMENT_TYPES = Object.keys(ACHIEVEMENT_ICONS);

export function AchievementBadge({
  type, title, subtitle, dim, className,
}: { type: string; title: string; subtitle?: string | null; dim?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn(
      "rounded-2xl border bg-card p-4 flex flex-col items-center text-center gap-1.5 transition-opacity",
      dim && "opacity-60", className,
    )}>
      <div className="text-3xl leading-none">{ACHIEVEMENT_ICONS[type] ?? "🏅"}</div>
      <div className="text-sm font-semibold leading-tight line-clamp-2">{title}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {subtitle ?? t(`journey.achievement.type.${type}`, { defaultValue: type })}
      </div>
    </div>
  );
}
