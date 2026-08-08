import type {
  EventWeather,
  WeatherAlert,
  WeatherHour,
  WeatherKind,
  WeatherUnavailableReason,
} from "./types";

/**
 * Règles d'affichage de la météo — pures, sans I/O, donc testables telles quelles.
 *
 * Le principe directeur est le silence : la météo ne s'affiche que lorsqu'elle a
 * quelque chose à dire. Un bloc vide ou un « — » sur chaque carte coûterait plus
 * en encombrement qu'il ne rapporte en information.
 */

/** Aucun fournisseur ne donne de prévision fiable au-delà de dix jours. */
export const FORECAST_HORIZON_DAYS = 10;

/** Durée de vie d'une entrée de cache. Au-delà, on redemande au fournisseur. */
export const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** Seuils de bascule en alerte. */
export const ALERT_THRESHOLDS = {
  /** Probabilité de précipitations, en %. */
  precipitation: 60,
  /** Vitesse du vent, en km/h. */
  wind: 40,
  /** Température ressentie basse, en °C. */
  cold: 3,
  /** Température ressentie haute, en °C. */
  heat: 33,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Clé de cache. Les coordonnées sont arrondies à 2 décimales (~1,1 km) pour que
 * deux terrains d'un même complexe partagent une entrée au lieu d'en créer deux.
 */
export function weatherCacheKey(latitude: number, longitude: number, day: Date): string {
  const lat = latitude.toFixed(2);
  const lng = longitude.toFixed(2);
  return `${lat}:${lng}:${isoDay(day)}`;
}

/** Jour civil UTC au format `YYYY-MM-DD`. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Une entrée de cache plus ancienne que le TTL doit être rafraîchie. */
export function isCacheFresh(fetchedAt: Date, now: Date): boolean {
  const age = now.getTime() - fetchedAt.getTime();
  return age >= 0 && age < CACHE_TTL_MS;
}

export interface WeatherEligibility {
  status: string;
  startsAt: Date;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/**
 * Faut-il seulement demander une prévision ? Quatre cas disent non :
 * événement annulé, événement passé, au-delà de l'horizon, lieu sans coordonnées.
 */
export function shouldFetchWeather(event: WeatherEligibility, now: Date): boolean {
  return weatherAvailability(event, now) === null;
}

/**
 * Pourquoi la prévision manque, ou `null` si elle est demandable.
 *
 * Sur un événement annulé ou passé la question ne se pose pas : on renvoie
 * `"silent"`, qui n'affiche aucun message — dire « météo indisponible » sur un
 * match joué la semaine dernière serait du bruit, pas de l'information.
 */
export function weatherAvailability(
  event: WeatherEligibility,
  now: Date,
): WeatherUnavailableReason | "silent" | null {
  const days = daysUntil(event.startsAt, now);
  if (event.status === "cancelled" || days < 0) return "silent";
  if (!isValidCoordinate(event.latitude, event.longitude)) return "no_location";
  if (days > FORECAST_HORIZON_DAYS) return "beyond_horizon";
  return null;
}

/**
 * Premier jour où la prévision existera : l'événement moins l'horizon. C'est ce
 * que le message « météo dès le … » annonce, plutôt qu'un décompte à recalculer.
 */
export function forecastAvailableFrom(startsAt: Date): Date {
  return new Date(startsAt.getTime() - FORECAST_HORIZON_DAYS * MS_PER_DAY);
}

/**
 * Nombre de jours civils entre aujourd'hui et l'événement. Négatif si passé.
 * On compare des jours, pas des instants : un match à 15:00 reste « aujourd'hui »
 * à 18:00, et sa prévision garde un sens tant que la journée n'est pas finie.
 */
export function daysUntil(startsAt: Date, now: Date): number {
  const a = Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * Rejette les coordonnées absentes, hors bornes, ou l'île null (0, 0) — au large
 * du golfe de Guinée, où aucun club ne joue et où une valeur par défaut atterrit.
 */
export function isValidCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/** Motif d'alerte pour un créneau, ou `null`. La pluie prime, puis le vent. */
export function pickAlert(hour: WeatherHour): WeatherAlert | null {
  if (hour.precipitation >= ALERT_THRESHOLDS.precipitation) return "rain";
  if (hour.windSpeed >= ALERT_THRESHOLDS.wind) return "wind";
  if (hour.feelsLike <= ALERT_THRESHOLDS.cold) return "cold";
  if (hour.feelsLike >= ALERT_THRESHOLDS.heat) return "heat";
  return null;
}

/** Début de l'heure contenant `date`, en UTC. */
export function floorToHour(date: Date): number {
  return Math.floor(date.getTime() / 3_600_000) * 3_600_000;
}

/**
 * Assemble le modèle de vue à partir des créneaux horaires du fournisseur.
 *
 * La fenêtre va du rendez-vous (ou du coup d'envoi à défaut) à la fin estimée,
 * bornée à `maxHours` créneaux : une prévision sur 24 h ne dit rien d'utile quand
 * un match dure 105 minutes. Renvoie `null` si le fournisseur ne couvre pas
 * l'heure du coup d'envoi.
 */
export function buildEventWeather(
  hours: WeatherHour[],
  opts: {
    startsAt: Date;
    endsAt?: Date | null;
    convocationAt?: Date | null;
    fetchedAt: Date;
    maxHours?: number;
  },
): EventWeather | null {
  const maxHours = opts.maxHours ?? 5;
  const byTime = new Map(hours.map((h) => [new Date(h.time).getTime(), h]));

  const kickoff = floorToHour(opts.startsAt);
  const at = byTime.get(kickoff);
  if (!at) return null;

  const from = Math.min(floorToHour(opts.convocationAt ?? opts.startsAt), kickoff);
  // Une fin antérieure au coup d'envoi ne borne rien de cohérent : on l'ignore.
  const knownEnd = opts.endsAt ? Math.max(floorToHour(opts.endsAt), kickoff) : null;
  const to = knownEnd ?? kickoff;

  const window = hours
    .filter((h) => {
      const t = new Date(h.time).getTime();
      return t >= from && t <= to;
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Sans heure de fin, la fenêtre s'arrête au coup d'envoi et ne dirait rien de
  // la suite : on la prolonge vers l'avant. Quand la fin est connue, on ne
  // prolonge pas — la bande couvre l'événement, pas la fin d'après-midi.
  if (knownEnd === null && window.length < maxHours) {
    const seen = new Set(window.map((h) => h.time));
    for (const h of hours) {
      if (window.length >= maxHours) break;
      const t = new Date(h.time).getTime();
      if (t > to && !seen.has(h.time)) {
        window.push(h);
        seen.add(h.time);
      }
    }
    window.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  const trimmed = trimAroundKey(window, kickoff, maxHours);
  const keyIndex = trimmed.findIndex((h) => new Date(h.time).getTime() === kickoff);

  return {
    at,
    hours: trimmed,
    keyIndex: keyIndex >= 0 ? keyIndex : 0,
    alert: pickAlert(at),
    fetchedAt: opts.fetchedAt.toISOString(),
  };
}

/** Réduit la fenêtre à `max` créneaux en gardant le coup d'envoi dedans. */
function trimAroundKey(window: WeatherHour[], keyTime: number, max: number): WeatherHour[] {
  if (window.length <= max) return window;
  const idx = window.findIndex((h) => new Date(h.time).getTime() === keyTime);
  if (idx < 0) return window.slice(0, max);
  // On privilégie ce qui suit le coup d'envoi : c'est la durée du match.
  const before = Math.min(idx, 1);
  const start = Math.min(idx - before, window.length - max);
  return window.slice(Math.max(0, start), Math.max(0, start) + max);
}

/**
 * Code WMO → famille de conditions.
 * Table publiée par l'OMM, reprise telle quelle par Open-Meteo.
 */
export function weatherKindFromCode(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}

export interface VenueCandidate {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface CoordinateSource {
  venueId: string | null;
  /** Texte libre saisi sur l'événement. */
  location: string | null;
  /** `false` = extérieur. `null`/`true` = chez nous. */
  isHome: boolean | null;
}

export interface ResolvedCoordinates {
  latitude: number;
  longitude: number;
  /** Comment on y est arrivé — utile au diagnostic. */
  via: "venue_id" | "location_match" | "default_venue";
}

/** Minuscules, sans accents ni ponctuation : « Stade des Lilas » ≈ « stade des lilas ». */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Coordonnées d'un événement, par ordre de fiabilité décroissante.
 *
 * Le rattachement explicite à un lieu ne suffit pas : dans l'assistant de
 * création, saisir une adresse dans le champ libre efface `venue_id`. Un
 * événement au stade du club peut donc n'avoir qu'un texte. On rattrape par le
 * nom, puis — pour un événement à domicile — par le lieu par défaut du club.
 */
export function resolveEventCoordinates(
  event: CoordinateSource,
  venues: VenueCandidate[],
): ResolvedCoordinates | null {
  const usable = venues.filter((v) => isValidCoordinate(v.latitude, v.longitude));
  if (usable.length === 0) return null;

  const byId = event.venueId ? usable.find((v) => v.id === event.venueId) : undefined;
  if (byId) return { latitude: byId.latitude!, longitude: byId.longitude!, via: "venue_id" };

  const text = normalize(event.location ?? "");
  if (text.length >= 3) {
    // Le plus long nom qui correspond gagne : « Stade des Lilas » l'emporte sur
    // « Stade », qui matcherait aussi mais désignerait un autre terrain.
    const matches = usable
      .filter((v) => {
        const name = normalize(v.name);
        if (name.length >= 3 && (text.includes(name) || name.includes(text))) return true;
        const address = normalize(v.address ?? "");
        return address.length >= 6 && text.includes(address);
      })
      .sort((a, b) => normalize(b.name).length - normalize(a.name).length);
    const best = matches[0];
    if (best) {
      return { latitude: best.latitude!, longitude: best.longitude!, via: "location_match" };
    }
  }

  // À domicile sans rattachement : le lieu par défaut du club est le pari le
  // plus sûr. À l'extérieur, deviner serait pire que ne rien afficher.
  if (event.isHome !== false) {
    const fallback = usable.find((v) => v.isDefault);
    if (fallback) {
      return { latitude: fallback.latitude!, longitude: fallback.longitude!, via: "default_venue" };
    }
  }
  return null;
}
