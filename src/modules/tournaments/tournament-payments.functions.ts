// Tournament payment server functions.
// SECURITY: All money/fee values are recomputed server-side. Never trust
// amounts coming from the client. All admin actions require can_manage_tournament.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import { createLogger } from "@/lib/logger.server";
import {
  buildCheckoutForRegistration,
  logPaymentEvent,
} from "./tournament-payments.server";

export { buildCheckoutForRegistration };

const log = createLogger("tournament-payments");

const PAYMENT_MODES = ["online", "offline", "both"] as const;
const CURRENCIES = ["eur", "usd", "gbp", "chf", "cad"] as const;

async function assertCanManage(
  supabase: any,
  userId: string,
  tournamentId: string,
): Promise<{ tournament: any }> {
  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) throw new Response("Not found", { status: 404 });
  const { data: ok } = await supabase.rpc("can_manage_tournament", {
    _user_id: userId,
    _tournament_id: tournamentId,
  });
  if (!ok) throw new Response("Forbidden", { status: 403 });
  return { tournament: t };
}


// ---------- Admin: configure fee + payment mode

export const updateTournamentPaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        registration_fee: z.number().int().min(0).max(1_000_000),
        registration_currency: z.enum(CURRENCIES).default("eur"),
        registration_fee_description: z
          .string()
          .trim()
          .max(500)
          .nullable()
          .optional(),
        payment_mode: z.enum(PAYMENT_MODES).default("offline"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    const { error } = await supabaseAdmin
      .from("tournaments")
      .update({
        registration_fee: data.registration_fee,
        registration_currency: data.registration_currency,
        registration_fee_description: data.registration_fee_description ?? null,
        payment_mode: data.payment_mode,
      })
      .eq("id", data.tournament_id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// ---------- Admin: list registrations enriched with payment info

export const listTournamentRegistrationsWithPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tournament_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId, data.tournament_id);
    const { data: rows } = await supabaseAdmin
      .from("tournament_registrations")
      .select(
        "id, payment_status, amount_paid, currency, paid_at, refunded_at, refund_reason, marked_paid_at, stripe_payment_intent_id, stripe_charge_id",
      )
      .eq("tournament_id", data.tournament_id);
    return { payments: rows ?? [] };
  });

// ---------- Admin: mark offline payment as received

export const markRegistrationPaidOffline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registration_id: z.string().uuid(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reg } = await supabaseAdmin
      .from("tournament_registrations")
      .select("id, tournament_id, payment_status, contact_email, team_name")
      .eq("id", data.registration_id)
      .maybeSingle();
    if (!reg) throw new Response("Not found", { status: 404 });
    await assertCanManage(supabase, userId, reg.tournament_id);

    if (
      reg.payment_status === "paid_online" ||
      reg.payment_status === "paid_offline" ||
      reg.payment_status === "refunded"
    ) {
      throw new Response("Already settled", { status: 400 });
    }

    const { data: t } = await supabaseAdmin
      .from("tournaments")
      .select("registration_fee, registration_currency")
      .eq("id", reg.tournament_id)
      .single();

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("tournament_registrations")
      .update({
        payment_status: "paid_offline",
        amount_paid: t?.registration_fee ?? 0,
        currency: t?.registration_currency ?? "eur",
        marked_paid_at: now,
        marked_paid_by: userId,
        paid_at: now,
      })
      .eq("id", reg.id);
    if (error) throw new Response(error.message, { status: 400 });

    await logPaymentEvent(
      reg.tournament_id,
      reg.id,
      "marked_paid_offline",
      t?.registration_fee ?? 0,
      { by: userId, note: data.note ?? null, team_name: reg.team_name },
    );

    return { ok: true };
  });

// ---------- Admin: refund a Stripe-paid registration

