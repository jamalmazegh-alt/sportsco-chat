import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  return _stripe;
}

// Stripe price IDs are configurable via env so plan changes don't require a redeploy.
// Defaults reflect the current Clubero pricing (49 €/mo, 490 €/an, 40 € one-time per tournament).
export const STRIPE_PRICE_MONTHLY =
  process.env.STRIPE_PRICE_MONTHLY || "price_1TZluSH9mBVlmKXfUr87LvQ9";
export const STRIPE_PRICE_YEARLY =
  process.env.STRIPE_PRICE_YEARLY || "price_1TZluTH9mBVlmKXfmVWWcG4Q";
export const STRIPE_PRICE_TOURNAMENT =
  process.env.STRIPE_PRICE_TOURNAMENT || "price_1TZluTH9mBVlmKXfzr1vFIaK";

// Legacy price IDs (kept for back-compat: existing subscribers on the 39 €/390 € plan).
export const LEGACY_STRIPE_PRICE_MONTHLY = "price_1TXT6NH9mBVlmKXfZBVjgvnb";
export const LEGACY_STRIPE_PRICE_YEARLY = "price_1TXT6NH9mBVlmKXfZxGQJz3R";

export function getPriceId(plan: "monthly" | "yearly"): string {
  return plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
}
