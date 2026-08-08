import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { EventWeatherResult, WeatherKind } from "@/lib/weather/types";
import { cn } from "@/lib/utils";

/**
 * Bloc météo de la page de détail.
 *
 * Là où la carte de liste tient en trois caractères, la page a la place de
 * répondre à la vraie question : va-t-il pleuvoir *pendant* le match, pas
 * seulement ce jour-là. D'où la bande horaire, qui couvre l'événement du
 * rendez-vous à la fin estimée et met en relief le créneau du coup d'envoi —
 * le seul dont on se souvienne.
 *
 * Les barres portent une probabilité, donc une magnitude : une seule teinte,
 * ancrée sur une ligne de base commune, et le pourcentage écrit dessous. La
 * couleur ne porte jamais l'information seule.
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

export function EventWeatherPanel({
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

  if (!result.ok) {
    const label =
      result.reason === "beyond_horizon" && result.availableFrom
        ? t("weather.availableFrom", {
            date: format(new Date(result.availableFrom), "d MMMM", { locale: dateLocale }),
          })
        : result.reason === "beyond_horizon"
          ? t("weather.tooFar")
          : result.reason === "no_location"
            ? t("weather.noLocation")
            : t("weather.unavailable");
    const Glyph = result.reason === "beyond_horizon" ? CalendarClock : CloudOff;
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-t border-border/60 bg-sky-500/4 px-3.5 py-3 text-xs text-muted-foreground",
          className,
        )}
      >
        <Glyph className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        {label}
      </div>
    );
  }

  const { at, hours, keyIndex, alert, fetchedAt } = result.weather;
  const Icon = KIND_ICON[at.kind];
  const keyTime = hours[keyIndex]?.time;
  const maxPrecipitation = Math.max(10, ...hours.map((h) => h.precipitation));

  return (
    <div className={cn("border-t border-border/60 bg-sky-500/4 px-3.5 py-3", className)}>
      {/* Conditions au coup d'envoi */}
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
        <span className="font-display text-[27px] font-bold leading-none tabular-nums">
          {t("weather.temperature", { value: at.temperature })}
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold leading-tight">
            {t(`weather.conditions.${at.kind}`)}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {t("weather.feelsLike", { value: at.feelsLike })}
            <span className="opacity-45"> · </span>
            {t("weather.windValue", { value: at.windSpeed })}
          </p>
        </div>
      </div>

      {/* Bande horaire — couvre l'événement, pas la journée */}
      <div
        className="mt-3 grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
      >
        {hours.map((h) => {
          const isKey = h.time === keyTime;
          const HourIcon = KIND_ICON[h.kind];
          return (
            <div
              key={h.time}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-0.5 py-1.5",
                isKey && "bg-sky-500/14",
              )}
            >
              <span
                className={cn(
                  "text-[9.5px] font-bold tabular-nums",
                  isKey ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground",
                )}
              >
                {format(new Date(h.time), "HH:mm")}
              </span>
              <HourIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
              <span className="font-display text-[12.5px] font-bold leading-none tabular-nums">
                {t("weather.temperature", { value: h.temperature })}
              </span>
              {/* Barre de probabilité : hauteur proportionnelle, base commune. */}
              <span className="flex h-6 w-3 items-end overflow-hidden rounded-[3px] bg-muted">
                <span
                  className="block w-full rounded-t-[4px] rounded-b-[2px] bg-sky-500"
                  style={{
                    height: `${Math.max(4, Math.round((h.precipitation / maxPrecipitation) * 100))}%`,
                  }}
                />
              </span>
              <span className="text-[9.5px] font-semibold tabular-nums text-muted-foreground">
                {t("weather.precipitationShort", { value: h.precipitation })}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.07em] text-sky-700 dark:text-sky-300">
        {t("weather.stripCaption")}
      </p>

      {/* L'alerte est une phrase, pas une icône à décoder. */}
      {alert && (
        <div className="mt-2.5 flex items-start gap-2 rounded-[10px] border border-amber-500/32 bg-amber-500/14 px-2.5 py-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <p className="text-[11.5px] font-semibold leading-snug">
            {t(`weather.alertText.${alert}`, {
              value:
                alert === "rain"
                  ? at.precipitation
                  : alert === "wind"
                    ? at.windSpeed
                    : at.feelsLike,
              time: format(new Date(at.time), "HH:mm"),
            })}
          </p>
        </div>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        {t("weather.updated", {
          ago: formatDistanceToNow(new Date(fetchedAt), { locale: dateLocale }),
        })}
      </p>
    </div>
  );
}
