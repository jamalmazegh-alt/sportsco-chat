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

const SEV_STYLES: Record<CockpitAlert["severity"], string> = {
  high: "border-rose-300/60 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200",
  medium: "border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200",
  low: "border-border bg-muted/40 text-foreground",
};

export function AlertsPanel({ alerts, onAlertClick }: Props) {
  const { t } = useTranslation("tournaments");
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label={t("cockpit.alerts.heading", { defaultValue: "Alertes" })}
      className="space-y-2"
    >
      <header className="flex items-center gap-2 px-1">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("cockpit.alerts.title", {
            defaultValue: "{{count}} chose à régler",
            defaultValue_plural: "{{count}} choses à régler",
            count: alerts.length,
          })}
        </h3>
      </header>
      <ul className="space-y-1.5">
        {alerts.map((a) => {
          const Icon = ICONS[a.kind];
          const interactive = !!onAlertClick;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={interactive ? () => onAlertClick!(a) : undefined}
                disabled={!interactive}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
                  SEV_STYLES[a.severity],
                  interactive && "hover:brightness-95 transition",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0 text-sm font-medium">{alertLabel(a, t)}</div>
                {interactive && <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />}
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
