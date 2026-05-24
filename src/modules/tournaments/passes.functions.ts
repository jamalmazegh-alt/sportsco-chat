import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify, uniqueTournamentSlug } from "./lib/slug";


function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
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
    const origin = getOrigin();
    const quantity = data.quantity ?? 1;

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
      customer_email: data.email,
      line_items: [{ price: STRIPE_PRICE_TOURNAMENT, quantity }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${origin}${successPath}`,
      cancel_url: `${origin}/pricing?pass=canceled`,
      metadata: {
        purpose: "tournament_pass",
        email: data.email,
        quantity: String(quantity),
      },
      payment_intent_data: {
        metadata: {
          purpose: "tournament_pass",
          email: data.email,
          quantity: String(quantity),
        },
      },
    });

    // Pre-create one row per pass so we have N independent, usable passes.
    const rows = Array.from({ length: quantity }, () => ({
      email: data.email,
      stripe_session_id: session.id,
      amount_total: 4000,
      currency: "eur",
      status: "pending" as const,
    }));
    await supabaseAdmin.from("tournament_passes").insert(rows);

    return { url: session.url };
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

    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .insert({
        club_id: null,
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

