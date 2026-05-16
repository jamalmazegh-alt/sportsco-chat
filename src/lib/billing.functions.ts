import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe, getPriceId } from "./stripe.server";

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

/**
 * Create a Stripe Checkout session for a club subscription.
 * The user must be admin of the club. Includes a 30-day free trial.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        plan: z.enum(["monthly", "yearly"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify the user is admin of the club
    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      throw new Error("Only club admins can manage subscriptions");
    }

    // Fetch club + existing subscription
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name")
      .eq("id", data.clubId)
      .single();

    if (!club) throw new Error("Club not found");

    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status")
      .eq("club_id", data.clubId)
      .maybeSingle();

    // If already active/trialing, route to portal instead
    if (
      existingSub?.stripe_subscription_id &&
      ["active", "trialing", "past_due"].includes(existingSub.status ?? "")
    ) {
      throw new Error("This club already has an active subscription");
    }

    const stripe = getStripe();

    // Reuse customer or create new one
    let customerId = existingSub?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const { data: { user } } = await supabase.auth.getUser();
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        name: club.name,
        metadata: { club_id: club.id, user_id: userId },
      });
      customerId = customer.id;

      // Persist customer id immediately
      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            club_id: club.id,
            stripe_customer_id: customerId,
            status: "incomplete",
          },
          { onConflict: "club_id" },
        );
    }

    const origin = getOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getPriceId(data.plan), quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { club_id: club.id, plan: data.plan },
      },
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      success_url: `${origin}/admin?billing=success`,
      cancel_url: `${origin}/pricing?billing=canceled`,
      metadata: { club_id: club.id, plan: data.plan },
    });

    return { url: session.url };
  });

/**
 * Open the Stripe customer portal for the current club's subscription.
 */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      throw new Error("Only club admins can manage subscriptions");
    }

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("club_id", data.clubId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      throw new Error("No subscription found for this club");
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${getOrigin()}/admin`,
    });

    return { url: session.url };
  });

/**
 * Get the current subscription state for a club.
 */
export const getClubSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) throw new Error("Forbidden");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "plan, status, current_period_end, trial_end, cancel_at_period_end, cancel_at, canceled_at",
      )
      .eq("club_id", data.clubId)
      .maybeSingle();

    return { subscription: sub };
  });

/**
 * Helper: verify user is admin of the club and return its stripe customer + subscription ids.
 */
async function getAdminClubStripeIds(
  clubId: string,
  userId: string,
  supabase: any,
): Promise<{ customerId: string; subscriptionId: string | null }> {
  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.role !== "admin") {
    throw new Error("Only club admins can manage subscriptions");
  }
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("club_id", clubId)
    .maybeSingle();
  if (!sub?.stripe_customer_id) throw new Error("No subscription found");
  return {
    customerId: sub.stripe_customer_id,
    subscriptionId: sub.stripe_subscription_id ?? null,
  };
}

/**
 * Cancel the subscription at the end of the current billing period.
 */
export const cancelSubscriptionAtPeriodEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { subscriptionId } = await getAdminClubStripeIds(data.clubId, userId, supabase);
    if (!subscriptionId) throw new Error("No active subscription");
    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    await supabaseAdmin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        cancel_at: updated.cancel_at ? new Date(updated.cancel_at * 1000).toISOString() : null,
      })
      .eq("club_id", data.clubId);
    return { ok: true };
  });

/**
 * Reactivate a subscription scheduled for cancellation.
 */
export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { subscriptionId } = await getAdminClubStripeIds(data.clubId, userId, supabase);
    if (!subscriptionId) throw new Error("No subscription");
    const stripe = getStripe();
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: false, cancel_at: null })
      .eq("club_id", data.clubId);
    return { ok: true };
  });

/**
 * Create a Stripe Checkout session in setup mode to let the user
 * update / add a payment method. Returns a URL that opens just the
 * card form (no full billing portal).
 */
export const createUpdatePaymentMethodSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { customerId, subscriptionId } = await getAdminClubStripeIds(
      data.clubId,
      userId,
      supabase,
    );
    const stripe = getStripe();
    const origin = getOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      setup_intent_data: {
        metadata: {
          club_id: data.clubId,
          subscription_id: subscriptionId ?? "",
          purpose: "update_payment_method",
        },
      },
      success_url: `${origin}/admin/billing?card=updated`,
      cancel_url: `${origin}/admin/billing`,
    });
    return { url: session.url };
  });

/**
 * Create a SetupIntent for in-app card update via Stripe Elements (PaymentElement).
 * Returns clientSecret + publishable key so the client can mount Elements.
 * The webhook `setup_intent.succeeded` updates the customer & subscription default PM.
 */
export const createCardSetupIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { customerId, subscriptionId } = await getAdminClubStripeIds(
      data.clubId,
      userId,
      supabase,
    );
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) throw new Error("STRIPE_PUBLISHABLE_KEY is not configured");
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      usage: "off_session",
      metadata: {
        club_id: data.clubId,
        subscription_id: subscriptionId ?? "",
        purpose: "update_payment_method",
      },
    });
    return {
      clientSecret: setupIntent.client_secret!,
      publishableKey,
      customerId,
    };
  });

/**
 * List recent invoices for the club's Stripe customer.
 */
export const listClubInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { customerId } = await getAdminClubStripeIds(data.clubId, userId, supabase);
    const stripe = getStripe();
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
    return {
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount_paid: inv.amount_paid,
        amount_due: inv.amount_due,
        currency: inv.currency,
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
      })),
    };
  });
