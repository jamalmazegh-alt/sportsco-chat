/**
 * Parent link status shown on the player profile badge.
 *
 * - inactive: no auth user linked yet
 * - unconfirmed: linked, but auth.users.email_confirmed_at is still null
 * - active: linked and email confirmed
 */
export type ParentAccountBadge = "active" | "unconfirmed" | "inactive";

export function isAuthEmailUnconfirmed(
  user: { email_confirmed_at?: string | null } | null | undefined,
): boolean {
  return !!user && !user.email_confirmed_at;
}

export function resolveParentAccountBadge(input: {
  parentUserId: string | null | undefined;
  unconfirmedUserIds: ReadonlySet<string>;
}): ParentAccountBadge {
  if (!input.parentUserId) return "inactive";
  return input.unconfirmedUserIds.has(input.parentUserId) ? "unconfirmed" : "active";
}
