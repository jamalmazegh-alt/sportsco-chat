import { weatherKindFromCode } from "./rules";
import type { WeatherHour } from "./types";

/**
 * Adaptateur Open-Meteo.
 *
 * C'est le seul fichier qui connaît le fournisseur : le reste de la
 * fonctionnalité travaille sur `WeatherHour[]`. En changer revient à réécrire
 * `fetchOpenMeteoHourly` et `mapOpenMeteoHourly`.
 *
 * Les prévisions sont demandées en UTC (`timezone=UTC`) plutôt qu'en heure
 * locale : les horodatages du fournisseur s'alignent alors directement sur les
 * `timestamptz` de la base, sans passer par un fuseau à deviner.
 */

export const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "wind_speed_10m",
  "weather_code",
] as const;

/** Forme documentée de la réponse. Tous les tableaux sont parallèles à `time`. */
export interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    precipitation_probability?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

export function buildOpenMeteoUrl(
  latitude: number,
  longitude: number,
  opts: { forecastDays?: number; apiKey?: string | null } = {},
): string {
  const base = opts.apiKey
    ? OPEN_METEO_ENDPOINT.replace("api.open-meteo.com", "customer-api.open-meteo.com")
    : OPEN_METEO_ENDPOINT;
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: HOURLY_FIELDS.join(","),
    timezone: "UTC",
    windspeed_unit: "kmh",
    forecast_days: String(opts.forecastDays ?? 11),
  });
  if (opts.apiKey) params.set("apikey", opts.apiKey);
  return `${base}?${params.toString()}`;
}

/**
 * Convertit la réponse en créneaux horaires.
 *
 * Un créneau dont la température ou l'horodatage manque est ignoré plutôt
 * qu'affiché à zéro : mieux vaut une fenêtre plus courte qu'un 0 °C inventé.
 * Les champs secondaires (ressenti, précipitations, vent) retombent sur une
 * valeur neutre, qui ne déclenche jamais d'alerte à elle seule.
 */
export function mapOpenMeteoHourly(payload: OpenMeteoResponse): WeatherHour[] {
  const h = payload?.hourly;
  const times = h?.time;
  if (!Array.isArray(times) || times.length === 0) return [];

  const out: WeatherHour[] = [];
  for (let i = 0; i < times.length; i++) {
    const rawTime = times[i];
    const temperature = h?.temperature_2m?.[i];
    if (typeof rawTime !== "string" || typeof temperature !== "number") continue;

    const time = normalizeUtcTime(rawTime);
    if (!time) continue;

    const feels = h?.apparent_temperature?.[i];
    const precipitation = h?.precipitation_probability?.[i];
    const wind = h?.wind_speed_10m?.[i];
    const code = h?.weather_code?.[i];

    out.push({
      time,
      temperature: Math.round(temperature),
      feelsLike: Math.round(typeof feels === "number" ? feels : temperature),
      precipitation: typeof precipitation === "number" ? Math.round(precipitation) : 0,
      windSpeed: typeof wind === "number" ? Math.round(wind) : 0,
      kind: weatherKindFromCode(typeof code === "number" ? code : 3),
    });
  }
  return out;
}

/**
 * Open-Meteo renvoie `2026-03-14T15:00` sans fuseau, en UTC puisque c'est ce
 * qu'on a demandé. `new Date()` interpréterait cette forme comme une heure
 * locale, d'où le `Z` ajouté explicitement.
 */
function normalizeUtcTime(raw: string): string | null {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const iso = hasZone ? raw : `${raw}:00Z`.replace(/(:\d{2}):\d{2}Z$/, "$1:00Z");
  const d = new Date(hasZone ? raw : iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Appel réseau. Isolé pour que tout le reste reste testable sans HTTP.
 *
 * Non vérifié contre l'API réelle depuis cet environnement : la politique
 * d'egress y bloque `api.open-meteo.com`. Le contrat suivi est celui de la
 * documentation v1 ; à confronter à une vraie réponse au premier déploiement.
 */
export async function fetchOpenMeteoHourly(
  latitude: number,
  longitude: number,
  opts: { forecastDays?: number; apiKey?: string | null; signal?: AbortSignal } = {},
): Promise<{ hours: WeatherHour[]; payload: OpenMeteoResponse }> {
  const url = buildOpenMeteoUrl(latitude, longitude, opts);
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`Open-Meteo responded ${res.status}`);
  }
  const payload = (await res.json()) as OpenMeteoResponse;
  return { hours: mapOpenMeteoHourly(payload), payload };
}
