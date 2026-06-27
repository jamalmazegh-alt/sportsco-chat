export type ExemptReason = "beta_club" | "partner" | "internal" | "other";

export const EXEMPT_REASON_LABELS: Record<ExemptReason, string> = {
  beta_club: "Club beta",
  partner: "Partenaire",
  internal: "Interne Clubero",
  other: "Autre",
};

export type SubscriptionAccessFields = {
  status?: string | null;
  trial_end?: string | null;
  current_period_end?: string | null;
  exempt_from_billing?: boolean | null;
  exempt_until?: string | null;
};

export function isBillingExempt(
  sub: SubscriptionAccessFields | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (sub?.exempt_from_billing !== true) return false;
  if (!sub.exempt_until) return true;
  return new Date(sub.exempt_until).getTime() > nowMs;
}

function isActiveStripeSubscription(sub: SubscriptionAccessFields, nowMs: number): boolean {
  const status = sub.status ?? "";
  if (status === "trialing") {
    const trialEnd = sub.trial_end ? new Date(sub.trial_end).getTime() : null;
    return trialEnd !== null && trialEnd > nowMs;
  }
  if (status === "active" || status === "past_due") {
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
    return periodEnd === null || periodEnd > nowMs;
  }
  return false;
}

/** True when the club has paid access via Stripe or a manual billing exemption. */
export function hasPaidAccessFromSubscription(
  sub: SubscriptionAccessFields | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!sub) return false;
  if (isBillingExempt(sub, nowMs)) return true;
  return isActiveStripeSubscription(sub, nowMs);
}
