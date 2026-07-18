/**
 * Pure helper that plans the list of recipients for a convocation resend.
 *
 * Extracted so it can be unit-tested independently of the route component.
 *
 * Rules:
 * - Each convocation must have a response_token; otherwise it is skipped.
 * - The player email is enqueued once (when present).
 * - Each parent linked to a player is enqueued once, with a per-recipient
 *   idempotency suffix that combines a unique recipient identity
 *   (parent_user_id ?? normalized email ?? random uuid) and the convocation id.
 *   This prevents two parents of the same player from sharing the same
 *   idempotency key — which would trigger `403 recipient_mismatch` at the
 *   email provider on the second recipient.
 * - Emails are deduped across the whole resend using a normalized (trimmed,
 *   lowercased) email set — the same address is only enqueued once per run.
 * - When `player_parents.email` is empty but the parent has `parent_user_id`,
 *   we fall back to the resolved Auth email (see `resolveParentEmails`).
 */

export type ResendPlanParent = {
  parent_user_id: string | null;
  email: string | null;
  full_name: string | null;
  player_id: string;
};

export type ResendPlanConvocation = {
  id: string;
  player_id: string;
  response_token: string | null;
  player: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    user_id?: string | null;
  } | null;
};

export type PlannedRecipient = {
  email: string;
  recipientFirstName?: string;
  playerName: string;
  token: string;
  idemSuffix: string;
  /**
   * Stable per-campaign recipient identity used for the DB unique index on
   * (dispatch_id, recipient_id, notification_type). Two parents of the same
   * player MUST get different recipientIds. Format:
   *   - player:<playerId>
   *   - parent:<playerId>:<normalizedEmail>
   *   - parent-uid:<playerId>:<parentUserId>  (when the parent has no email yet)
   */
  recipientId: string;
  playerId: string;
};

export type ResendPlan = {
  recipients: PlannedRecipient[];
  inAppUserIds: string[];
};

function newRecipientKey(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `rand-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function planConvocationResendRecipients(
  convocations: ResendPlanConvocation[],
  parents: ResendPlanParent[],
  resolvedParentEmails: Record<string, string>,
): ResendPlan {
  const seenEmails = new Set<string>();
  const recipients: PlannedRecipient[] = [];
  const inApp = new Set<string>();

  for (const c of convocations) {
    if (!c.response_token) continue;
    const p = c.player;
    const playerName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();

    const push = (
      email: string | null | undefined,
      firstName: string | undefined,
      idemSuffix: string,
      recipientId: string,
    ) => {
      if (!email) return;
      const key = email.trim().toLowerCase();
      if (!key || seenEmails.has(key)) return;
      seenEmails.add(key);
      recipients.push({
        email,
        recipientFirstName: firstName,
        playerName,
        token: c.response_token!,
        idemSuffix,
        recipientId,
        playerId: c.player_id,
      });
    };

    push(p?.email ?? null, p?.first_name ?? undefined, `p-${c.id}`, `player:${c.player_id}`);
    if (p?.user_id) inApp.add(p.user_id);

    for (const parent of parents.filter((pp) => pp.player_id === c.player_id)) {
      const parentFirst = (parent.full_name ?? "").split(" ")[0] || undefined;
      const email =
        parent.email ||
        (parent.parent_user_id ? resolvedParentEmails[parent.parent_user_id] : null) ||
        null;
      const parentRecipientKey =
        parent.parent_user_id ?? email?.trim().toLowerCase() ?? newRecipientKey();
      const recipientId = email
        ? `parent:${c.player_id}:${email.trim().toLowerCase()}`
        : parent.parent_user_id
          ? `parent-uid:${c.player_id}:${parent.parent_user_id}`
          : `parent-rand:${c.player_id}:${parentRecipientKey}`;
      push(email, parentFirst, `parent-${parentRecipientKey}-${c.id}`, recipientId);
      if (parent.parent_user_id) inApp.add(parent.parent_user_id);
    }
  }

  return { recipients, inAppUserIds: Array.from(inApp) };
}
