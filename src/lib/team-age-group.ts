/**
 * Helpers autour du libellé de catégorie d'une équipe (`teams.age_group`).
 *
 * Sert notamment à décider si l'inscription par QR code doit proposer
 * l'option « J'inscris mon enfant » : pour une catégorie strictement adulte
 * (Senior, Vétérans, Loisir, U20+), cette option n'a aucun sens.
 *
 * Prudence volontaire : U18 / U19 comptent encore des mineurs, on garde donc
 * l'option enfant pour toutes les catégories "U" jusqu'à U19 incluse.
 */

const ADULT_KEYWORDS = [
  "senior",
  "seniors",
  "senio",
  "veteran",
  "veterans",
  "loisir",
  "loisirs",
  "adulte",
  "adultes",
];

function normalize(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** true quand la catégorie ne peut concerner que des majeurs. */
export function isAdultOnlyAgeGroup(ageGroup: string | null | undefined): boolean {
  if (!ageGroup) return false;
  const label = normalize(ageGroup);
  if (!label) return false;

  if (ADULT_KEYWORDS.some((kw) => label.includes(kw))) return true;

  const u = label.match(/\bu\s*(\d{1,2})\b/);
  if (u) {
    const n = parseInt(u[1], 10);
    if (Number.isFinite(n) && n >= 20) return true;
  }

  return false;
}
