/**
 * Fuseau horaire du club.
 *
 * Le rendu serveur (e-mails, push) tourne sur Cloudflare Workers dont le fuseau
 * système est UTC. Sans `timeZone` explicite, les heures affichées sont fausses
 * de 1 h (hiver) ou 2 h (été) pour un club français.
 *
 * Toute mise en forme de date côté serveur DOIT passer par ce module.
 */

export const DEFAULT_CLUB_TZ = "Europe/Paris";

/** Liste proposée dans les paramètres du club. */
export const CLUB_TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Luxembourg",
  "Europe/Zurich",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Africa/Algiers",
  "America/Montreal",
  "America/New_York",
  "UTC",
] as const;

const isValidTz = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Retourne un fuseau IANA valide, avec repli sur Europe/Paris. */
export const resolveClubTz = (tz?: string | null): string => {
  const v = (tz ?? "").trim();
  if (!v) return DEFAULT_CLUB_TZ;
  return isValidTz(v) ? v : DEFAULT_CLUB_TZ;
};

/** Ajoute le `timeZone` du club à des options Intl. */
export const withClubTz = <T extends Intl.DateTimeFormatOptions>(
  options: T,
  tz?: string | null,
): T & { timeZone: string } => ({ ...options, timeZone: resolveClubTz(tz) });

/**
 * Formate une date SEULE (`YYYY-MM-DD`, sans heure) sans jamais décaler le jour.
 * On parse en UTC et on rend en UTC : le jour calendaire saisi est celui affiché,
 * quel que soit le fuseau du serveur ou du club.
 */
export const formatDateOnly = (
  date: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
): string => {
  try {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
      ...options,
      timeZone: "UTC",
    });
  } catch {
    return date;
  }
};
