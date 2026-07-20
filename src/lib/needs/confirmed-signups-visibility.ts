/**
 * Invariant 2 : les membres ne doivent JAMAIS voir les noms des autres
 * volontaires confirmés. Seul le staff a droit à la liste nominative ;
 * les membres obtiennent uniquement l'agrégat `confirmed_count`.
 *
 * Le payload staff est enrichi d'un `context` (rôle principal + catégorie
 * / enfants / équipes coachées) pour permettre l'affichage d'une sous-ligne
 * cohérente avec /admin/groups et le picker d'audience.
 */
import type { MemberContext } from "./member-context";

export type ConfirmedSignup = {
  user_id: string;
  full_name: string | null;
  context: MemberContext | null;
};

export function projectConfirmedSignups(
  isStaff: boolean,
  confirmedUserIds: string[],
  nameByUser: Record<string, string | null>,
  contextByUser?: Map<string, MemberContext> | Record<string, MemberContext>,
): ConfirmedSignup[] {
  if (!isStaff) return [];
  const getCtx = (uid: string): MemberContext | null => {
    if (!contextByUser) return null;
    if (contextByUser instanceof Map) return contextByUser.get(uid) ?? null;
    return contextByUser[uid] ?? null;
  };
  return confirmedUserIds.map((uid) => ({
    user_id: uid,
    full_name: nameByUser[uid] ?? null,
    context: getCtx(uid),
  }));
}
