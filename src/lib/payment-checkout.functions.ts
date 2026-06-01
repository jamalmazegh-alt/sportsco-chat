import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import { computeFeeForClub } from "@/lib/platform-fee";
import { createLogger } from "@/lib/logger.server";
import { generateReceiptPdf, signedReceiptUrl } from "@/lib/payment-receipt.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const log = createLogger("payment-checkout");

const MANUAL_METHODS = ["cash", "cheque", "bank_transfer", "manual"] as const;

async function assertFinAdmin(
  supabase: SupabaseClient,
  userId: string,
  clubId: string,
): Promise<void> {
  const { data } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  const isAdmin =
    !!data && ((data.roles ?? []).includes("admin") || data.role === "admin");
  if (isAdmin) return;
  const { data: isFin } = await supabaseAdmin.rpc("has_club_role_text", {
    _user_id: userId,
    _club_id: clubId,
    _role: "financial_admin",
  });
  if (isFin === true) return;
  throw new Error("Only club admins or financial admins can record payments");
}

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

async function hasActiveSubscription(clubId: string): Promise<boolean> {
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, trial_end, current_period_end")
    .eq("club_id", clubId)
    .maybeSingle();
  const now = Date.now();
  return (
    !!sub &&
    ((sub.status === "trialing" &&
      sub.trial_end &&
      new Date(sub.trial_end).getTime() > now) ||
      ((sub.status === "active" || sub.status === "past_due") &&
        (!sub.current_period_end ||
          new Date(sub.current_period_end).getTime() > now)))
  );
}

async function sumPaid(obligationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("payment_transactions")
    .select("amount_gross_cents")
    .eq("obligation_id", obligationId)
    .eq("status", "succeeded");
  return (data ?? []).reduce((s, r) => s + (r.amount_gross_cents ?? 0), 0);
}

