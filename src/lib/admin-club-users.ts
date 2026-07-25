/**
 * Pure helpers for the club admin users list (membres / joueurs & parents).
 *
 * Parents can exist in player_parents without a club_members row (lazy
 * link_parent_memberships at login). listClubUsers merges both sources here.
 */

export type ClubUserProfile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
};

export type ClubUserListItem = {
  user_id: string;
  roles: string[];
  profile: ClubUserProfile | null;
  email: string | null;
  /** True when a club_members row exists for (club, user). */
  isClubMember: boolean;
};

export const ADMIN_STAFF_ROLES = new Set([
  "admin",
  "coach",
  "assistant_coach",
  "staff",
  "tournament_manager",
]);

export function memberRolesFromRow(m: { role?: string | null; roles?: string[] | null }): string[] {
  if (Array.isArray(m.roles) && m.roles.length > 0) return [...m.roles];
  return m.role ? [m.role] : [];
}

/**
 * Merge club_members rows with parent_user_ids from player_parents.
 * Dedupes by user_id: existing members keep real roles + isClubMember true;
 * parent-only users get roles=['parent'] and isClubMember false.
 */
export function mergeClubUsersList(args: {
  members: Array<{ user_id: string; role?: string | null; roles?: string[] | null }>;
  parentUserIds: string[];
  profilesById: Map<string, ClubUserProfile | null>;
  emailsById: Map<string, string | null>;
}): ClubUserListItem[] {
  const grouped = new Map<string, ClubUserListItem>();

  for (const m of args.members) {
    if (!m.user_id) continue;
    const rolesArr = memberRolesFromRow(m);
    const g = grouped.get(m.user_id) ?? {
      user_id: m.user_id,
      roles: [],
      profile: args.profilesById.get(m.user_id) ?? null,
      email: args.emailsById.get(m.user_id) ?? null,
      isClubMember: true,
    };
    for (const r of rolesArr) if (!g.roles.includes(r)) g.roles.push(r);
    g.isClubMember = true;
    grouped.set(m.user_id, g);
  }

  for (const parentId of args.parentUserIds) {
    if (!parentId || grouped.has(parentId)) continue;
    grouped.set(parentId, {
      user_id: parentId,
      roles: ["parent"],
      profile: args.profilesById.get(parentId) ?? null,
      email: args.emailsById.get(parentId) ?? null,
      isClubMember: false,
    });
  }

  return Array.from(grouped.values()).sort((a, b) =>
    (a.profile?.full_name ?? a.email ?? "").localeCompare(b.profile?.full_name ?? b.email ?? ""),
  );
}

/** Same split as admin/users.index tabs — staff vs joueurs & parents. */
export function splitClubUsersForAdminTabs(users: ClubUserListItem[]): {
  staff: ClubUserListItem[];
  playersParents: ClubUserListItem[];
} {
  const staff = users.filter(
    (u) => u.isClubMember && u.roles.some((r) => ADMIN_STAFF_ROLES.has(r)),
  );
  const playersParents = users.filter(
    (u) =>
      !u.roles.some((r) => ADMIN_STAFF_ROLES.has(r)) &&
      (u.roles.includes("player") || u.roles.includes("parent")),
  );
  return { staff, playersParents };
}
