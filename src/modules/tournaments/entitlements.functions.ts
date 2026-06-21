import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

function safeOrigin(origin: string | undefined | null): string {
  if (origin && /^https?:\/\/([a-z0-9-]+\.)*(clubero\.app|lovable\.app|localhost)(:\d+)?$/i.test(origin)) {
    return origin;
  }
  return getOrigin();
}

/**
 * Server fn: list active entitlements + whether user can create a new tournament.
 */
export const listMyTournamentEntitlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: ents } = await supabase
      .from("tournament_entitlements")
      .select("id, plan, status, tournament_id, valid_from, valid_until, created_at")
      .eq("organizer_id", userId)
      .order("created_at", { ascending: false });

    const { data: canCreate } = await supabase.rpc("can_create_tournament", {
      _user_id: userId,
    });

    const list = ents ?? [];
    const activeAnnual = list.find(
      (e) =>
        e.plan === "annual" &&
        e.status === "active" &&
        (!e.valid_until || new Date(e.valid_until) > new Date()),
    );
    const unusedSingles = list.filter(
      (e) => e.plan === "single" && e.status === "active" && !e.tournament_id,
    );

    return {
      entitlements: list,
      canCreate: Boolean(canCreate),
      activeAnnual: activeAnnual ?? null,
      unusedSingles,
    };
  });

/**
 * Server fn: create a Stripe Checkout session for the selected tournament plan.
 * - `single`  → mode=payment    → STRIPE_PRICE_TOURNAMENT_SINGLE  (39€ one-time)
 * - `annual`  → mode=subscription → STRIPE_PRICE_TOURNAMENT_ANNUAL (149€/year)
 */
export const createTournamentPlanCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        plan: z.enum(["single", "annual"]),
        origin: z.string().url().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getStripe, STRIPE_PRICE_TOURNAMENT_SINGLE, STRIPE_PRICE_TOURNAMENT_ANNUAL } =
      await import("@/lib/stripe.server");
    const stripe = getStripe();
    const origin = safeOrigin(data.origin);
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email ?? undefined;

    const priceId =
      data.plan === "single"
        ? STRIPE_PRICE_TOURNAMENT_SINGLE
        : STRIPE_PRICE_TOURNAMENT_ANNUAL;
    if (!priceId) {
      throw new Response(
        "Plan tournoi non configuré côté serveur (Stripe price id manquant)",
        { status: 500 },
      );
    }

    const purpose = data.plan === "single" ? "tournament_single" : "tournament_annual";
    const successPath =
      data.plan === "single"
        ? `/tournaments/new-from-pass?pass=success&session_id={CHECKOUT_SESSION_ID}`
        : `/tournaments/pricing/success?session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: data.plan === "single" ? "payment" : "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${origin}${successPath}`,
      cancel_url: `${origin}/tournaments/pricing?canceled=1`,
      metadata: {
        purpose,
        organizer_id: userId,
        plan: data.plan,
      },
      ...(data.plan === "single"
        ? {
            payment_intent_data: {
              metadata: {
                purpose,
                organizer_id: userId,
                plan: data.plan,
              },
            },
          }
        : {
            subscription_data: {
              metadata: {
                purpose,
                organizer_id: userId,
                plan: data.plan,
              },
            },
          }),
    });

    return { url: session.url };
  });

/**
 * Self-heal: confirm a Stripe Checkout session and ensure an entitlement row
 * exists / is up to date (in case the webhook is delayed).
 */
export const confirmEntitlementSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ session_id: z.string().min(8).max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(data.session_id);

    if (
      session.metadata?.organizer_id &&
      session.metadata.organizer_id !== userId
    ) {
      throw new Response("Cette session ne vous appartient pas", { status: 403 });
    }
    if (session.payment_status !== "paid") {
      return {
        paid: false,
        checkoutStatus: session.status,
        paymentStatus: session.payment_status,
      };
    }

    const purpose = session.metadata?.purpose;
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

    if (purpose === "tournament_single") {
      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      // Check existence first to avoid duplicate
      const { data: existing } = await supabaseAdmin
        .from("tournament_entitlements")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("tournament_entitlements").insert({
          organizer_id: userId,
          plan: "single",
          status: "active",
          stripe_session_id: session.id,
          stripe_payment_intent_id: piId,
          stripe_customer_id: customerId,
          valid_until: null,
        });
      }
    } else if (purpose === "tournament_annual" && session.subscription) {
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      const item = sub.items.data[0];
      const validUntil = item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null;
      const validFrom = item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : new Date().toISOString();

      const { data: existing } = await supabaseAdmin
        .from("tournament_entitlements")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("tournament_entitlements")
          .update({
            status: sub.status === "active" || sub.status === "trialing" ? "active" : "canceled",
            valid_from: validFrom,
            valid_until: validUntil,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("tournament_entitlements").insert({
          organizer_id: userId,
          plan: "annual",
          status: sub.status === "active" || sub.status === "trialing" ? "active" : "canceled",
          stripe_session_id: session.id,
          stripe_subscription_id: sub.id,
          stripe_customer_id: customerId,
          valid_from: validFrom,
          valid_until: validUntil,
        });
      }
    }

    return {
      paid: true,
      checkoutStatus: session.status,
      paymentStatus: session.payment_status,
    };
  });