async function maybeIssueReceipt(transactionId: string): Promise<void> {
  // Idempotent: skip if a receipt already exists for this transaction
  const { data: existing } = await supabaseAdmin
    .from("payment_receipts")
    .select("id")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (existing) return;

  const { data: tx } = await supabaseAdmin
    .from("payment_transactions")
    .select(
      "id, obligation_id, club_id, method, amount_gross_cents, currency, status",
    )
    .eq("id", transactionId)
    .maybeSingle();
  if (!tx || tx.status !== "succeeded") return;

  const { data: obl } = await supabaseAdmin
    .from("payment_obligations")
    .select(
      "id, payer_user_id, player_id, payment_item_id",
    )
    .eq("id", tx.obligation_id)
    .maybeSingle();
  if (!obl) return;

  const { data: item } = await supabaseAdmin
    .from("payment_items")
    .select("title")
    .eq("id", obl.payment_item_id)
    .maybeSingle();

  const [{ data: payer }, { data: player }] = await Promise.all([
    obl.payer_user_id
      ? supabaseAdmin
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", obl.payer_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    obl.player_id
      ? supabaseAdmin
          .from("players")
          .select("first_name, last_name")
          .eq("id", obl.player_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: numRow } = await supabaseAdmin.rpc("next_receipt_number", {
    _club_id: tx.club_id,
  });
  const receiptNumber = (numRow as unknown as number) ?? 0;

  const { data: inserted } = await supabaseAdmin
    .from("payment_receipts")
    .insert({
      club_id: tx.club_id,
      transaction_id: tx.id,
      obligation_id: obl.id,
      receipt_number: receiptNumber,
      kind: "confirmation",
      payer_name: payer
        ? `${payer.first_name ?? ""} ${payer.last_name ?? ""}`.trim() || null
        : null,
      player_name: player
        ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
        : null,
      item_title: item?.title ?? null,
      amount_gross_cents: tx.amount_gross_cents,
      currency: tx.currency,
      method: tx.method,
    })
    .select("id")
    .single();
  if (!inserted) return;

  // Generate the PDF + send email — best-effort, never block the transaction
  try {
    const pdfPath = await generateReceiptPdf(inserted.id);
    const url = pdfPath ? await signedReceiptUrl(pdfPath) : null;

    // Locate recipient email
    let recipientEmail: string | null = null;
    if (obl.payer_user_id) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(obl.payer_user_id);
      recipientEmail = u?.user?.email ?? null;
    }
    if (!recipientEmail && obl.player_id) {
      const { data: guardians } = await supabaseAdmin
        .from("player_guardians")
        .select("user_id, is_primary_payer")
        .eq("player_id", obl.player_id)
        .order("is_primary_payer", { ascending: false });
      for (const g of guardians ?? []) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(g.user_id);
        if (u?.user?.email) {
          recipientEmail = u.user.email;
          break;
        }
      }
    }

    if (recipientEmail) {
      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("name")
        .eq("id", tx.club_id)
        .maybeSingle();
      const methodLabel =
        ({
          stripe: "Carte (Stripe)",
          helloasso: "HelloAsso",
          cash: "Espèces",
          cheque: "Chèque",
          bank_transfer: "Virement bancaire",
          manual: "Manuel",
        } as Record<string, string>)[tx.method] ?? tx.method;
      await enqueueTransactionalEmailServer({
        templateName: "payment-receipt",
        recipientEmail,
        idempotencyKey: `receipt-${inserted.id}`,
        templateData: {
          clubName: club?.name ?? "Votre club",
          payerName: payer
            ? `${payer.first_name ?? ""} ${payer.last_name ?? ""}`.trim() || null
            : null,
          playerName: player
            ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
            : null,
          itemTitle: item?.title ?? "Paiement",
          amountLabel: `${(tx.amount_gross_cents / 100).toFixed(2)} ${(tx.currency || "eur").toUpperCase()}`,
          methodLabel,
          receiptNumber: String(receiptNumber).padStart(6, "0"),
          paidAt: new Date().toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          downloadUrl: url,
        },
      });
    }
  } catch (err) {
    log.error("Failed to generate/send receipt", {
      receiptId: inserted.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ----------------------- PARENT: LIST MY OBLIGATIONS ----------------------- */

export const listMyObligations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const userId = context.userId;
    // Obligations directly attached to the user, or via a guardian link
    const { data: guardLinks } = await supabaseAdmin
      .from("player_guardians")
      .select("player_id")
      .eq("user_id", userId);
    const playerIds = (guardLinks ?? []).map((g) => g.player_id);

    const { data } = await supabaseAdmin
      .from("payment_obligations")
      .select(
        `id, payment_item_id, club_id, player_id, payer_user_id,
         amount_due_cents, currency, status, created_at,
         items:payment_item_id (id, title, type, due_date, provider, allow_partial, status),
         clubs:club_id (id, name, stripe_account_id, stripe_charges_enabled),
         players:player_id (id, first_name, last_name)`,
      )
      .or(
        `payer_user_id.eq.${userId}${playerIds.length ? `,player_id.in.(${playerIds.join(",")})` : ""}`,
      )
      .in("status", ["pending", "partially_paid"])
      .order("created_at", { ascending: false });

    const list = data ?? [];
    // For each, compute amount already paid
    const ids = list.map((o) => o.id);
    let paidByObl = new Map<string, number>();
    if (ids.length > 0) {
      const { data: txs } = await supabaseAdmin
        .from("payment_transactions")
        .select("obligation_id, amount_gross_cents")
        .in("obligation_id", ids)
        .eq("status", "succeeded");
      txs?.forEach((t) => {
        paidByObl.set(
          t.obligation_id,
          (paidByObl.get(t.obligation_id) ?? 0) + (t.amount_gross_cents ?? 0),
        );
      });
    }

    return {
      obligations: list.map((o) => ({
        ...o,
        amount_paid_cents: paidByObl.get(o.id) ?? 0,
      })),
    };
  });

/* --------------------- PARENT: STRIPE CHECKOUT --------------------- */

export const createObligationCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        obligationId: z.string().uuid(),
        amountCents: z.number().int().positive().optional(), // partial when set
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: obl } = await supabaseAdmin
      .from("payment_obligations")
      .select(
        "id, club_id, payer_user_id, player_id, payment_item_id, amount_due_cents, currency, status",
      )
      .eq("id", data.obligationId)
      .maybeSingle();
    if (!obl) throw new Error("Obligation not found");
    if (obl.status === "paid" || obl.status === "cancelled" || obl.status === "exempted") {
      throw new Error("This payment is no longer due");
    }

    // Authorize: payer OR guardian
    let authorized = obl.payer_user_id === userId;
    if (!authorized && obl.player_id) {
      const { data: g } = await supabaseAdmin
        .from("player_guardians")
        .select("id")
        .eq("player_id", obl.player_id)
        .eq("user_id", userId)
        .maybeSingle();
      authorized = !!g;
    }
    if (!authorized) throw new Error("Not authorized to pay this obligation");

    const alreadyPaid = await sumPaid(obl.id);
    const remaining = obl.amount_due_cents - alreadyPaid;
    if (remaining <= 0) throw new Error("Already paid");

    const { data: item } = await supabaseAdmin
      .from("payment_items")
      .select("title, allow_partial, status")
      .eq("id", obl.payment_item_id)
      .single();
    if (!item || item.status !== "open") throw new Error("Item is not open");

    let amount = data.amountCents ?? remaining;
    if (amount > remaining) amount = remaining;
    if (amount < remaining && !item.allow_partial) {
      throw new Error("Partial payment not allowed for this item");
    }

    // Settings: min partial
    if (amount < remaining) {
      const { data: s } = await supabaseAdmin
        .from("club_payment_settings")
        .select("min_partial_amount_cents")
        .eq("club_id", obl.club_id)
        .maybeSingle();
      const minPartial = s?.min_partial_amount_cents ?? 500;
      if (amount < minPartial) {
        throw new Error(`Minimum partial payment is ${(minPartial / 100).toFixed(2)}`);
      }
    }

    // Club Stripe Connect
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name, stripe_account_id, stripe_charges_enabled")
      .eq("id", obl.club_id)
      .single();
    if (!club?.stripe_account_id || !club.stripe_charges_enabled) {
      throw new Error("Online payment is not available for this club yet");
    }

    const subActive = await hasActiveSubscription(obl.club_id);
    const fee = computeFeeForClub(amount, subActive);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const payerEmail = authUser?.user?.email ?? undefined;

    const origin = getOrigin();
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "sepa_debit", "link"],
      customer_email: payerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (obl.currency || "eur").toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: `${item.title} — ${club.name}`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: club.stripe_account_id },
        metadata: {
          purpose: "payment_obligation",
          obligation_id: obl.id,
          club_id: obl.club_id,
          payer_user_id: userId,
        },
      },
      metadata: {
        purpose: "payment_obligation",
        obligation_id: obl.id,
        club_id: obl.club_id,
        payer_user_id: userId,
      },
      success_url: `${origin}/payments?success=1`,
      cancel_url: `${origin}/payments?cancelled=1`,
    });

    if (!session.url) throw new Error("Stripe did not return a session URL");

    // Insert pending transaction so admins can track it
    await supabaseAdmin.from("payment_transactions").insert({
      obligation_id: obl.id,
      club_id: obl.club_id,
      method: "stripe",
      status: "pending",
      amount_gross_cents: amount,
      provider_fee_cents: fee,
      amount_net_cents: amount - fee,
      currency: (obl.currency || "eur").toLowerCase(),
      external_reference: session.id,
      recorded_by: userId,
    });

    log.info("Created obligation checkout", {
      obligation: obl.id,
      session: session.id,
      amount,
    });

    return { url: session.url, sessionId: session.id };
  });

