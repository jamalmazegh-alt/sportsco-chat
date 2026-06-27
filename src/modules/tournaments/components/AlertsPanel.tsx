import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, UserX, Trophy, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CockpitAlert } from "../lib/control-center";

interface Props {
  alerts: CockpitAlert[];
  onAlertClick?: (a: CockpitAlert) => void;
}

const ICONS = {
  late_match: Clock,
  missing_referee: UserX,
  finals_not_generated: Trophy,
} as const;

const SEV_STYLES: Record<
  CockpitAlert["severity"],
  { border: string; bg: string; iconBg: string; iconColor: string; text: string; dot: string }
> = {
  high: {
    border: "border-rose-300/70 dark:border-rose-900/60",
    bg: "bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-slate-900",
    iconBg: "bg-rose-500",
    iconColor: "text-white",
    text: "text-rose-950 dark:text-rose-100",
    dot: "bg-rose-500",
  },
  medium: {
    border: "border-amber-300/70 dark:border-amber-900/60",
    bg: "bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900",
    iconBg: "bg-amber-500",
    iconColor: "text-white",
    text: "text-amber-950 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  low: {
    border: "border-border dark:border-slate-800",
    bg: "bg-card dark:bg-slate-900",
    iconBg: "bg-muted dark:bg-slate-800",
    iconColor: "text-muted-foreground dark:text-slate-300",
    text: "text-foreground dark:text-slate-100",
    dot: "bg-slate-400",
  },
};

export function AlertsPanel({ alerts, onAlertClick }: Props) {
  const { t } = useTranslation("tournaments");
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label={t("cockpit.alerts.heading", { defaultValue: "Alertes" })}
      className="space-y-2.5"
    >
      <header className="flex items-center gap-2 px-1">
        <div className="relative flex h-5 w-5 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/40" />
          <AlertTriangle className="relative h-4 w-4 text-amber-600" strokeWidth={2.5} />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-slate-300">
          {t("cockpit.alerts.title", {
            defaultValue: "{{count}} chose à régler",
            defaultValue_plural: "{{count}} choses à régler",
            count: alerts.length,
          })}
        </h3>
      </header>
      <ul className="space-y-2">
        {alerts.map((a) => {
          const Icon = ICONS[a.kind];
          const styles = SEV_STYLES[a.severity];
          const interactive = !!onAlertClick;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={interactive ? () => onAlertClick!(a) : undefined}
                disabled={!interactive}
                className={cn(
                  "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border-[1.5px] px-3 py-3 text-left transition-all",
                  styles.border,
                  styles.bg,
                  interactive && "hover:-translate-y-0.5 hover:shadow-md",
                )}
              >
                <span aria-hidden className={cn("absolute left-0 top-0 h-full w-1", styles.dot)} />
                <div
                  className={cn(
                    "ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    styles.iconBg,
                  )}
                >
                  <Icon className={cn("h-4 w-4", styles.iconColor)} strokeWidth={2.5} />
                </div>
                <div className={cn("flex-1 min-w-0 text-sm font-semibold", styles.text)}>
                  {alertLabel(a, t)}
                </div>
                {interactive && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function alertLabel(
  a: CockpitAlert,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  switch (a.kind) {
    case "late_match":
      return t("cockpit.alerts.lateMatch", {
        defaultValue: "Match en retard de {{minutes}} min",
        minutes: a.minutes ?? 0,
      });
    case "missing_referee":
      return t("cockpit.alerts.missingReferee", {
        defaultValue: "Arbitre manquant (démarrage dans {{minutes}} min)",
        minutes: a.minutes ?? 0,
      });
    case "finals_not_generated":
      return t("cockpit.alerts.finalsNotGenerated", {
        defaultValue: "Phase finale non générée — les poules sont terminées",
      });
  }
}
