import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, { apiVersion: "2025-09-30.clover" });
  return _stripe;
}

export const STRIPE_PRICE_MONTHLY = "price_1TXT6NH9mBVlmKXfZBVjgvnb";
export const STRIPE_PRICE_YEARLY = "price_1TXT6NH9mBVlmKXfZxGQJz3R";

export function getPriceId(plan: "monthly" | "yearly"): string {
  return plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
}
