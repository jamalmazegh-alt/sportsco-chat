/**
 * FFF-style age category helpers.
 *
 * Règle FFF (et adoptée par la plupart des fédérations FR) :
 *   category = "U" + (endYear - birthYear)
 *
 * où `endYear` est l'année de fin de la saison sportive (saison "2024-2025"
 * ⇒ endYear = 2025). Les adultes (>= 20) sont regroupés en "Senior".
 *
 * Ces helpers sont **purs** — pas d'accès DB, pas d'effet de bord — pour
 * pouvoir être testés unitairement et réutilisés côté client comme côté
 * serveur (import + action de recomputation).
 */

/** Formats supportés :
 *   - "2024-2025", "2024/2025", "2024 2025"
 *   - "2025" (année de fin seule)
 *   - "24-25" (2 chiffres ⇒ 20xx)
 * Renvoie l'année de fin, ou null si non parsable / incohérente.
 */
export function parseSeasonEndYear(label: string | null | undefined): number | null {
  if (!label) return null;
  const trimmed = String(label).trim();
  if (!trimmed) return null;

  const twoYears = trimmed.match(/(\d{2,4})\s*[-/ ]\s*(\d{2,4})/);
  if (twoYears) {
    const b = normalizeYear(twoYears[2]);
    if (b != null) return b;
  }

  const single = trimmed.match(/^\d{4}$/);
  if (single) return parseInt(single[0], 10);

  return null;
}

function normalizeYear(v: string): number | null {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  if (v.length === 2) return 2000 + n;
  if (v.length === 4 && n >= 1900 && n <= 2100) return n;
  return null;
}

/**
 * Renvoie la catégorie FFF pour une date de naissance ISO (`YYYY-MM-DD`) et
 * une année de fin de saison. Retourne :
 *   - "U6" ... "U19"
 *   - "Senior"   quand endYear - birthYear >= 20
 *   - null       si la date est invalide ou si le joueur est trop jeune (< 4)
 */
export function computeFffCategory(
  birthDate: string | Date | null | undefined,
  seasonEndYear: number,
): string | null {
  if (birthDate == null) return null;
  let birthYear: number;
  if (birthDate instanceof Date) {
    if (Number.isNaN(birthDate.getTime())) return null;
    birthYear = birthDate.getUTCFullYear();
  } else {
    const m = String(birthDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    birthYear = parseInt(m[1], 10);
  }
  if (!Number.isFinite(birthYear) || !Number.isFinite(seasonEndYear)) return null;
  const diff = seasonEndYear - birthYear;
  if (diff < 4) return null;
  if (diff >= 20) return "Senior";
  return `U${diff}`;
}

/** Fabrique un label de saison à partir de son année de fin. */
export function seasonLabelFromEndYear(endYear: number): string {
  return `${endYear - 1}-${endYear}`;
}
