import { useTranslation } from "react-i18next";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudOff,
  CalendarClock,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import type { EventWeatherResult, WeatherKind } from "@/lib/weather/types";
import { cn } from "@/lib/utils";

/**
 * Pastille météo de la carte de liste.
 *
 * Trois caractères et une icône : c'est tout ce que la largeur autorise. Le
 * détail — bande horaire, ressenti, vent — appartient à la page de l'événement.
 *
 * Le ton est bleu froid, délibérément à l'écart de l'émeraude (présence) et de
 * l'ambre (attente) : la météo n'est ni un statut de réponse ni un résultat.
 * Seule une alerte bascule sur l'ambre, parce qu'elle appelle une décision.
 */

const KIND_ICON: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

export function EventWeatherBadge({
  result,
  dateLocale,
  className,
}: {
  result: EventWeatherResult | null | undefined;
  dateLocale?: Locale;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!result) return null;

  // Pas de prévision : on dit pourquoi. « Météo dès le 4 mars » et « météo
  // indisponible » n'appellent pas la même réaction, les confondre serait
  // laisser croire à une panne à chaque événement un peu lointain.
  if (!result.ok) {
    const label =
      result.reason === "beyond_horizon" && result.availableFrom
        ? t("weather.availableFrom", {
            date: format(new Date(result.availableFrom), "d MMM", { locale: dateLocale }),
          })
        : result.reason === "beyond_horizon"
          ? t("weather.tooFar")
          : result.reason === "no_location"
            ? t("weather.noLocation")
            : t("weather.unavailable");
    const Glyph = result.reason === "beyond_horizon" ? CalendarClock : CloudOff;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground",
          className,
        )}
      >
        <Glyph className="h-3 w-3 shrink-0" aria-hidden />
        {label}
      </span>
    );
  }

  const { at, alert } = result.weather;
  // Sur une alerte de vent, l'icône bascule sur le facteur dominant plutôt que
  // sur l'état du ciel — c'est le vent qui décide de la tenue, pas les nuages.
  const Icon = alert === "wind" ? Wind : KIND_ICON[at.kind];

  const detail =
    alert === "rain"
      ? t("weather.precipitationShort", { value: at.precipitation })
      : alert === "wind"
        ? t("weather.windShort", { value: at.windSpeed })
        : null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        alert === "rain" || alert === "heat"
          ? "border-amber-500/32 bg-amber-500/16 text-amber-700 dark:text-amber-300"
          : alert === "wind" || alert === "cold"
            ? "border-sky-500/34 bg-sky-500/16 text-sky-700 dark:text-sky-300"
            : "border-sky-500/22 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        className,
      )}
      title={alert ? t(`weather.alerts.${alert}`) : t("weather.label")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-bold">{t("weather.temperature", { value: at.temperature })}</span>
      {detail && (
        <>
          <span className="opacity-45" aria-hidden>
            ·
          </span>
          <span>{detail}</span>
        </>
      )}
    </span>
  );
}
