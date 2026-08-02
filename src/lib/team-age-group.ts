/**
 * Catalogue fixe des catégories d'âge sportives pour `teams.age_group`.
 *
 * Le **nom** d'équipe reste libre (« Senior A », « Senior féminine »).
 * La **catégorie** est obligatoire et choisie dans cette liste — c'est elle
 * qui décide si l'inscription QR propose « J'inscris mon enfant ».
 *
 * Convention plages (ex. U6–U7) : le détail va dans le *nom* d'équipe
 * (« U6-U7 »), la catégorie reste un seul code catalogue (ex. U7).
 *
 * Stratégie legacy :
 * - migration SQL one-shot pour les alias évidents (Sénior, Seniors, …)
 * - `resolveTeamAgeCategory` reste un filet de sécurité QR / lecture seule
 *   (pas une liste ouverte à maintenir pour toujours)
 * - à la sauvegarde UI : on n'accepte que les codes catalogue
 *
 * Aligné FFF / fédérations FR : U6 → U19 (mineurs possibles), puis
 * U20 / U21 / Senior / Vétérans (adultes). Le loisir se met dans le nom.
 */

export type TeamAgeCategory = {
  /** Valeur stockée dans `teams.age_group`. */
  code: string;
  /** true ⇒ pas d'option parent/enfant sur le QR. */
  adultOnly: boolean;
};

const YOUTH_U = Array.from({ length: 14 }, (_, i) => {
  const n = i + 6; // U6 … U19
  return { code: `U${n}`, adultOnly: false as const };
});

const ADULT_EXTRA: readonly TeamAgeCategory[] = [
  { code: "U20", adultOnly: true },
  { code: "U21", adultOnly: true },
  { code: "Senior", adultOnly: true },
  { code: "Vétérans", adultOnly: true },
];

/** Liste officielle affichée dans le select (ordre d'affichage). */
export const TEAM_AGE_CATEGORIES: readonly TeamAgeCategory[] = [...YOUTH_U, ...ADULT_EXTRA];

export const YOUTH_AGE_CATEGORIES = TEAM_AGE_CATEGORIES.filter((c) => !c.adultOnly);
export const ADULT_AGE_CATEGORIES = TEAM_AGE_CATEGORIES.filter((c) => c.adultOnly);

const BY_NORMALIZED = new Map<string, TeamAgeCategory>(
  TEAM_AGE_CATEGORIES.map((c) => [normalize(c.code), c]),
);

function normalize(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Résout une valeur (catalogue ou legacy libre) vers une entrée du catalogue.
 * Accepte les variantes courantes : « U15 Filles », « Seniors », « U 21 ».
 */
export function resolveTeamAgeCategory(
  ageGroup: string | null | undefined,
): TeamAgeCategory | null {
  if (!ageGroup) return null;
  const label = normalize(ageGroup);
  if (!label) return null;

  const exact = BY_NORMALIZED.get(label);
  if (exact) return exact;

  // Pluriels / variantes textuelles adultes (legacy hors catalogue)
  if (/\bveterans?\b/.test(label)) return BY_NORMALIZED.get("veterans") ?? null;
  // « Loisir » / « Senior F » / « Séniors » → Senior (adulte)
  if (/\bloisirs?\b/.test(label) || /\bseniors?\b/.test(label) || label === "senio") {
    return BY_NORMALIZED.get("senior") ?? null;
  }

  const u = label.match(/\bu\s*(\d{1,2})\b/);
  if (u) {
    const code = `U${parseInt(u[1], 10)}`;
    return BY_NORMALIZED.get(normalize(code)) ?? null;
  }

  return null;
}

/** true quand la catégorie ne peut concerner que des majeurs. */
export function isAdultOnlyAgeGroup(ageGroup: string | null | undefined): boolean {
  return resolveTeamAgeCategory(ageGroup)?.adultOnly === true;
}

/** true si la valeur est exactement un code du catalogue. */
export function isCanonicalTeamAgeCategory(ageGroup: string | null | undefined): boolean {
  if (!ageGroup) return false;
  return BY_NORMALIZED.has(normalize(ageGroup));
}

/** true quand la catégorie ne peut concerner que des mineurs (U6 → U19). */
export function isMinorOnlyAgeGroup(ageGroup: string | null | undefined): boolean {
  return resolveTeamAgeCategory(ageGroup)?.adultOnly === false;
}