/* ----------------------- ADMIN: RECORD MANUAL PAYMENT ----------------------- */

export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        obligationId: z.string().uuid(),
        method: z.enum(MANUAL_METHODS),
        amountCents: z.number().int().positive(),
        externalReference: z.string().max(120).nullable().optional(),
        comment: z.string().max(500).nullable().optional(),
        paidAt: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    const { data: obl } = await supabaseAdmin
      .from("payment_obligations")
      .select("id, club_id, amount_due_cents, currency, status")
      .eq("id", data.obligationId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (!obl) throw new Error("Obligation not found");
    if (obl.status === "cancelled" || obl.status === "exempted") {
      throw new Error("Obligation is not collectable");
    }

    const alreadyPaid = await sumPaid(obl.id);
    const remaining = obl.amount_due_cents - alreadyPaid;
    if (data.amountCents > remaining) {
      throw new Error(
        `Amount exceeds remaining due (${(remaining / 100).toFixed(2)})`,
      );
    }

    const { data: tx, error } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        obligation_id: obl.id,
        club_id: obl.club_id,
        method: data.method,
        status: "succeeded",
        amount_gross_cents: data.amountCents,
        provider_fee_cents: 0,
        amount_net_cents: data.amountCents,
        currency: obl.currency,
        external_reference: data.externalReference ?? null,
        comment: data.comment ?? null,
        recorded_by: context.userId,
        paid_at: data.paidAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await maybeIssueReceipt(tx.id);

    // Audit
    await supabaseAdmin.from("payment_audit_logs").insert({
      club_id: obl.club_id,
      actor_user_id: context.userId,
      action: "manual_payment_recorded",
      entity_type: "payment_transaction",
      entity_id: tx.id,
      new_value: {
        method: data.method,
        amount_cents: data.amountCents,
        obligation_id: obl.id,
      } as unknown as never,
    });

    return { transactionId: tx.id };
  });

