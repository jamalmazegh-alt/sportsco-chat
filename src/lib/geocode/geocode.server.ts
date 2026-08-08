import {
  buildBanUrl,
  buildNominatimUrl,
  formatQuery,
  mapBanResponse,
  mapNominatimResponse,
  usesFrenchAddressBase,
  type AddressParts,
  type GeocodeResult,
} from "./providers";
import { isValidCoordinate } from "@/lib/weather/rules";

/**
 * Appel réseau du géocodage. Isolé du mapping, qui reste testable sans HTTP.
 *
 * Non vérifié contre les API réelles depuis l'environnement de développement :
 * la politique d'egress y bloque `api-adresse.data.gouv.fr` comme
 * `nominatim.openstreetmap.org`. Les contrats suivis sont ceux documentés.
 *
 * Toujours au mieux : un échec renvoie `null`. Un lieu sans coordonnées reste
 * un lieu valide — il n'affichera simplement pas de météo.
 */

/** Nominatim exige un agent identifiant l'application appelante. */
const USER_AGENT = "Clubero/1.0 (https://clubero.app)";

const TIMEOUT_MS = 5_000;

export async function geocodeAddress(parts: AddressParts): Promise<GeocodeResult | null> {
  const query = formatQuery(parts);
  if (query.length < 4) return null;

  const french = usesFrenchAddressBase(parts.country);
  const attempts = french
    ? [() => tryBan(query), () => tryNominatim(query)]
    : [() => tryNominatim(query)];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result && isValidCoordinate(result.latitude, result.longitude)) return result;
    } catch (err) {
      console.error("[geocode] lookup failed", err);
    }
  }
  return null;
}

async function tryBan(query: string): Promise<GeocodeResult | null> {
  const res = await fetchWithTimeout(buildBanUrl(query));
  if (!res.ok) return null;
  return mapBanResponse(await res.json());
}

async function tryNominatim(query: string): Promise<GeocodeResult | null> {
  const res = await fetchWithTimeout(buildNominatimUrl(query), {
    "User-Agent": USER_AGENT,
    "Accept-Language": "fr,en",
  });
  if (!res.ok) return null;
  return mapNominatimResponse(await res.json());
}

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
