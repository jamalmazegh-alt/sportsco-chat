/**
 * Shared "member context" shape and client-side subline formatter.
 *
 * Utilisé pour afficher une sous-ligne cohérente sous chaque personne :
 *   Joueur → « Joueur · U15 » (ou « Joueur · U15, U17 » si multi-équipes)
 *   Parent → « Parent de Léo M. (U13), Adam M. (U11) »
 *   Coach  → « U15 R1 » (équipes / catégories entraînées, joint par « , »)
 *   Autre  → null (pas de sous-ligne, juste la puce de rôle)
 *
 * IMPORTANT — confidentialité mineurs :
 *   - Cette structure ne contient QUE prénom + initiale du nom pour un enfant,
 *     jamais la date de naissance brute.
 *   - Le serveur ne renseigne cette structure que pour du staff — voir
 *     `member-context.server.ts` et `projectConfirmedSignups`.
 */
export type MemberContext = {
  primary_role: string | null;
  /** Compat : première catégorie du joueur (identique à player_categories[0]). */
  player_category: string | null;
  /** Toutes les catégories distinctes du joueur (multi-équipes). */
  player_categories: string[];
  children: Array<{ name: string; category: string | null }>;
  coached_teams: Array<{ name: string; age_group: string | null }>;
};

export type MemberContextLabels = {
  playerSubline: (category: string) => string;
  playerSublineMulti: (categories: string) => string;
  parentSubline: (children: string) => string;
};

export function formatMemberContextSubline(
  ctx: MemberContext | null | undefined,
  labels: MemberContextLabels,
): string | null {
  if (!ctx) return null;
  const p = ctx.primary_role;

  if (p === "player") {
    const cats = (ctx.player_categories ?? []).filter(Boolean);
    if (cats.length > 1) return labels.playerSublineMulti(cats.join(", "));
    if (cats.length === 1) return labels.playerSubline(cats[0]);
    if (ctx.player_category) return labels.playerSubline(ctx.player_category);
    return null;
  }

  if (p === "parent" && ctx.children && ctx.children.length > 0) {
    const s = ctx.children
      .map((c) => (c.category ? `${c.name} (${c.category})` : c.name))
      .join(", ");
    return labels.parentSubline(s);
  }

  if (
    (p === "coach" || p === "assistant_coach") &&
    ctx.coached_teams &&
    ctx.coached_teams.length > 0
  ) {
    const s = ctx.coached_teams
      .map((tm) => tm.age_group || tm.name)
      .filter(Boolean)
      .join(", ");
    return s || null;
  }

  return null;
}
