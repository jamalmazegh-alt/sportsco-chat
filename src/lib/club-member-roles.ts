/** Staff roles editable via setClubMemberRoles. */
export const CLUB_STAFF_ROLES = [
  "admin",
  "coach",
  "assistant_coach",
  "staff",
  "tournament_manager",
] as const;
export type ClubStaffRole = (typeof CLUB_STAFF_ROLES)[number];

/** Non-staff roles kept on club_members.roles when staff roles are edited. */
export const NON_STAFF_CLUB_ROLES = new Set(["player", "parent", "dirigeant"]);

/** Preserves player/parent/dirigeant when editing staff roles. */
export function mergeStaffWithNonStaffRoles(
  staffRoles: ClubStaffRole[],
  existingRoles: string[] | null | undefined,
): string[] {
  const preserved = (existingRoles ?? []).filter((r) => NON_STAFF_CLUB_ROLES.has(r));
  return Array.from(new Set([...staffRoles, ...preserved]));
}

/**
 * When creating a club_members row for a parent who only existed in
 * player_parents, seed non-staff with `parent` so merge keeps it.
 */
export function oldRolesForClubMemberUpsert(
  currentRoles: string[] | null | undefined,
  creating: boolean,
): string[] {
  if (!creating) return currentRoles ?? [];
  return ["parent"];
}
