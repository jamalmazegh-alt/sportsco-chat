import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifySubscriptionAdmin } from "@/lib/subscription-notify.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import {
  handleTournamentCheckoutCompleted,
  handleTournamentChargeRefunded,
} from "@/modules/tournaments/tournament-payments.functions";

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
  // Current prices (49 € / 490 €)
  if (priceId === "price_1TZluSH9mBVlmKXfUr87LvQ9") return "monthly";
  if (priceId === "price_1TZluTH9mBVlmKXfmVWWcG4Q") return "yearly";
  // Legacy prices (39 € / 390 €) — existing subscribers
  if (priceId === "price_1TXT6NH9mBVlmKXfZBVjgvnb") return "monthly";
  if (priceId === "price_1TXT6NH9mBVlmKXfZxGQJz3R") return "yearly";
  return null;
}

async function notifyAdmin(
  eventType:
    | "created"
    | "trial_started"
    | "canceled"
    | "cancellation_scheduled"
    | "reactivated"
    | "payment_failed",
  sub: Stripe.Subscription,
  clubId: string | null,
) {
  await notifySubscriptionAdmin(eventType, sub, clubId);
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const clubId =
    (sub.metadata?.club_id as string | undefined) ??
    ((sub.customer as Stripe.Customer | null)?.metadata?.club_id as string | undefined);

  let resolvedClubId = clubId ?? null;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!resolvedClubId && customerId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("club_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    resolvedClubId = data?.club_id ?? null;
  }
  if (!resolvedClubId) {
    console.error("Stripe webhook: cannot resolve club_id for sub", sub.id);
    return { resolvedClubId: null, previous: null };
  }

  const { data: previous } = await supabaseAdmin
    .from("subscriptions")
    .select("status, cancel_at_period_end, cancel_at, stripe_subscription_id")
    .eq("club_id", resolvedClubId)
    .maybeSingle();

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;

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
      cancel_at: toIso(sub.cancel_at),
      canceled_at: toIso(sub.canceled_at),
    },
    { onConflict: "club_id" },
  );

  return { resolvedClubId, previous };
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
          event = await stripe.webhooks.constructEventAsync(body, signature, secret);
        } catch (err) {
          console.error("Stripe webhook signature failed:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              // Tournament Pass: one-time payment, no subscription
              if (
                session.mode === "payment" &&
                session.metadata?.purpose === "tournament_pass"
              ) {
                const paymentIntentId =
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null;
                const buyerEmail =
                  session.customer_details?.email ??
                  session.metadata?.email ??
                  null;
                if (buyerEmail) {
                  await supabaseAdmin
                    .from("tournament_passes")
                    .update({
                      status: "paid",
                      stripe_payment_intent_id: paymentIntentId,
                      amount_total: session.amount_total ?? 4000,
                      currency: session.currency ?? "eur",
                      paid_at: new Date().toISOString(),
                    })
                    .eq("stripe_session_id", session.id);
                  try {
                    await enqueueTransactionalEmailServer({
                      templateName: "tournament-pass-purchased",
                      idempotencyKey: `tournament-pass-${session.id}`,
                      templateData: {
                        buyerEmail,
                        amount: session.amount_total ?? 4000,
                        currency: session.currency ?? "eur",
                        sessionId: session.id,
                        paymentIntentId,
                      },
                    });
                  } catch (e) {
                    console.error("Failed to notify admin of tournament pass purchase", e);
                  }
                }
                break;
              }
              if (session.subscription) {
                const subId =
                  typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription.id;
                const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer"] });
                if (!sub.metadata?.club_id && session.metadata?.club_id) {
                  await stripe.subscriptions.update(sub.id, {
                    metadata: { ...sub.metadata, club_id: session.metadata.club_id },
                  });
                  sub.metadata = { ...sub.metadata, club_id: session.metadata.club_id };
                }
                const { resolvedClubId, previous } = await upsertSubscription(sub);
                if (resolvedClubId && !previous?.stripe_subscription_id) {
                  await notifyAdmin("created", sub, resolvedClubId);
                }
              }
              break;
            }
            case "customer.subscription.created": {
              const sub = event.data.object as Stripe.Subscription;
              const fresh = await stripe.subscriptions.retrieve(sub.id, { expand: ["customer"] });
              const { resolvedClubId, previous } = await upsertSubscription(fresh);
              if (resolvedClubId && !previous?.stripe_subscription_id) {
                await notifyAdmin("created", fresh, resolvedClubId);
              }
              break;
            }
            case "customer.subscription.updated": {
              const sub = event.data.object as Stripe.Subscription;
              const fresh = await stripe.subscriptions.retrieve(sub.id, { expand: ["customer"] });
              const { resolvedClubId, previous } = await upsertSubscription(fresh);
              if (resolvedClubId && previous) {
                const wasScheduled =
                  previous.cancel_at_period_end === true || previous.cancel_at !== null;
                const nowScheduled =
                  fresh.cancel_at_period_end === true || fresh.cancel_at !== null;
                if (!wasScheduled && nowScheduled) {
                  await notifyAdmin("cancellation_scheduled", fresh, resolvedClubId);
                } else if (wasScheduled && !nowScheduled && fresh.status !== "canceled") {
                  await notifyAdmin("reactivated", fresh, resolvedClubId);
                }
              }
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const fresh = await stripe.subscriptions.retrieve(sub.id, { expand: ["customer"] });
              const { resolvedClubId } = await upsertSubscription(fresh);
              if (resolvedClubId) await notifyAdmin("canceled", fresh, resolvedClubId);
              break;
            }
            case "customer.subscription.trial_will_end":
            case "customer.subscription.paused":
            case "customer.subscription.resumed": {
              await upsertSubscription(event.data.object as Stripe.Subscription);
              break;
            }
            case "invoice.payment_failed":
            case "invoice.payment_succeeded": {
              const invoice = event.data.object as Stripe.Invoice;
              const subRef = (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription;
              const subId = typeof subRef === "string" ? subRef : subRef?.id;
              if (subId) {
                const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer"] });
                const { resolvedClubId } = await upsertSubscription(sub);
                if (event.type === "invoice.payment_failed" && resolvedClubId) {
                  await notifyAdmin("payment_failed", sub, resolvedClubId);
                }
              }
              break;
            }
            case "setup_intent.succeeded": {
              const si = event.data.object as Stripe.SetupIntent;
              if (si.metadata?.purpose === "update_payment_method") {
                const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
                const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
                const subId = si.metadata.subscription_id;
                if (pm && customerId) {
                  await stripe.customers.update(customerId, {
                    invoice_settings: { default_payment_method: pm },
                  });
                  if (subId) {
                    await stripe.subscriptions.update(subId, { default_payment_method: pm });
                  }
                }
              }
              break;
            }
            case "account.updated": {
              const account = event.data.object as Stripe.Account;
              const chargesEnabled = !!account.charges_enabled;
              const payoutsEnabled = !!account.payouts_enabled;
              const disabledReason = account.requirements?.disabled_reason ?? null;
              const status: "pending" | "active" | "restricted" | "disabled" =
                disabledReason
                  ? (disabledReason.startsWith("rejected") ? "disabled" : "restricted")
                  : chargesEnabled && payoutsEnabled
                    ? "active"
                    : "pending";
              const { data: club } = await supabaseAdmin
                .from("clubs")
                .select("id")
                .eq("stripe_account_id", account.id)
                .maybeSingle();
              if (club) {
                await supabaseAdmin
                  .from("clubs")
                  .update({
                    stripe_account_status: status,
                    stripe_charges_enabled: chargesEnabled,
                    stripe_payouts_enabled: payoutsEnabled,
                  })
                  .eq("id", club.id);
                await supabaseAdmin.from("tournament_payment_events").insert({
                  tournament_id: null,
                  event_type: "account_updated",
                  stripe_event_id: event.id,
                  metadata: {
                    club_id: club.id,
                    stripe_account_id: account.id,
                    status,
                    charges_enabled: chargesEnabled,
                    payouts_enabled: payoutsEnabled,
                    disabled_reason: disabledReason,
                  } as unknown as never,
                });
              }
              break;
            }
            default:
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
