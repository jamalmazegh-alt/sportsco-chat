/**
 * Invariant 2 : les membres ne doivent JAMAIS voir les noms des autres
 * volontaires confirmés. Seul le staff a droit à la liste nominative ;
 * les membres obtiennent uniquement l'agrégat `confirmed_count`.
 *
 * Ce helper centralise la règle pour qu'elle soit testable indépendamment
 * de listEventNeeds (qui l'utilise) et réutilisable côté client si besoin.
 */
export type ConfirmedSignup = { user_id: string; full_name: string | null };

export function projectConfirmedSignups(
  isStaff: boolean,
  confirmedUserIds: string[],
  nameByUser: Record<string, string | null>,
): ConfirmedSignup[] {
  if (!isStaff) return [];
  return confirmedUserIds.map((uid) => ({
    user_id: uid,
    full_name: nameByUser[uid] ?? null,
  }));
}
