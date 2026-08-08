/** Modèle de vue météo — indépendant du fournisseur. */

/** Familles de conditions, dérivées du code WMO. Pilote l'icône affichée. */
export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

/** Motif d'alerte. `null` = conditions sans particularité. */
export type WeatherAlert = "rain" | "wind" | "cold" | "heat";

export interface WeatherHour {
  /** Début de l'heure, ISO UTC (`2026-03-14T15:00:00.000Z`). */
  time: string;
  /** Température en °C, arrondie. */
  temperature: number;
  /** Ressenti en °C, arrondi. */
  feelsLike: number;
  /** Probabilité de précipitations, 0–100. */
  precipitation: number;
  /** Vent en km/h, arrondi. */
  windSpeed: number;
  kind: WeatherKind;
}

export interface EventWeather {
  /** L'heure du coup d'envoi — ce que porte la pastille de la carte de liste. */
  at: WeatherHour;
  /** Créneaux couvrant l'événement, du rendez-vous à la fin estimée. */
  hours: WeatherHour[];
  /** Index de `hours` correspondant à `at`, pour la mise en relief. */
  keyIndex: number;
  alert: WeatherAlert | null;
  /** Date de récupération de la prévision, ISO UTC. */
  fetchedAt: string;
}

/**
 * Pourquoi il n'y a pas de prévision. Distinguer les cas permet un message
 * utile — « revenez le 4 mars » n'est pas « le service est en panne ».
 */
export type WeatherUnavailableReason =
  /** Au-delà de l'horizon du fournisseur : ce n'est pas une erreur, c'est trop tôt. */
  | "beyond_horizon"
  /** Le lieu de l'événement n'a pas de coordonnées — un lieu sans adresse géocodée. */
  | "no_location"
  /** Appel au fournisseur en échec, ou réponse inexploitable. */
  | "provider_error";

export type EventWeatherResult =
  | { ok: true; weather: EventWeather }
  | {
      ok: false;
      reason: WeatherUnavailableReason;
      /** Jour à partir duquel la prévision existera, ISO — seulement pour `beyond_horizon`. */
      availableFrom?: string;
    };
