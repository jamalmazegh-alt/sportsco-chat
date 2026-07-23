/**
 * Règles de visibilité des profils publics joueurs (`/p/$slug`).
 *
 * Source unique pour le masquage mineur / consentement parental —
 * importée par la route et par les unit tests (pas de copie locale).
 */

export type PublicProfilePlayerVisibility = {
  birth_date: string | null;
  parental_public_consent: boolean | null;
  last_name: string;
};

export function isMinorWithoutConsent(p: PublicProfilePlayerVisibility): boolean {
  if (!p.birth_date) return false;
  const ageMs = Date.now() - new Date(p.birth_date).getTime();
  const age = ageMs / (365.25 * 24 * 3600 * 1000);
  return age < 18 && p.parental_public_consent !== true;
}

export function displayLastName(p: PublicProfilePlayerVisibility): string {
  if (isMinorWithoutConsent(p) && p.last_name) {
    return `${p.last_name.charAt(0).toUpperCase()}.`;
  }
  return p.last_name;
}
