/**
 * Feature flags — Clubero bêta V1 refocus.
 *
 * Source de vérité unique pour ce qui est volontairement masqué pendant
 * la bêta. Le code des features V2 reste en place (routes, server fns,
 * RLS, i18n) ; seul l'accès UI est coupé. Un flip de flag réactive
 * chaque feature en V2 sans refacto.
 *
 * **Règle d'or : on masque, on ne supprime pas.** N'utilisez jamais de
 * booléen en dur — passez toujours par `isV2(...)`.
 *
 * Voir `docs/beta-v1/feature-matrix.md` pour la matrice complète
 * Feature → État.
 */
export const V2_FLAGS = {
  /**
   * Réseau social ouvert *cross-club* : feed global, découverte
   * joueurs/clubs, mise en relation, recommandations, suggestions,
   * networking, interclubs.
   *
   * ⚠️ Ne couvre PAS le mur du club ni les actualités Facebook —
   * ceux-ci sont *club-scoped* et restent GARDÉS.
   */
  social_network_v2: false,

  /**
   * Profils publics enrichis (« LinkedIn du joueur ») et URLs
   * partageables `/p/:slug`, `/coach/:slug`, listing `/players`.
   *
   * La fiche joueur basique club-scoped (`/players/:id`) reste
   * accessible aux membres du club.
   */
  public_player_profiles: false,

  /** Collectes et cagnottes uniquement. */
  fundraising_v2: false,
} as const;

export type V2Flag = keyof typeof V2_FLAGS;

export const isV2 = (f: V2Flag): boolean => V2_FLAGS[f];
