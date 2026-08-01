/**
 * Helpers purs de modération (testés unitairement, sans dépendance serveur).
 */

type MemberRow = {
  user_id: string | null;
  role: string | null;
  roles: string[] | null;
};

const MOD_ROLES = new Set(["admin", "dirigeant"]);

/**
 * Ids des modérateurs (admin / dirigeant, rôle principal ou dans roles[]) à
 * notifier, en excluant les ids fournis — typiquement le signaleur et, pour un
 * signalement de membre, la personne visée (un responsable ne doit pas être
 * notifié de son propre signalement).
 */
export function pickModeratorIds(
  members: ReadonlyArray<MemberRow>,
  exclude: ReadonlyArray<string>,
): string[] {
  const excluded = new Set(exclude);
  return Array.from(
    new Set(
      members
        .filter(
          (m) => (m.role && MOD_ROLES.has(m.role)) || (m.roles ?? []).some((r) => MOD_ROLES.has(r)),
        )
        .map((m) => m.user_id)
        .filter((x): x is string => !!x && !excluded.has(x)),
    ),
  );
}
