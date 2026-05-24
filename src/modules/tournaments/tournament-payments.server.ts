// Server-only helpers for tournament payments. Kept out of the .functions.ts
// file so server routes (e.g. /api/public/stripe-webhook) can import
// the raw helpers without dragging the full createServerFn graph into their
// bundle (which caused production build OOM).
import type Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import { computeFeeForClub } from "@/lib/platform-fee";
import { createLogger } from "@/lib/logger.server";


const log = createLogger("tournament-payments.server");

export async function logPaymentEvent(
  tournamentId: string | null,
  registrationId: string | null,
  eventType: string,
  amount: number | null,
  metadata: Record<string, unknown>,
  stripeEventId: string | null = null,
  actorId: string | null = null,
): Promise<void> {
  try {
    await supabaseAdmin.from("tournament_payment_events").insert({
      tournament_id: tournamentId,
      registration_id: registrationId,
      event_type: eventType,
      amount,
      stripe_event_id: stripeEventId,
      actor_id: actorId,
      metadata: metadata as unknown as never,
    });
  } catch (e) {
    log.error("Failed to insert payment event", { eventType, error: String(e) });
  }
}

export async function buildCheckoutForRegistration(params: {
  registrationId: string;
  origin: string;
}): Promise<{ url: string; sessionId: string } | null> {
  const { registrationId, origin } = params;

  const { data: reg } = await supabaseAdmin
    .from("tournament_registrations")
    .select("id, tournament_id, team_name, contact_email, payment_status")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return null;
  if (
    reg.payment_status === "paid_online" ||
    reg.payment_status === "paid_offline" ||
    reg.payment_status === "refunded"
  ) {
    return null;
  }

  const { data: t } = await supabaseAdmin
    .from("tournaments")
    .select(
      "id, name, slug, club_id, registration_fee, registration_currency, registration_fee_description, payment_mode",
    )
    .eq("id", reg.tournament_id)
    .single();
  if (!t || !t.registration_fee || t.registration_fee <= 0) return null;
  if (t.payment_mode === "offline") return null;

  if (!t.club_id) return null;
  const { data: club } = await supabaseAdmin
    .from("clubs")
    .select("id, stripe_account_id, stripe_charges_enabled")
    .eq("id", t.club_id)
    .single();
  if (!club?.stripe_account_id || !club.stripe_charges_enabled) return null;

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, trial_end, current_period_end")
    .eq("club_id", t.club_id)
    .maybeSingle();
  const now = Date.now();
  const hasActiveSubscription = !!sub && (
    (sub.status === "trialing" && sub.trial_end && new Date(sub.trial_end).getTime() > now) ||
    ((sub.status === "active" || sub.status === "past_due") &&
      (!sub.current_period_end || new Date(sub.current_period_end).getTime() > now))
  );

  const fee = computeFeeForClub(t.registration_fee, hasActiveSubscription);

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card", "sepa_debit", "link"],
    customer_email: reg.contact_email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: t.registration_currency || "eur",
          unit_amount: t.registration_fee,
          product_data: {
            name: `${t.name} — ${reg.team_name}`,
            description:
              t.registration_fee_description ?? "Tournament registration fee",
          },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: club.stripe_account_id },
      metadata: {
        purpose: "tournament_registration",
        registration_id: reg.id,
        tournament_id: t.id,
        club_id: t.club_id,
      },
    },
    metadata: {
      purpose: "tournament_registration",
      registration_id: reg.id,
      tournament_id: t.id,
      club_id: t.club_id,
    },
    success_url: `${origin}/tournament/${t.slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/tournament/${t.slug}/register?cancelled=1`,
  });

  if (!session.url) return null;

  await supabaseAdmin
    .from("tournament_registrations")
    .update({
      payment_status: "pending",
      stripe_session_id: session.id,
      platform_fee: fee,
      amount_paid: 0,
      currency: t.registration_currency || "eur",
    })
    .eq("id", reg.id);

  await logPaymentEvent(
    t.id,
    reg.id,
    "checkout_created",
    t.registration_fee,
    { session_id: session.id, fee, club_id: t.club_id },
  );

  return { url: session.url, sessionId: session.id };
}

// ---------- Webhook helpers (called from /api/public/stripe-webhook)

export async function handleTournamentCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  const registrationId = session.metadata?.registration_id;
  if (!registrationId) return;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const stripe = getStripe();
  let chargeId: string | null = null;
  let amountPaid = session.amount_total ?? 0;

  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      chargeId = charge?.id ?? null;
      amountPaid = pi.amount_received ?? amountPaid;
    } catch (e) {
      log.warn("Failed to retrieve payment intent", { paymentIntentId, error: String(e) });
    }
  }

  const now = new Date().toISOString();
  const { data: reg } = await supabaseAdmin
    .from("tournament_registrations")
    .update({
      payment_status: "paid_online",
      payment_intent_id: paymentIntentId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      amount_paid: amountPaid,
      amount_paid_cents: amountPaid,
      currency: session.currency ?? "eur",
      paid_at: now,
    })
    .eq("id", registrationId)
    .select("tournament_id")
    .maybeSingle();

  await logPaymentEvent(
    reg?.tournament_id ?? null,
    registrationId,
    "payment_succeeded",
    amountPaid,
    {
      session_id: session.id,
      payment_intent: paymentIntentId,
      charge: chargeId,
    },
    eventId,
  );
}

export async function handleTournamentChargeRefunded(
  charge: Stripe.Charge,
  eventId: string,
): Promise<void> {
  const piId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;
  if (!piId) return;

  const { data: reg } = await supabaseAdmin
    .from("tournament_registrations")
    .select("id, tournament_id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();
  if (!reg) return;

  await supabaseAdmin
    .from("tournament_registrations")
    .update({
      payment_status: "refunded",
      refunded_at: new Date().toISOString(),
    })
    .eq("id", reg.id);

  await logPaymentEvent(
    reg.tournament_id,
    reg.id,
    "refund_succeeded",
    charge.amount_refunded ?? 0,
    { charge_id: charge.id, payment_intent: piId },
    eventId,
  );
}
