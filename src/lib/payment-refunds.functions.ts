import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import { createLogger } from "@/lib/logger.server";

const log = createLogger("payment-refunds");

async function assertFinAdmin(
  _supabase: SupabaseClient,
  userId: string,
  clubId: string,
): Promise<void> {
  // Fix 7: admin role does NOT inherit financial_admin — only explicit financial_admin
  const { data: isFin } = await supabaseAdmin.rpc("has_club_role_text", {
    _user_id: userId,
    _club_id: clubId,
    _role: "financial_admin",
  });
  if (isFin === true) return;
  throw new Error("Only financial admins can manage refunds/exemptions");
}


async function sumPaid(obligationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("payment_transactions")
    .select("amount_gross_cents, refunded_amount_cents")
    .eq("obligation_id", obligationId)
    .eq("status", "succeeded");
  return (data ?? []).reduce(
    (s, r) => s + (r.amount_gross_cents ?? 0) - (r.refunded_amount_cents ?? 0),
    0,
  );
}

async function recomputeObligationStatus(obligationId: string): Promise<void> {
  const { data: obl } = await supabaseAdmin
    .from("payment_obligations")
    .select("id, amount_due_cents, status")
    .eq("id", obligationId)
    .maybeSingle();
  if (!obl) return;
  if (obl.status === "cancelled" || obl.status === "exempted") return;
  const paid = await sumPaid(obligationId);
  let next: "pending" | "partially_paid" | "paid" | "refunded" = "pending";
  if (paid <= 0) next = "pending";
  else if (paid >= obl.amount_due_cents) next = "paid";
  else next = "partially_paid";

  // If the only succeeded transactions are fully refunded → mark refunded
  if (paid === 0) {
    const { data: anyTx } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, refunded_amount_cents, amount_gross_cents")
      .eq("obligation_id", obligationId)
      .eq("status", "succeeded");
    const everPaid = (anyTx ?? []).some((t) => (t.amount_gross_cents ?? 0) > 0);
    const allRefunded = (anyTx ?? []).every(
      (t) => (t.refunded_amount_cents ?? 0) >= (t.amount_gross_cents ?? 0),
    );
    if (everPaid && allRefunded) next = "refunded";
  }

  if (next !== obl.status) {
    await supabaseAdmin
      .from("payment_obligations")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", obligationId);
  }
}

/* -------------------------- REFUND A TRANSACTION -------------------------- */

