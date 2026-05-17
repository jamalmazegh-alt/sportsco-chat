import type Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

function toIso(ts?: number | null): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function planFromPriceId(priceId?: string | null): "monthly" | "yearly" | null {
  if (!priceId) return null;
  if (priceId === "price_1TXT6NH9mBVlmKXfZBVjgvnb") return "monthly";
  if (priceId === "price_1TXT6NH9mBVlmKXfZxGQJz3R") return "yearly";
  return null;
}

export type SubAdminEventType =
  | "created"
  | "trial_started"
  | "canceled"
  | "cancellation_scheduled"
  | "reactivated"
  | "payment_failed";

export async function notifySubscriptionAdmin(
  eventType: SubAdminEventType,
  sub: Stripe.Subscription,
  clubId: string | null,
) {
  try {
    let clubName: string | null = null;
    if (clubId) {
      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("name")
        .eq("id", clubId)
        .maybeSingle();
      clubName = club?.name ?? null;
    }
    const item = sub.items.data[0];
    const priceId = item?.price?.id ?? null;
    const customerEmail =
      typeof sub.customer === "object" && sub.customer && "email" in sub.customer
        ? (sub.customer as Stripe.Customer).email
        : null;
    await enqueueTransactionalEmailServer({
      templateName: "subscription-admin-notification",
      idempotencyKey: `sub-${eventType}-${sub.id}-${sub.canceled_at ?? sub.cancel_at ?? Date.now()}`,
      templateData: {
        eventType,
        clubId,
        clubName,
        plan: planFromPriceId(priceId),
        status: sub.status,
        customerEmail,
        trialEnd: toIso(sub.trial_end),
        currentPeriodEnd: toIso(item?.current_period_end),
        cancelAt: toIso(sub.cancel_at),
        stripeSubscriptionId: sub.id,
      },
    });
  } catch (err) {
    console.error("notifySubscriptionAdmin failed:", err);
  }
}
