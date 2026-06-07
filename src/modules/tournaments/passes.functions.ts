import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify, uniqueTournamentSlug } from "./lib/slug";
import { defaultRulesForSport } from "./lib/rules";


function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

function readQuantity(value: string | undefined | null): number {
  const n = parseInt(value ?? "1", 10);
  return Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 1;
}

/**
 * Create a Stripe Checkout session (one-time payment, 40 €) for a Tournament Pass.
 * Public: no auth required — the buyer just provides an email.
 */
export const createTournamentPassCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(255),
        quantity: z.number().int().min(1).max(20).optional(),
        origin: z
          .string()
          .url()
          .max(200)
          .optional(),
        return_to: z
          .string()
          .max(200)
          .regex(/^\/[a-zA-Z0-9/_-]*$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getStripe, STRIPE_PRICE_TOURNAMENT } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();
    // Prefer the caller's origin so Stripe redirects back to the same host
    // (app subdomain vs marketing). Only accept trusted clubero.app hosts.
    const safeOrigin = data.origin && /^https?:\/\/([a-z0-9-]+\.)*(clubero\.app|lovable\.app|localhost)(:\d+)?$/i.test(data.origin)
      ? data.origin
      : null;
    const origin = safeOrigin ?? getOrigin();

    const quantity = data.quantity ?? 1;
    const email = data.email.trim().toLowerCase();

    // Only allow safe in-app return paths
    const safeReturnTo =
      data.return_to && data.return_to.startsWith("/tournaments/")
        ? data.return_to
        : null;
    const successPath = safeReturnTo
      ? `${safeReturnTo}?pass=success&session_id={CHECKOUT_SESSION_ID}`
      : `/tournaments/pass-success?session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [{ price: STRIPE_PRICE_TOURNAMENT, quantity }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${origin}${successPath}`,
      cancel_url: `${origin}/pricing?pass=canceled`,
      metadata: {
        purpose: "tournament_pass",
        email,
        quantity: String(quantity),
      },
      payment_intent_data: {
        metadata: {
          purpose: "tournament_pass",
          email,
          quantity: String(quantity),
        },
      },
    });

    // Pre-create one row per pass so we have N independent, usable passes.
    const rows = Array.from({ length: quantity }, () => ({
      email,
      stripe_session_id: session.id,
      amount_total: 4000,
      currency: "eur",
      status: "pending" as const,
    }));
    await supabaseAdmin.from("tournament_passes").insert(rows);

    return { url: session.url };
  });

/**
 * Self-heal endpoint: given a Stripe Checkout session_id (from the success
 * redirect), call Stripe to verify the payment status and mark the matching
 * `tournament_passes` rows as paid. This avoids waiting on the webhook when
 * Stripe is slow or the webhook delivery failed.
 */
export const confirmPassSession = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ session_id: z.string().min(8).max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(data.session_id);
    if (session.payment_status !== "paid") {
      return {
        paid: false,
        checkoutStatus: session.status,
        paymentStatus: session.payment_status,
      };
    }
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const buyerEmail =
      session.customer_details?.email ??
      session.customer_email ??
      session.metadata?.email ??
      null;
    const qty = readQuantity(session.metadata?.quantity);
    const totalCents = session.amount_total ?? 4000 * qty;
    const perPass = Math.round(totalCents / qty);

    if (!buyerEmail) {
      throw new Response("Impossible de retrouver l'e-mail du paiement", { status: 400 });
    }

    // Only update rows that haven't been processed yet — webhook may race us.
    const { data: existing } = await supabaseAdmin
      .from("tournament_passes")
      .select("id, status")
      .eq("stripe_session_id", session.id);
    const pending = (existing ?? []).filter((r) => r.status === "pending");
    const paidAt = new Date().toISOString();
    let created = 0;

    // If the pre-creation insert failed or the webhook only received the paid
    // event, recreate missing pass rows directly from the verified Stripe session.
    const missing = Math.max(0, qty - (existing?.length ?? 0));
    if (missing > 0) {
      const rows = Array.from({ length: missing }, () => ({
        email: buyerEmail.toLowerCase(),
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        amount_total: perPass,
        currency: session.currency ?? "eur",
        status: "paid" as const,
        paid_at: paidAt,
      }));
      const { error } = await supabaseAdmin.from("tournament_passes").insert(rows);
      if (error) throw new Response(error.message, { status: 400 });
      created = missing;
    }

    if (pending.length > 0) {
      const { error } = await supabaseAdmin
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
      if (error) throw new Response(error.message, { status: 400 });
    }

    return {
      paid: true,
      updated: pending.length,
      created,
      checkoutStatus: session.status,
      paymentStatus: session.payment_status,
    };
  });


