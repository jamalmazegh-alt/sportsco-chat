import { useTranslation } from "react-i18next";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { EventWeather, WeatherKind } from "@/lib/weather/types";
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
  weather,
  className,
}: {
  weather: EventWeather | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!weather) return null;

  const { at, alert } = weather;
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