export const refundRegistrationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registration_id: z.string().uuid(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reg } = await supabaseAdmin
      .from("tournament_registrations")
      .select(
        "id, tournament_id, payment_status, stripe_payment_intent_id, stripe_charge_id, amount_paid",
      )
      .eq("id", data.registration_id)
      .maybeSingle();
    if (!reg) throw new Response("Not found", { status: 404 });
    await assertCanManage(supabase, userId, reg.tournament_id);

    if (reg.payment_status !== "paid_online") {
      throw new Response(
        "Only Stripe-paid registrations can be refunded",
        { status: 400 },
      );
    }
    if (!reg.stripe_payment_intent_id && !reg.stripe_charge_id) {
      throw new Response("Missing Stripe reference", { status: 400 });
    }

    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: reg.stripe_payment_intent_id ?? undefined,
      charge: reg.stripe_payment_intent_id ? undefined : reg.stripe_charge_id ?? undefined,
      reason: "requested_by_customer",
      refund_application_fee: true,
      reverse_transfer: true,
      metadata: {
        registration_id: reg.id,
        tournament_id: reg.tournament_id,
        admin_user_id: userId,
      },
    });

    await logPaymentEvent(
      reg.tournament_id,
      reg.id,
      "refund_initiated",
      reg.amount_paid ?? 0,
      { refund_id: refund.id, reason: data.reason ?? null, by: userId },
    );

    // status is updated when charge.refunded webhook lands; but reflect locally too
    await supabaseAdmin
      .from("tournament_registrations")
      .update({
        payment_status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_reason: data.reason ?? null,
      })
      .eq("id", reg.id);

    return { ok: true, refund_id: refund.id };
  });

// ---------- Public-facing helper: create Stripe Checkout for a registration

// buildCheckoutForRegistration moved to tournament-payments.server.ts
// and re-exported above. This keeps server routes free of the createServerFn
// graph (avoids production build OOM).


// ---------- Public: retrieve an in-flight checkout url (retry/resume)

export const startRegistrationCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        registration_id: z.string().uuid(),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const result = await buildCheckoutForRegistration({
      registrationId: data.registration_id,
      origin: data.origin,
    });
    if (!result) {
      throw new Response("Checkout unavailable", { status: 400 });
    }
    return result;
  });

// ---------- Admin: create / refresh shareable payment link (7 days)

const LINK_TTL_DAYS = 7;

function buildPublicPaymentUrl(origin: string, slug: string, registrationId: string) {
  return `${origin.replace(/\/$/, "")}/t/${encodeURIComponent(slug)}/pay/${registrationId}`;
}

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: (currency || "eur").toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export const createRegistrationPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        registration_id: z.string().uuid(),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    const { data: reg } = await supabaseAdmin
      .from("tournament_registrations")
      .select("id, tournament_id, payment_status")
      .eq("id", data.registration_id)
      .eq("tournament_id", data.tournament_id)
      .maybeSingle();
    if (!reg) throw new Response("Not found", { status: 404 });
    if (reg.payment_status !== "pending") {
      throw new Response("Registration is not awaiting payment", { status: 400 });
    }

    const { data: t } = await supabaseAdmin
      .from("tournaments")
      .select("id, slug, club_id, registration_fee, payment_mode")
      .eq("id", data.tournament_id)
      .single();
    if (!t || !t.registration_fee || t.registration_fee <= 0) {
      throw new Response("Tournament has no fee", { status: 400 });
    }
    if (t.payment_mode === "offline") {
      throw new Response("Tournament does not accept online payment", { status: 400 });
    }
    if (!t.club_id) {
      throw new Response("Online payment requires a club", { status: 400 });
    }
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("stripe_account_id, stripe_charges_enabled")
      .eq("id", t.club_id)
      .single();
    if (!club?.stripe_account_id || !club.stripe_charges_enabled) {
      throw new Response("Club Stripe account not ready", { status: 400 });
    }

    const url = buildPublicPaymentUrl(data.origin, t.slug, reg.id);
    const now = new Date();
    const expires = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 3600 * 1000);

    const { error } = await supabaseAdmin
      .from("tournament_registrations")
      .update({
        payment_link: url,
        payment_link_created_at: now.toISOString(),
        payment_link_expires_at: expires.toISOString(),
      })
      .eq("id", reg.id);
    if (error) throw new Response(error.message, { status: 400 });

    return { url, expires_at: expires.toISOString() };
  });

