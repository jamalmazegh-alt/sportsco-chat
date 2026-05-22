import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe, STRIPE_PRICE_TOURNAMENT } from "@/lib/stripe.server";

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

/**
 * Create a Stripe Checkout session (one-time payment, 40 €) for a Tournament Pass.
 * Public: no auth required — the buyer just provides an email.
 * On success, the webhook inserts a tournament_passes row with status='paid'.
 */
export const createTournamentPassCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(255),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const stripe = getStripe();
    const origin = getOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: data.email,
      line_items: [{ price: STRIPE_PRICE_TOURNAMENT, quantity: 1 }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${origin}/tournaments/pass-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?pass=canceled`,
      metadata: {
        purpose: "tournament_pass",
        email: data.email,
      },
      payment_intent_data: {
        metadata: {
          purpose: "tournament_pass",
          email: data.email,
        },
      },
    });

    // Pre-insert a pending row so we can correlate later if the webhook is delayed.
    await supabaseAdmin.from("tournament_passes").insert({
      email: data.email,
      stripe_session_id: session.id,
      amount_total: 4000,
      currency: "eur",
      status: "pending",
    });

    return { url: session.url };
  });
