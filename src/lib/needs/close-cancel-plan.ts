/**
 * Pure planning helpers for closeEventNeed / cancelEventNeed.
 *
 * They encode the invariants that the server functions must respect and
 * that we want to protect against regression:
 *
 *  - close  : only 'applied' signups become 'declined' and get a "poste pourvu"
 *             notification. 'confirmed' signups are untouched (mission tenue).
 *             'unavailable' / 'withdrawn' / 'declined' are inert.
 *  - cancel : the need becomes 'cancelled'. Confirmed AND applied signups get
 *             the "annulé" notification, deduplicated by user_id. 'unavailable'
 *             / 'withdrawn' / 'declined' get nothing.
 */

export type SignupLike = {
  id: string;
  user_id: string | null;
  status:
    | "applied"
    | "confirmed"
    | "declined"
    | "withdrawn"
    | "unavailable"
    | (string & {});
};

export type CloseNeedPlan = {
  toDecline: string[];             // signup ids
  toNotify: { signupId: string; userId: string }[];
};

export function planCloseNeed(signups: SignupLike[]): CloseNeedPlan {
  const applied = signups.filter((s) => s.status === "applied");
  return {
    toDecline: applied.map((s) => s.id),
    toNotify: applied
      .filter((s): s is SignupLike & { user_id: string } => !!s.user_id)
      .map((s) => ({ signupId: s.id, userId: s.user_id })),
  };
}

export type CancelNeedPlan = {
  toNotifyUserIds: string[];       // deduplicated
};

export function planCancelNeed(signups: SignupLike[]): CancelNeedPlan {
  const seen = new Set<string>();
  for (const s of signups) {
    if (s.status !== "applied" && s.status !== "confirmed") continue;
    if (!s.user_id) continue;
    seen.add(s.user_id);
  }
  return { toNotifyUserIds: [...seen] };
}
