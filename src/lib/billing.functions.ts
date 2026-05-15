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
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
      billing_address_collection: "required",
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
        "plan, status, current_period_end, trial_end, cancel_at_period_end, canceled_at",
      )
      .eq("club_id", data.clubId)
      .maybeSingle();

    return { subscription: sub };
  });
