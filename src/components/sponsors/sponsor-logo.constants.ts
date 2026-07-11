// Enveloppe de dimensionnement du logo dans le bandeau sponsor. NE PAS repasser à 40 :
// le rendu réel passe par SponsorLogo qui détoure + dimensionne par masse visuelle.
export const SPONSOR_LOGO_MAX_HEIGHT = 96;
export const SPONSOR_LOGO_MAX_WIDTH = 420;

// Multiplicateur admin appliqué PAR-DESSUS l'auto-dimensionnement, borné volontairement
// serré : SponsorLogo ayant déjà un ajustement interne jusqu'à 1.5, on évite qu'un logo
// dense monopolise la bannière.
export const SPONSOR_LOGO_MIN_SCALE = 0.75;
export const SPONSOR_LOGO_MAX_SCALE = 2.0;
export const SPONSOR_LOGO_DEFAULT_SCALE = 1;

/** Borne + normalise défensivement un logo_scale (fallback = défaut). */
export function clampSponsorLogoScale(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return SPONSOR_LOGO_DEFAULT_SCALE;
  return Math.min(SPONSOR_LOGO_MAX_SCALE, Math.max(SPONSOR_LOGO_MIN_SCALE, n));
}
