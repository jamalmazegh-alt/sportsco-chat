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
      line_items: [{ price: STRIPE_PRICE_TOURNAMENT, quantity: 1 }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${origin}${successPath}`,
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

    await supabaseAdmin.from("tournament_passes").insert({
      email: data.email,
      stripe_session_id: session.id,
      amount_total: 4000,
      currency: "eur",
      status: "pending",
    });

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

    const { data, error } = await supabaseAdmin
      .from("tournament_passes")
      .select("id, email, status, paid_at, tournament_id")
      .eq("status", "paid")
      .is("tournament_id", null)
      .or(
        email
          ? `user_id.eq.${userId},email.ilike.${email}`
          : `user_id.eq.${userId}`,
      )
      .order("paid_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });
    return { passes: data ?? [] };
  });

async function uniqueSlug(
  supabaseAdmin: any,
  base: string,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${shortRandomSuffix()}`;
    const { data } = await supabaseAdmin
      .from("tournaments")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${shortRandomSuffix()}`;
}

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

    const slug = await uniqueSlug(supabaseAdmin, slugify(data.name));

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

    // Consume pass
    await supabaseAdmin
      .from("tournament_passes")
      .update({
        status: "used",
        tournament_id: tournament.id,
        used_at: new Date().toISOString(),
        user_id: userId,
      })
      .eq("id", pass.id);

    return { tournament };
  });
