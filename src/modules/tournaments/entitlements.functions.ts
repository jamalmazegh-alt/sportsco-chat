import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

function safeOrigin(origin: string | undefined | null): string {
  if (
    origin &&
    /^https?:\/\/([a-z0-9-]+\.)*(clubero\.app|lovable\.app|localhost)(:\d+)?$/i.test(origin)
  ) {
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
      data.plan === "single" ? STRIPE_PRICE_TOURNAMENT_SINGLE : STRIPE_PRICE_TOURNAMENT_ANNUAL;
    if (!priceId) {
      throw new Response("Plan tournoi non configuré côté serveur (Stripe price id manquant)", {
        status: 500,
      });
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
  .inputValidator((input) => z.object({ session_id: z.string().min(8).max(255) }).parse(input))
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(data.session_id);

    if (session.metadata?.organizer_id && session.metadata.organizer_id !== userId) {
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
      typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);

    if (purpose === "tournament_single") {
      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

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
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
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

import { slugify, uniqueTournamentSlug } from "./lib/slug";
import { defaultRulesForSport } from "./lib/rules";

/**
 * Create a personal tournament backed by an active entitlement (single or annual).
 * - Double-checks `can_create_tournament` server-side (defense in depth).
 * - Consumes one single entitlement (no-op for annual / superadmin).
 */
export const createTournamentFromEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(2).max(120),
        sport: z.string().min(1).max(40),
        category: z.string().max(80).optional().nullable(),
        starts_on: z.string(),
        ends_on: z.string().optional().nullable(),
        format: z.enum(["group", "knockout", "mixed"]),
        num_teams: z.number().int().min(2).max(64),
        location: z.string().max(200).optional().nullable(),
      })
      .refine((d) => !d.ends_on || d.ends_on >= d.starts_on, {
        message: "End date must be on or after start date",
        path: ["ends_on"],
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    // Defense in depth: re-check server-side
    const { data: canCreate } = await supabaseAdmin.rpc("can_create_tournament", {
      _user_id: userId,
    });
    if (!canCreate) {
      throw new Response("Aucun crédit tournoi disponible. Choisissez un plan.", { status: 402 });
    }

    const slug = await uniqueTournamentSlug(supabaseAdmin, slugify(data.name));

    let personalClubId: string | null = null;
    try {
      const { data: clubIdRow } = await supabaseAdmin.rpc("get_or_create_personal_club", {
        _user_id: userId,
      });
      if (typeof clubIdRow === "string") personalClubId = clubIdRow;
    } catch {
      personalClubId = null;
    }

    const initialRules = defaultRulesForSport(data.sport);
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .insert({
        club_id: personalClubId,
        name: data.name,
        slug,
        sport: data.sport,
        category: data.category ?? null,
        starts_on: data.starts_on,
        ends_on: data.ends_on ?? null,
        format: data.format,
        num_teams: data.num_teams,
        location: data.location ?? null,
        created_by: userId,
        status: "draft",
        settings: initialRules as never,
        points_win: initialRules.points.win,
        points_draw: initialRules.points.draw,
        points_loss: initialRules.points.loss,
        tiebreakers: initialRules.tiebreakers,
      })
      .select("*")
      .single();
    if (tErr) throw new Response(tErr.message, { status: 400 });

    // Consume one single entitlement if applicable (no-op for annual / superadmin).
    // If this fails for any reason, we keep the tournament — defense-in-depth check above ensures eligibility.
    try {
      await supabaseAdmin.rpc("consume_single_entitlement", {
        _user_id: userId,
        _tournament_id: tournament.id,
      });
    } catch (e) {
      console.warn("consume_single_entitlement failed (non-fatal)", e);
    }

    return { tournament };
  });

/**
 * Ensure the signed-in user has a personal organizer club, returning its id.
 * Used by the unified TournamentCreateChooser to feed `clubId` to the wizard
 * for pass-only users (no real club).
 */
export const ensurePersonalClubId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const { data, error } = await supabaseAdmin.rpc("get_or_create_personal_club", {
      _user_id: userId,
    });
    if (error) throw new Response(error.message, { status: 500 });
    if (typeof data !== "string")
      throw new Response("Could not resolve personal club", { status: 500 });
    return { clubId: data };
  });
