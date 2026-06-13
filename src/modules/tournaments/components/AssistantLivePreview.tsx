import { useTranslation } from "react-i18next";
import {
  Award,
  Clock,
  MapPin,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildRecommendation,
  buildSchedulePreview,
  type AssistantTournamentConfig,
} from "../lib/assistant-config";

interface Props {
  config: AssistantTournamentConfig;
  answeredCount: number;
  className?: string;
}

export function AssistantLivePreview({ config, answeredCount, className }: Props) {
  const { t } = useTranslation("tournaments");

  if (answeredCount === 0) return null;

  const reco = buildRecommendation(config);
  const schedule = buildSchedulePreview(config);

  const formatLabel =
    config.scheduleFormat === "pools_finals"
      ? t("aiAssistant.formats.poolsFinals")
      : config.scheduleFormat === "round_robin"
        ? t("aiAssistant.formats.roundRobin")
        : t("aiAssistant.formats.singleElim");

  const flightsOn =
    config.scheduleFormat === "pools_finals" && config.eliminatedContinue;

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
        <Sparkles className="h-3 w-3" />
        {t("aiAssistant.livePreview.title")}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <PreviewChip
          icon={<Trophy className="h-3 w-3" />}
          label={t("aiAssistant.livePreview.sport")}
          value={t(`teams.sports.${config.sport}`, { defaultValue: config.sport })}
        />
        <PreviewChip
          icon={<Users className="h-3 w-3" />}
          label={t("aiAssistant.livePreview.teams")}
          value={String(config.numTeams)}
        />
        <PreviewChip
          icon={<Users className="h-3 w-3" />}
          label={t("aiAssistant.livePreview.playersPerTeam")}
          value={String(config.playersPerTeam)}
        />
        <PreviewChip
          icon={<Trophy className="h-3 w-3" />}
          label={t("aiAssistant.livePreview.format")}
          value={formatLabel}
        />
        {config.scheduleFormat === "pools_finals" && (
          <PreviewChip
            icon={<Award className="h-3 w-3" />}
            label={t("aiAssistant.livePreview.eliminated")}
            value={
              config.eliminatedContinue
                ? t("aiAssistant.opts.eliminatedYesShort")
                : t("aiAssistant.opts.eliminatedNoShort")
            }
          />
        )}
        <PreviewChip
          icon={<Clock className="h-3 w-3" />}
          label={t("aiAssistant.livePreview.duration")}
          value={t("aiAssistant.livePreview.durationValue", {
            min: config.matchDurationMin,
          })}
        />
        <PreviewChip
          icon={<MapPin className="h-3 w-3" />}
          label={t("aiAssistant.livePreview.terrains")}
          value={String(config.terrains)}
        />
        {config.name.trim() && (
          <PreviewChip
            icon={<Trophy className="h-3 w-3" />}
            label={t("aiAssistant.livePreview.name")}
            value={config.name.trim()}
            className="col-span-2"
          />
        )}
      </div>

      {config.scheduleFormat === "pools_finals" && (
        <p className="text-[11px] text-muted-foreground border-t border-border/60 pt-2">
          {t("aiAssistant.livePreview.scheduleBreakdown", {
            pools: reco.pools,
            perPool: reco.perPool,
            poolMatches: schedule.poolMatches,
            finalMatches: schedule.finalMatches,
            total: schedule.total,
            end: schedule.endHHMM,
          })}
        </p>
      )}

      {flightsOn && (
        <div className="flex flex-wrap gap-1">
          {config.flightsTemplate === "champions" ? (
            <>
              <Flag tone="champions">🏆 Champions</Flag>
              <Flag tone="europa">🥈 Europa</Flag>
              <Flag tone="conference">🥉 Conference</Flag>
            </>
          ) : (
            <Flag tone="conference">{t("aiAssistant.opts.flightsSimple")}</Flag>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewChip({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="font-semibold truncate mt-0.5">{value}</p>
    </div>
  );
}

function Flag({
  tone,
  children,
}: {
  tone: "champions" | "europa" | "conference";
  children: React.ReactNode;
}) {
  const cls =
    tone === "champions"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
      : tone === "europa"
        ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold", cls)}>
      {children}
    </span>
  );
}
