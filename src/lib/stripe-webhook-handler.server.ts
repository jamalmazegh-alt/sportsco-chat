import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifySubscriptionAdmin } from "@/lib/subscription-notify.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import {
  handleTournamentCheckoutCompleted,
  handleTournamentChargeRefunded,
} from "@/modules/tournaments/tournament-payments.server";
import { finalizeStripeTransactionByPI } from "@/lib/payment-checkout.functions";

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
  if (priceId === "price_1TZluSH9mBVlmKXfUr87LvQ9") return "monthly";
  if (priceId === "price_1TZluTH9mBVlmKXfmVWWcG4Q") return "yearly";
  if (priceId === "price_1TXT6NH9mBVlmKXfZBVjgvnb") return "monthly";
  if (priceId === "price_1TXT6NH9mBVlmKXfZxGQJz3R") return "yearly";
  return null;
}

function readTournamentPassQuantity(value: string | undefined | null): number {
  const n = parseInt(value ?? "1", 10);
  return Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 1;
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
  try {
    await notifySubscriptionAdmin(eventType, sub, clubId);
  } catch (e) {
    console.error("notifySubscriptionAdmin failed (swallowed)", { eventType, error: String(e) });
  }
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

/** Shared Stripe webhook POST handler (platform + Connect). */
export async function handleStripeWebhookPost(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!signature || (!platformSecret && !connectSecret)) {
    return new Response("Missing signature or secret", { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event | null = null;
  const secrets = [platformSecret, connectSecret].filter(Boolean) as string[];
  let lastErr: unknown = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!event) {
    console.error("Stripe webhook signature failed:", lastErr);
    return new Response("Invalid signature", { status: 400 });
  }

  const { error: dedupErr, data: dedupRow } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select("event_id")
    .maybeSingle();
  if (dedupErr && (dedupErr as { code?: string }).code !== "23505") {
    console.error("stripe_webhook_events insert failed", dedupErr);
    return new Response("dedup error", { status: 500 });
  }
  if (!dedupRow) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.purpose === "payment_obligation") {
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          let chargeId: string | null = null;
          let amount = session.amount_total ?? 0;
          let fee: number | null = null;
          if (piId) {
            try {
              const connectedAccountId = event.account ?? undefined;
              const pi = await stripe.paymentIntents.retrieve(
                piId,
                { expand: ["latest_charge"] },
                connectedAccountId ? { stripeAccount: connectedAccountId } : undefined,
              );
              const charge = pi.latest_charge as Stripe.Charge | null;
              chargeId = charge?.id ?? null;
              amount = pi.amount_received ?? amount;
              fee = pi.application_fee_amount ?? null;
            } catch (e) {
              console.warn("PI retrieve failed", e);
            }
          }
          await finalizeStripeTransactionByPI({
            paymentIntentId: piId ?? "",
            chargeId,
            amountReceivedCents: amount,
            feeCents: fee,
            sessionId: session.id,
            currency: session.currency ?? null,
            metadata: {
              obligation_id: session.metadata?.obligation_id ?? null,
              club_id: session.metadata?.club_id ?? null,
              payer_user_id: session.metadata?.payer_user_id ?? null,
            },
          });
          break;
        }
        if (session.mode === "payment" && session.metadata?.purpose === "tournament_registration") {
          await handleTournamentCheckoutCompleted(session, event.id);
          break;
        }
        if (session.mode === "payment" && session.metadata?.purpose === "tournament_pass") {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          const buyerEmail =
            session.customer_details?.email ?? session.metadata?.email ?? null;
          if (buyerEmail) {
            const qty = readTournamentPassQuantity(session.metadata?.quantity);
            const totalCents = session.amount_total;
            if (totalCents == null) {
              console.warn("tournament_pass checkout completed without amount_total — skipping", {
                sessionId: session.id,
              });
              break;
            }
            const perPass = Math.round(totalCents / qty);
            const paidAt = new Date().toISOString();
            const { data: existing } = await supabaseAdmin
              .from("tournament_passes")
              .select("id, status")
              .eq("stripe_session_id", session.id);
            const missing = Math.max(0, qty - (existing?.length ?? 0));
            if (missing > 0) {
              await supabaseAdmin.from("tournament_passes").insert(
                Array.from({ length: missing }, () => ({
                  email: buyerEmail.toLowerCase(),
                  stripe_session_id: session.id,
                  stripe_payment_intent_id: paymentIntentId,
                  amount_total: perPass,
                  currency: session.currency ?? "eur",
                  status: "paid" as const,
                  paid_at: paidAt,
                })),
              );
            }
            await supabaseAdmin
              .from("tournament_passes")
              .update({
                status: "paid",
                stripe_payment_intent_id: paymentIntentId,
                amount_total: perPass,
                currency: session.currency ?? "eur",
                paid_at: paidAt,
              })
              .eq("stripe_session_id", session.id)
              .eq("status", "pending");
            try {
              await enqueueTransactionalEmailServer({
                templateName: "tournament-pass-purchased",
                idempotencyKey: `tournament-pass-${session.id}`,
                templateData: {
                  buyerEmail,
                  amount: totalCents,
                  currency: session.currency ?? "eur",
                  sessionId: session.id,
                  paymentIntentId,
                  quantity: qty,
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
        const subRef = (invoice as unknown as { subscription?: string | Stripe.Subscription })
          .subscription;
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
          const pm =
            typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
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
        const status: "pending" | "active" | "restricted" | "disabled" = disabledReason
          ? disabledReason.startsWith("rejected")
            ? "disabled"
            : "restricted"
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

          try {
            await supabaseAdmin
              .from("tournament_payment_events")
              .upsert(
                {
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
                },
                { onConflict: "stripe_event_id", ignoreDuplicates: true },
              );
          } catch (e) {
            console.error("tournament_payment_events upsert failed (swallowed)", e);
          }

          try {
            await supabaseAdmin.from("payment_audit_logs").insert({
              club_id: club.id,
              actor_user_id: null,
              action: "provider_changed",
              entity_type: "club",
              entity_id: club.id,
              new_value: {
                stripe_account_id: account.id,
                status,
                charges_enabled: chargesEnabled,
                payouts_enabled: payoutsEnabled,
                disabled_reason: disabledReason,
              } as unknown as never,
            });
          } catch (e) {
            console.error("payment_audit_logs provider_changed failed (swallowed)", e);
          }
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        const totalRefunded = charge.amount_refunded ?? 0;

        if (piId) {
          const { data: tx } = await supabaseAdmin
            .from("payment_transactions")
            .select("id, club_id, refunded_amount_cents")
            .eq("stripe_payment_intent_id", piId)
            .eq("method", "stripe")
            .maybeSingle();

          if (tx) {
            const prev = tx.refunded_amount_cents ?? 0;
            if (prev !== totalRefunded) {
              await supabaseAdmin
                .from("payment_transactions")
                .update({ refunded_amount_cents: totalRefunded })
                .eq("id", tx.id);

              try {
                await supabaseAdmin.from("payment_audit_logs").insert({
                  club_id: tx.club_id,
                  actor_user_id: null,
                  action: "stripe_refund_synced",
                  entity_type: "payment_transaction",
                  entity_id: tx.id,
                  new_value: {
                    charge_id: charge.id,
                    payment_intent: piId,
                    refunded_amount_cents: totalRefunded,
                    previous_refunded_amount_cents: prev,
                    stripe_event_id: event.id,
                  } as unknown as never,
                });
              } catch (e) {
                console.error("stripe_refund_synced audit failed (swallowed)", e);
              }
            }
            break;
          }
        }
        await handleTournamentChargeRefunded(charge, event.id);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { data: tx } = await supabaseAdmin
          .from("payment_transactions")
          .select("id, status")
          .eq("stripe_payment_intent_id", pi.id)
          .eq("method", "stripe")
          .maybeSingle();
        if (tx && tx.status === "pending") {
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "failed" })
            .eq("id", tx.id);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const piId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        let tx: { id: string; status: string } | null = null;
        {
          const { data } = await supabaseAdmin
            .from("payment_transactions")
            .select("id, status")
            .eq("external_reference", session.id)
            .eq("method", "stripe")
            .maybeSingle();
          tx = data ?? null;
        }
        if (!tx && piId) {
          const { data } = await supabaseAdmin
            .from("payment_transactions")
            .select("id, status")
            .eq("stripe_payment_intent_id", piId)
            .eq("method", "stripe")
            .maybeSingle();
          tx = data ?? null;
        }
        if (tx && tx.status === "pending") {
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "failed" })
            .eq("id", tx.id);
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
}