// ---------- Admin: send the payment link (email or WhatsApp pre-fill)

export const sendPaymentLinkToTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        registration_id: z.string().uuid(),
        channel: z.enum(["email", "whatsapp", "copy"]),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManage(supabase, userId, data.tournament_id);

    const { data: reg } = await supabaseAdmin
      .from("tournament_registrations")
      .select(
        "id, tournament_id, team_name, contact_email, contact_phone, payment_status, payment_link, payment_link_expires_at",
      )
      .eq("id", data.registration_id)
      .eq("tournament_id", data.tournament_id)
      .maybeSingle();
    if (!reg) throw new Response("Not found", { status: 404 });
    if (reg.payment_status !== "pending") {
      throw new Response("Registration is not awaiting payment", { status: 400 });
    }

    const { data: t } = await supabaseAdmin
      .from("tournaments")
      .select("id, name, slug, registration_fee, registration_currency, payment_mode, club_id")
      .eq("id", data.tournament_id)
      .single();
    if (!t || !t.registration_fee || t.registration_fee <= 0) {
      throw new Response("Tournament has no fee", { status: 400 });
    }

    // Reuse or regenerate the link
    let link = reg.payment_link as string | null;
    const expired =
      !reg.payment_link_expires_at ||
      new Date(reg.payment_link_expires_at).getTime() < Date.now();
    if (!link || expired) {
      const now = new Date();
      const expires = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 3600 * 1000);
      link = buildPublicPaymentUrl(data.origin, t.slug, reg.id);
      const { error } = await supabaseAdmin
        .from("tournament_registrations")
        .update({
          payment_link: link,
          payment_link_created_at: now.toISOString(),
          payment_link_expires_at: expires.toISOString(),
        })
        .eq("id", reg.id);
      if (error) throw new Response(error.message, { status: 400 });
    }

    const amountLabel = formatMoney(t.registration_fee, t.registration_currency ?? "eur");
    const sentAt = new Date().toISOString();

    if (data.channel === "email") {
      if (!reg.contact_email) {
        throw new Response("Team has no contact email", { status: 400 });
      }
      const { enqueueTransactionalEmailServer } = await import(
        "@/lib/email/send.server"
      );
      await enqueueTransactionalEmailServer({
        templateName: "tournament-payment-request",
        recipientEmail: reg.contact_email,
        templateData: {
          teamName: reg.team_name,
          tournamentName: t.name,
          amountLabel,
          paymentUrl: link!,
          expiresInDays: LINK_TTL_DAYS,
        },
        idempotencyKey: `tournament-payment-${reg.id}-${Date.now()}`,
      });
      await supabaseAdmin
        .from("tournament_registrations")
        .update({ payment_link_sent_via: "email", payment_link_sent_at: sentAt })
        .eq("id", reg.id);
      await logPaymentEvent(
        t.id,
        reg.id,
        "checkout_created",
        t.registration_fee,
        { payment_link_sent: "email", to: reg.contact_email },
      );
      return { ok: true, channel: "email", link };
    }

    if (data.channel === "whatsapp") {
      const phone = (reg.contact_phone || "").replace(/[^\d]/g, "");
      const message =
        `Bonjour ${reg.team_name} 👋\n` +
        `Voici le lien de paiement pour votre inscription à ${t.name} (${amountLabel}) :\n` +
        `${link}\n` +
        `Ce lien est valable ${LINK_TTL_DAYS} jours.`;
      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      await supabaseAdmin
        .from("tournament_registrations")
        .update({ payment_link_sent_via: "whatsapp", payment_link_sent_at: sentAt })
        .eq("id", reg.id);
      return { ok: true, channel: "whatsapp", link, whatsappUrl: waUrl, message };
    }

    // copy
    await supabaseAdmin
      .from("tournament_registrations")
      .update({ payment_link_sent_via: "copy", payment_link_sent_at: sentAt })
      .eq("id", reg.id);
    return { ok: true, channel: "copy", link };
  });


// ---------- Webhook helpers (called from stripe-webhook.ts)

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
