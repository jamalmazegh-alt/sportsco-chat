import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getStripe,
  getPriceId,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  LEGACY_STRIPE_PRICE_MONTHLY,
  LEGACY_STRIPE_PRICE_YEARLY,
} from "./stripe.server";
import { notifySubscriptionAdmin } from "./subscription-notify.server";
import { createLogger } from "@/lib/logger.server";

const log = createLogger("billing");

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

function stripeTsToIso(ts?: number | null): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function planFromStripePriceId(priceId?: string | null): "monthly" | "yearly" | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_MONTHLY || priceId === LEGACY_STRIPE_PRICE_MONTHLY) return "monthly";
  if (priceId === STRIPE_PRICE_YEARLY || priceId === LEGACY_STRIPE_PRICE_YEARLY) return "yearly";
  return null;
}

function serializeSubscription(sub: any) {
  return sub
    ? {
        plan: sub.plan,
        status: sub.status,
        current_period_end: sub.current_period_end,
        trial_end: sub.trial_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        cancel_at: sub.cancel_at,
        canceled_at: sub.canceled_at,
        hasStripeCustomer: !!sub.stripe_customer_id,
        hasStripeSubscription: !!sub.stripe_subscription_id,
      }
    : null;
}

function isManageableStripeStatus(status: string | null | undefined) {
  return ["active", "trialing", "past_due", "incomplete"].includes(status ?? "");
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
      .select("stripe_customer_id, stripe_subscription_id, status, trial_end")
      .eq("club_id", data.clubId)
      .maybeSingle();

    const existingTrialStillValid =
      existingSub?.status === "trialing" &&
      existingSub.trial_end &&
      new Date(existingSub.trial_end).getTime() > Date.now();

    // If already active on Stripe, route to portal instead. Expired in-app
    // trials without a Stripe subscription must still be able to subscribe.
    if (
      existingSub?.stripe_subscription_id &&
      (["active", "past_due"].includes(existingSub.status ?? "") || existingTrialStillValid)
    ) {
      throw new Error("This club already has an active subscription");
    }

    const stripe = getStripe();
    const origin = getOrigin();

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

      // Persist customer id immediately (preserve trial_end / status if it exists)
      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            club_id: club.id,
            stripe_customer_id: customerId,
            status: existingSub?.status ?? "incomplete",
            trial_end: existingSub?.trial_end ?? null,
          },
          { onConflict: "club_id" },
        );
    }

    const existingStripeSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const existingManageableSub = existingStripeSubs.data
      .filter((sub) => isManageableStripeStatus(sub.status))
      .sort((a, b) => b.created - a.created)[0];
    if (existingManageableSub) {
      const item = existingManageableSub.items.data[0];
      const priceId = item?.price?.id ?? null;
      await supabaseAdmin.from("subscriptions").upsert(
        {
          club_id: club.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: existingManageableSub.id,
          stripe_price_id: priceId,
          plan: planFromStripePriceId(priceId),
          status: existingManageableSub.status,
          current_period_start: stripeTsToIso(item?.current_period_start),
          current_period_end: stripeTsToIso(item?.current_period_end),
          trial_end: stripeTsToIso(existingManageableSub.trial_end),
          cancel_at_period_end: existingManageableSub.cancel_at_period_end ?? false,
          cancel_at: stripeTsToIso(existingManageableSub.cancel_at),
          canceled_at: stripeTsToIso(existingManageableSub.canceled_at),
        },
        { onConflict: "club_id" },
      );
      return { url: `${origin}/admin/billing?billing=success` };
    }

    // Honour remaining in-app trial: if trial_end is still in the future,
    // give Stripe the remaining days so the user isn't billed immediately.
    // Otherwise (trial expired or no trial), bill right away — no Stripe trial.
    let trialPeriodDays: number | undefined = undefined;
    if (existingSub?.trial_end) {
      const remainingMs = new Date(existingSub.trial_end).getTime() - Date.now();
      const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      if (remainingDays > 0) trialPeriodDays = Math.min(remainingDays, 30);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getPriceId(data.plan), quantity: 1 }],
      subscription_data: {
        ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
        metadata: { club_id: club.id, plan: data.plan },
      },
      // VAT multi-pays : Stripe collecte l'adresse de facturation, calcule
      // automatiquement la TVA selon le pays/état et la persiste sur le client.
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      allow_promotion_codes: true,
      success_url: `${origin}/admin/billing?billing=success`,
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
 * Best-effort recovery when the user returns from Checkout before the webhook
 * has updated our database (or when Stripe webhook signing is misconfigured).
 */
export const syncClubSubscriptionFromStripe = createServerFn({ method: "POST" })
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

    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("club_id", data.clubId)
      .maybeSingle();

    if (!existingSub?.stripe_customer_id) return { subscription: null, synced: false };

    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: existingSub.stripe_customer_id,
      status: "all",
      limit: 10,
      expand: ["data.customer"],
    });
    const fresh = subscriptions.data
      .filter((sub) =>
        ["active", "trialing", "past_due", "incomplete"].includes(sub.status) ||
        sub.metadata?.club_id === data.clubId,
      )
      .sort((a, b) => b.created - a.created)[0];

    if (!fresh) return { subscription: null, synced: false };

    if (fresh.metadata?.club_id !== data.clubId) {
      await stripe.subscriptions.update(fresh.id, {
        metadata: { ...fresh.metadata, club_id: data.clubId },
      });
    }

    const item = fresh.items.data[0];
    const priceId = item?.price?.id ?? null;
    const patch = {
      club_id: data.clubId,
      stripe_customer_id: existingSub.stripe_customer_id,
      stripe_subscription_id: fresh.id,
      stripe_price_id: priceId,
      plan: planFromStripePriceId(priceId),
      status: fresh.status,
      current_period_start: stripeTsToIso(item?.current_period_start),
      current_period_end: stripeTsToIso(item?.current_period_end),
      trial_end: stripeTsToIso(fresh.trial_end),
      cancel_at_period_end: fresh.cancel_at_period_end ?? false,
      cancel_at: stripeTsToIso(fresh.cancel_at),
      canceled_at: stripeTsToIso(fresh.canceled_at),
    };

    await supabaseAdmin.from("subscriptions").upsert(patch, { onConflict: "club_id" });

    return {
      subscription: serializeSubscription({ ...patch, hasStripeSubscription: true }),
      synced: true,
    };
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
        "plan, status, current_period_end, trial_end, cancel_at_period_end, cancel_at, canceled_at, stripe_customer_id, stripe_subscription_id",
      )
      .eq("club_id", data.clubId)
      .maybeSingle();

    return { subscription: serializeSubscription(sub) };
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
    try {
      const fresh = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["customer"] });
      await notifySubscriptionAdmin("cancellation_scheduled", fresh, data.clubId);
    } catch (err) {
      log.error("notify_cancellation_scheduled_failed", { err });
    }
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
    try {
      const fresh = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["customer"] });
      await notifySubscriptionAdmin("reactivated", fresh, data.clubId);
    } catch (err) {
      log.error("notify_reactivated_failed", { err });
    }
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
    const { customerId, subscriptionId } = await getAdminClubStripeIds(data.clubId, userId, supabase);
    const stripe = getStripe();
    const invoices = await stripe.invoices.list(
      subscriptionId
        ? { customer: customerId, subscription: subscriptionId, limit: 12 }
        : { customer: customerId, limit: 12 },
    );
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
