/**
 * Géocodage d'adresse pour les lieux de club.
 *
 * Deux fournisseurs, tous deux gratuits et sans clé :
 *
 * - la Base Adresse Nationale (`api-adresse.data.gouv.fr`), service public
 *   français en licence ouverte, de loin le plus précis sur une adresse de
 *   stade en France — le cas majoritaire ;
 * - Nominatim (OpenStreetMap) en repli pour le reste du monde.
 *
 * Un lieu est enregistré une fois puis ne bouge plus : le volume se compte en
 * quelques appels par club et par an, ce qui tient dans la politique d'usage
 * de Nominatim comme dans celle de la BAN.
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Libellé normalisé renvoyé par le fournisseur, utile au diagnostic. */
  label: string | null;
  provider: "ban" | "nominatim";
}

export interface AddressParts {
  address: string;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/** Pays traités par la BAN. `null`/vide vaut France : la locale par défaut. */
const FRENCH_COUNTRIES = new Set(["", "fr", "france"]);

export function usesFrenchAddressBase(country: string | null | undefined): boolean {
  return FRENCH_COUNTRIES.has((country ?? "").trim().toLowerCase());
}

/** Requête en une ligne : « adresse, code postal ville ». */
export function formatQuery(parts: AddressParts): string {
  const tail = [parts.postalCode, parts.city].map((s) => (s ?? "").trim()).filter(Boolean);
  return [parts.address.trim(), ...tail, (parts.country ?? "").trim()]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBanUrl(query: string): string {
  const params = new URLSearchParams({ q: query, limit: "1", autocomplete: "0" });
  return `https://api-adresse.data.gouv.fr/search/?${params.toString()}`;
}

export function buildNominatimUrl(query: string): string {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1" });
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

export interface BanResponse {
  features?: Array<{
    geometry?: { coordinates?: unknown };
    properties?: { label?: unknown; score?: unknown };
  }>;
}

/**
 * La BAN renvoie du GeoJSON : `coordinates` est `[longitude, latitude]`, dans
 * cet ordre — l'inverse de la convention usuelle, d'où l'indexation explicite.
 *
 * Un score inférieur à 0,4 signale une correspondance très approximative
 * (souvent la commune seule) : on préfère ne rien renvoyer plutôt que de poser
 * un marqueur au centre du village.
 */
export function mapBanResponse(payload: BanResponse): GeocodeResult | null {
  const feature = payload?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [longitude, latitude] = coords;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  const score = feature?.properties?.score;
  if (typeof score === "number" && score < 0.4) return null;
  const label = feature?.properties?.label;
  return {
    latitude,
    longitude,
    label: typeof label === "string" ? label : null,
    provider: "ban",
  };
}

export type NominatimResponse = Array<{
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
}>;

/** Nominatim renvoie les coordonnées en chaînes de caractères. */
export function mapNominatimResponse(payload: NominatimResponse): GeocodeResult | null {
  const first = Array.isArray(payload) ? payload[0] : undefined;
  if (!first) return null;
  const latitude = Number.parseFloat(String(first.lat));
  const longitude = Number.parseFloat(String(first.lon));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    label: typeof first.display_name === "string" ? first.display_name : null,
    provider: "nominatim",
  };
}
