/**
 * Pure helpers for the invited-signup flow.
 *
 * Two distinct paths exist:
 *  - NOMINATIVE invites (`member_invites`): the token is bound to one exact
 *    e-mail address, so receiving the link already proves ownership. The
 *    account is created server-side with `email_confirm: true` → no
 *    verification e-mail at all.
 *  - CLUB link invites (`club_invites`): shared URL / QR code, anyone can open
 *    it → no proof of ownership → standard client `signUp()` + Supabase
 *    confirmation e-mail.
 */

export type MemberInviteInfo = {
  used?: boolean | null;
  expired?: boolean | null;
  email?: string | null;
  kind?: string | null;
} | null;

/** Stable code raised by `redeem_member_invite` when session ≠ invite e-mail. */
export const INVITE_EMAIL_MISMATCH = "invite_email_mismatch";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Security gate: a pre-confirmed account may only be created when the invite
 * token is still valid AND bound to exactly the requested e-mail address.
 */
export function inviteMatchesEmail(member: MemberInviteInfo, email: string): boolean {
  if (!member) return false;
  if (member.used) return false;
  if (member.expired) return false;
  if (!member.email) return false;
  return normalizeEmail(member.email) === normalizeEmail(email);
}

/**
 * Whether the current session may redeem a nominative member invite.
 * Invites without a bound e-mail (rare / phone-only) are left unbound.
 */
export function sessionMatchesMemberInvite(
  sessionEmail: string | null | undefined,
  inviteEmail: string | null | undefined,
): boolean {
  if (!inviteEmail?.trim()) return true;
  if (!sessionEmail?.trim()) return false;
  return normalizeEmail(sessionEmail) === normalizeEmail(inviteEmail);
}

export function isInviteEmailMismatchError(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.toLowerCase().includes(INVITE_EMAIL_MISMATCH);
}

export type SignupPath = "server_create" | "client_signup";

/**
 * Decide which signup path to take.
 * `inviteSource` is "member" for nominative invites, "club" for link invites,
 * null when there is no invite.
 */
export function resolveSignupPath(inviteSource: "member" | "club" | null): SignupPath {
  return inviteSource === "member" ? "server_create" : "client_signup";
}

/** Supabase admin error messages meaning "this e-mail already has an account". */
export function isEmailAlreadyExistsError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("email exists") ||
    m.includes("already exists") ||
    m.includes("user_already_exists")
  );
}