/* ------------------- ADMIN: MARK SUCCESS OF PENDING STRIPE TX ------------------ */
/* (utility for webhook handler — exported for tests too) */

export async function finalizeStripeTransactionByPI(params: {
  paymentIntentId: string;
  chargeId: string | null;
  amountReceivedCents: number;
  feeCents: number | null;
  sessionId: string | null;
}): Promise<void> {
  const { paymentIntentId, chargeId, amountReceivedCents, feeCents, sessionId } =
    params;

  // Locate the pending tx via session id (external_reference) or PI
  let txRow: { id: string; obligation_id: string; club_id: string } | null = null;
  if (sessionId) {
    const { data } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, obligation_id, club_id")
      .eq("external_reference", sessionId)
      .eq("method", "stripe")
      .maybeSingle();
    txRow = data ?? null;
  }
  if (!txRow) {
    const { data } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, obligation_id, club_id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    txRow = data ?? null;
  }
  if (!txRow) {
    log.warn("Stripe success but no matching pending tx", {
      paymentIntentId,
      sessionId,
    });
    return;
  }

  await supabaseAdmin
    .from("payment_transactions")
    .update({
      status: "succeeded",
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      amount_gross_cents: amountReceivedCents,
      provider_fee_cents: feeCents ?? 0,
      amount_net_cents: amountReceivedCents - (feeCents ?? 0),
      paid_at: new Date().toISOString(),
    })
    .eq("id", txRow.id);

  await maybeIssueReceipt(txRow.id);

  await supabaseAdmin.from("payment_audit_logs").insert({
    club_id: txRow.club_id,
    actor_user_id: null,
    action: "stripe_payment_succeeded",
    entity_type: "payment_transaction",
    entity_id: txRow.id,
    new_value: {
      payment_intent: paymentIntentId,
      session_id: sessionId,
      obligation_id: txRow.obligation_id,
    } as unknown as never,
  });
}

/* ----------------------- LIST OBLIGATIONS (admin) ----------------------- */

export const listObligationsForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clubId: z.string().uuid(), itemId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    const { data: obls } = await supabaseAdmin
      .from("payment_obligations")
      .select(
        `id, amount_due_cents, currency, status, payer_user_id, player_id, created_at,
         players:player_id (first_name, last_name)`,
      )
      .eq("payment_item_id", data.itemId)
      .eq("club_id", data.clubId)
      .order("status", { ascending: true });

    const ids = (obls ?? []).map((o) => o.id);
    const paidByObl = new Map<string, number>();
    if (ids.length > 0) {
      const { data: txs } = await supabaseAdmin
        .from("payment_transactions")
        .select("obligation_id, amount_gross_cents")
        .in("obligation_id", ids)
        .eq("status", "succeeded");
      txs?.forEach((t) =>
        paidByObl.set(
          t.obligation_id,
          (paidByObl.get(t.obligation_id) ?? 0) + (t.amount_gross_cents ?? 0),
        ),
      );
    }

    // Resolve payer names
    const payerIds = Array.from(
      new Set((obls ?? []).map((o) => o.payer_user_id).filter(Boolean)),
    ) as string[];
    const payerMap = new Map<string, { name: string | null }>();
    if (payerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", payerIds);
      profiles?.forEach((p) =>
        payerMap.set(p.id, {
          name:
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || null,
        }),
      );
    }

    return {
      obligations: (obls ?? []).map((o) => ({
        ...o,
        amount_paid_cents: paidByObl.get(o.id) ?? 0,
        payer: o.payer_user_id ? (payerMap.get(o.payer_user_id) ?? null) : null,
      })),
    };
  });
