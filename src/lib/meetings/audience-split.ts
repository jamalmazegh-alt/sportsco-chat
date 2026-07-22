/**
 * Helper pur (aucune dépendance serveur) — testable en isolation.
 *
 * Sépare une sélection d'audiences en :
 *   - selectors "purs" (groupes, équipes, catégories, audiences club…) passés
 *     au resolver SQL `resolve_audience_members` ;
 *   - user_ids issus des sélecteurs `selected_members` (personnes ajoutées
 *     manuellement), fusionnés avec les ajouts manuels explicites.
 *
 * On extrait `selected_members` pour passer ces user_ids explicitement à la
 * RPC plutôt que de dépendre de leur support dans le resolver SQL. Les user_ids
 * manuels sont dédupliqués (Set) — la déduplication cross-source finale se fait
 * de toute façon côté SQL sur (event_id, user_id).
 */
export type AudienceLike = { type?: string; user_ids?: unknown } & Record<string, unknown>;

export function splitAudiences(
  audiences: readonly AudienceLike[] | null | undefined,
  extraManual: readonly string[] = [],
): { selectors: AudienceLike[]; manualUserIds: string[] } {
  const selectors: AudienceLike[] = [];
  const manual = new Set<string>();
  for (const uid of extraManual) if (typeof uid === "string" && uid) manual.add(uid);

  for (const a of audiences ?? []) {
    if (a?.type === "selected_members" && Array.isArray(a.user_ids)) {
      for (const uid of a.user_ids) if (typeof uid === "string" && uid) manual.add(uid);
    } else if (a) {
      selectors.push(a);
    }
  }
  return { selectors, manualUserIds: Array.from(manual) };
}