/**
 * List available (paid, unused) passes for the current user — matched by user_id or email.
 */
export const listMyAvailablePasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email ?? null;

    // Auto-link any pass paid with this email to the user
    if (email) {
      await supabaseAdmin
        .from("tournament_passes")
        .update({ user_id: userId })
        .is("user_id", null)
        .eq("status", "paid")
        .ilike("email", email);
    }

    // Build .or() filter safely. Supabase PostgREST .or() uses commas as
    // separators and parentheses to group — sanitize email accordingly. Also
    // escape `%`, `_` and `*` to avoid unintended ilike wildcards.
    const baseFilter = `user_id.eq.${userId}`;
    let orFilter = baseFilter;
    if (email) {
      const safeEmail = email
        .replace(/[(),]/g, "") // strip PostgREST grouping/separator chars
        .replace(/[%_*]/g, (m) => `\\${m}`); // escape ilike wildcards
      orFilter = `${baseFilter},email.ilike.${safeEmail}`;
    }

    const { data, error } = await supabaseAdmin
      .from("tournament_passes")
      .select("id, email, status, paid_at, tournament_id")
      .eq("status", "paid")
      .is("tournament_id", null)
      .or(orFilter)
      .order("paid_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });
    return { passes: data ?? [] };
  });

/**
 * Create a personal tournament (no club) by consuming a paid pass.
 */
export const createTournamentFromPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        pass_id: z.string().uuid(),
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
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email ?? null;

    // Validate pass: owned by user (or matches email), paid, unused
    const { data: pass, error: passErr } = await supabaseAdmin
      .from("tournament_passes")
      .select("*")
      .eq("id", data.pass_id)
      .maybeSingle();
    if (passErr) throw new Response(passErr.message, { status: 400 });
    if (!pass) throw new Response("Pass introuvable", { status: 404 });
    if (pass.status !== "paid") {
      throw new Response("Pass non valide (paiement non confirmé)", { status: 400 });
    }
    if (pass.tournament_id) {
      throw new Response("Ce pass a déjà été utilisé", { status: 400 });
    }
    const matchesUser =
      pass.user_id === userId ||
      (email && pass.email && pass.email.toLowerCase() === email.toLowerCase());
    if (!matchesUser) {
      throw new Response("Ce pass n'appartient pas à votre compte", { status: 403 });
    }

    const slug = await uniqueTournamentSlug(supabaseAdmin, slugify(data.name));

    // Ensure the organizer has a personal club to host Stripe Connect, branding,
    // and admin settings. Falls back to null if creation fails for any reason.
    let personalClubId: string | null = null;
    try {
      const { data: clubIdRow } = await supabaseAdmin.rpc(
        "get_or_create_personal_club",
        { _user_id: userId },
      );
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
        settings: initialRules as any,
        points_win: initialRules.points.win,
        points_draw: initialRules.points.draw,
        points_loss: initialRules.points.loss,
        tiebreakers: initialRules.tiebreakers,
      })
      .select("*")
      .single();
    if (tErr) throw new Response(tErr.message, { status: 400 });

    // Atomically consume the pass: only succeeds if no one else has claimed it.
    // The WHERE on tournament_id IS NULL + status = 'paid' guarantees that
    // concurrent calls cannot both consume the same pass.
    const { data: consumed, error: consumeErr } = await supabaseAdmin
      .from("tournament_passes")
      .update({
        status: "used",
        tournament_id: tournament.id,
        used_at: new Date().toISOString(),
        user_id: userId,
      })
      .eq("id", pass.id)
      .eq("status", "paid")
      .is("tournament_id", null)
      .select("id")
      .maybeSingle();

    if (consumeErr || !consumed) {
      // Race lost — rollback the created tournament so the pass winner keeps integrity.
      await supabaseAdmin.from("tournaments").delete().eq("id", tournament.id);
      throw new Response("Ce pass a déjà été utilisé", { status: 409 });
    }

    return { tournament };
  });

