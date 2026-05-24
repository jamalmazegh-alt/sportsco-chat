// Platform fee computation for tournament registration payments.
// Pure functions — safe to import on client (display) or server (Stripe call).
// SECURITY: the server is the source of truth. Never trust a fee value sent
// from the client; always recompute server-side before calling Stripe.

const DEFAULT_RATE = 0.05; // 5% — applied when the club has no active Clubero subscription
const SUBSCRIBER_RATE = 0.03; // 3% — reduced fee for active subscribers

function getRate(envValue: string | undefined, fallback: number): number {
  const n = envValue ? Number(envValue) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/** Base rate (no subscription). Configurable via PLATFORM_FEE_PERCENT env. */
export const PLATFORM_FEE_PERCENT = getRate(
  typeof process !== "undefined" ? process.env?.PLATFORM_FEE_PERCENT : undefined,
  DEFAULT_RATE,
);

/** Reduced rate for clubs with an active Clubero subscription. */
export const PLATFORM_FEE_PERCENT_SUBSCRIBER = getRate(
  typeof process !== "undefined"
    ? process.env?.PLATFORM_FEE_PERCENT_SUBSCRIBER
    : undefined,
  SUBSCRIBER_RATE,
);

export function computePlatformFee(amountCents: number): number {
  return Math.round(amountCents * PLATFORM_FEE_PERCENT);
}

export function computeNetAmount(amountCents: number): number {
  return amountCents - computePlatformFee(amountCents);
}

/** Picks the right rate based on subscription status, returns fee in cents. */
export function computeFeeForClub(
  amountCents: number,
  hasActiveSubscription: boolean,
): number {
  const rate = hasActiveSubscription
    ? PLATFORM_FEE_PERCENT_SUBSCRIBER
    : PLATFORM_FEE_PERCENT;
  return Math.round(amountCents * rate);
}

/** Rate as a percentage (e.g. 5 or 3) — for UI display. */
export function getFeeRatePercent(hasActiveSubscription: boolean): number {
  return Math.round(
    (hasActiveSubscription ? PLATFORM_FEE_PERCENT_SUBSCRIBER : PLATFORM_FEE_PERCENT) * 100,
  );
}