export const refundTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        transactionId: z.string().uuid(),
        amountCents: z.number().int().positive().optional(),
        reason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: tx } = await supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, club_id, obligation_id, method, status, amount_gross_cents, refunded_amount_cents, currency, stripe_payment_intent_id, stripe_charge_id, provider_fee_cents",
      )
      .eq("id", data.transactionId)
      .maybeSingle();
    if (!tx) throw new Error("Transaction not found");
    if (tx.status !== "succeeded") {
      throw new Error("Only succeeded transactions can be refunded");
    }
    await assertFinAdmin(context.supabase, context.userId, tx.club_id);

    const refundable = tx.amount_gross_cents - (tx.refunded_amount_cents ?? 0);
    if (refundable <= 0) throw new Error("Transaction already fully refunded");

    const amount = Math.min(data.amountCents ?? refundable, refundable);
    if (amount <= 0) throw new Error("Invalid refund amount");

    let stripeRefundId: string | null = null;

    if (tx.method === "stripe") {
      if (!tx.stripe_payment_intent_id) {
        throw new Error("Stripe payment intent missing on this transaction");
      }
      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("stripe_account_id")
        .eq("id", tx.club_id)
        .single();
      if (!club?.stripe_account_id) {
        throw new Error("Club Stripe account not configured");
      }
      const stripe = getStripe();
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: tx.stripe_payment_intent_id,
            amount,
            reason: "requested_by_customer",
            refund_application_fee: true,
            reverse_transfer: true,
            metadata: {
              purpose: "obligation_refund",
              obligation_id: tx.obligation_id,
              transaction_id: tx.id,
            },
          },
          { stripeAccount: club.stripe_account_id },
        );
        stripeRefundId = refund.id;
      } catch (err) {
        log.error("Stripe refund failed", {
          tx: tx.id,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new Error(
          `Stripe refund failed: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    // Insert refund-record transaction (negative net for accounting)
    const { data: refundTx, error: insertErr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        obligation_id: tx.obligation_id,
        club_id: tx.club_id,
        method: tx.method,
        status: "refunded",
        amount_gross_cents: 0,
        provider_fee_cents: 0,
        amount_net_cents: -amount,
        currency: tx.currency,
        stripe_refund_id: stripeRefundId,
        parent_transaction_id: tx.id,
        refunded_amount_cents: amount,
        refund_reason: data.reason ?? null,
        refunded_at: new Date().toISOString(),
        refunded_by: context.userId,
        recorded_by: context.userId,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    // Update parent transaction
    const newRefunded = (tx.refunded_amount_cents ?? 0) + amount;
    const fullyRefunded = newRefunded >= tx.amount_gross_cents;
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        refunded_amount_cents: newRefunded,
        refund_reason: data.reason ?? null,
        refunded_at: new Date().toISOString(),
        refunded_by: context.userId,
        status: fullyRefunded ? "refunded" : tx.status,
        stripe_refund_id: stripeRefundId ?? tx.stripe_payment_intent_id ?? null,
      })
      .eq("id", tx.id);

    await recomputeObligationStatus(tx.obligation_id);

    await supabaseAdmin.from("payment_audit_logs").insert({
      club_id: tx.club_id,
      actor_user_id: context.userId,
      action: "transaction_refunded",
      entity_type: "payment_transaction",
      entity_id: tx.id,
      new_value: {
        amount_cents: amount,
        reason: data.reason ?? null,
        stripe_refund_id: stripeRefundId,
        refund_tx_id: refundTx.id,
      } as unknown as never,
    });

    return {
      refundTransactionId: refundTx.id,
      amount,
      stripeRefundId,
      fullyRefunded,
    };
  });

/* -------------------------- EXEMPT AN OBLIGATION -------------------------- */

export const exemptObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        obligationId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: obl } = await supabaseAdmin
      .from("payment_obligations")
      .select("id, club_id, status")
      .eq("id", data.obligationId)
      .maybeSingle();
    if (!obl) throw new Error("Obligation not found");
    await assertFinAdmin(context.supabase, context.userId, obl.club_id);
    if (obl.status === "paid") {
      throw new Error("Obligation already paid — issue a refund instead");
    }

    await supabaseAdmin
      .from("payment_obligations")
      .update({
        status: "exempted",
        exempted_reason: data.reason,
        exempted_by: context.userId,
        exempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", obl.id);

    await supabaseAdmin.from("payment_audit_logs").insert({
      club_id: obl.club_id,
      actor_user_id: context.userId,
      action: "obligation_exempted",
      entity_type: "payment_obligation",
      entity_id: obl.id,
      new_value: { reason: data.reason } as unknown as never,
    });

    return { ok: true };
  });

/* -------------------------- CANCEL AN OBLIGATION -------------------------- */

export const cancelObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        obligationId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: obl } = await supabaseAdmin
      .from("payment_obligations")
      .select("id, club_id, status")
      .eq("id", data.obligationId)
      .maybeSingle();
    if (!obl) throw new Error("Obligation not found");
    await assertFinAdmin(context.supabase, context.userId, obl.club_id);
    if (obl.status === "paid" || obl.status === "partially_paid") {
      throw new Error(
        "Cannot cancel an obligation with payments — refund first",
      );
    }

    await supabaseAdmin
      .from("payment_obligations")
      .update({
        status: "cancelled",
        cancelled_reason: data.reason,
        cancelled_by: context.userId,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", obl.id);

    await supabaseAdmin.from("payment_audit_logs").insert({
      club_id: obl.club_id,
      actor_user_id: context.userId,
      action: "obligation_cancelled",
      entity_type: "payment_obligation",
      entity_id: obl.id,
      new_value: { reason: data.reason } as unknown as never,
    });

    return { ok: true };
  });

/* -------------------------- REOPEN AN OBLIGATION -------------------------- */

export const reopenObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ obligationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: obl } = await supabaseAdmin
      .from("payment_obligations")
      .select("id, club_id, status")
      .eq("id", data.obligationId)
      .maybeSingle();
    if (!obl) throw new Error("Obligation not found");
    await assertFinAdmin(context.supabase, context.userId, obl.club_id);
    if (obl.status !== "cancelled" && obl.status !== "exempted") {
      throw new Error("Only cancelled or exempted obligations can be reopened");
    }

    await supabaseAdmin
      .from("payment_obligations")
      .update({
        status: "pending",
        cancelled_reason: null,
        cancelled_by: null,
        cancelled_at: null,
        exempted_reason: null,
        exempted_by: null,
        exempted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", obl.id);
    await recomputeObligationStatus(obl.id);

    await supabaseAdmin.from("payment_audit_logs").insert({
      club_id: obl.club_id,
      actor_user_id: context.userId,
      action: "obligation_reopened",
      entity_type: "payment_obligation",
      entity_id: obl.id,
    });

    return { ok: true };
  });
