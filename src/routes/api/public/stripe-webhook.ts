import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

function toIso(ts?: number | null): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function planFromPriceId(priceId?: string | null): "monthly" | "yearly" | null {
  if (!priceId) return null;
  if (priceId === "price_1TXT6NH9mBVlmKXfZBVjgvnb") return "monthly";
  if (priceId === "price_1TXT6NH9mBVlmKXfZxGQJz3R") return "yearly";
  return null;
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const clubId =
    (sub.metadata?.club_id as string | undefined) ??
    ((sub.customer as Stripe.Customer | null)?.metadata?.club_id as
      | string
      | undefined);

  // Fallback: lookup by customer id
  let resolvedClubId = clubId ?? null;
  if (!resolvedClubId) {
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (customerId) {
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("club_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      resolvedClubId = data?.club_id ?? null;
    }
  }
  if (!resolvedClubId) {
    console.error("Stripe webhook: cannot resolve club_id for sub", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

  await supabaseAdmin.from("subscriptions").upsert(
    {
      club_id: resolvedClubId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan: planFromPriceId(priceId),
      status: sub.status as SubStatus,
      current_period_start: toIso(item?.current_period_start),
      current_period_end: toIso(item?.current_period_end),
      trial_end: toIso(sub.trial_end),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      canceled_at: toIso(sub.canceled_at),
    },
    { onConflict: "club_id" },
  );
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!signature || !secret) {
          return new Response("Missing signature or secret", { status: 400 });
        }

        const body = await request.text();
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            secret,
          );
        } catch (err) {
          console.error("Stripe webhook signature failed:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              if (session.subscription) {
                const subId =
                  typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription.id;
                const sub = await stripe.subscriptions.retrieve(subId);
                // Ensure metadata.club_id is on the subscription
                if (!sub.metadata?.club_id && session.metadata?.club_id) {
                  await stripe.subscriptions.update(sub.id, {
                    metadata: {
                      ...sub.metadata,
                      club_id: session.metadata.club_id,
                    },
                  });
                  sub.metadata = {
                    ...sub.metadata,
                    club_id: session.metadata.club_id,
                  };
                }
                await upsertSubscription(sub);
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
            case "customer.subscription.trial_will_end":
            case "customer.subscription.paused":
            case "customer.subscription.resumed": {
              await upsertSubscription(event.data.object as Stripe.Subscription);
              break;
            }
            case "invoice.payment_failed":
            case "invoice.payment_succeeded": {
              const invoice = event.data.object as Stripe.Invoice;
              const subId =
                typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === "string"
                  ? ((invoice as unknown as { subscription: string }).subscription)
                  : ((invoice as unknown as { subscription?: Stripe.Subscription }).subscription?.id);
              if (subId) {
                const sub = await stripe.subscriptions.retrieve(subId);
                await upsertSubscription(sub);
              }
              break;
            }
            default:
              // ignore
              break;
          }
        } catch (err) {
          console.error("Stripe webhook handler error:", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
