import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import { createLogger } from "@/lib/logger.server";

const log = createLogger("stripe-connect");

function getOrigin(): string {
  return process.env.APP_URL || "https://www.clubero.app";
}

async function assertClubAdmin(
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
    !!data &&
    ((data.roles ?? []).includes("admin") || data.role === "admin");
  if (!isAdmin) throw new Error("Only club admins can manage payments");
}

async function logEvent(
  tournamentId: string | null,
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("tournament_payment_events").insert({
      tournament_id: tournamentId,
      event_type: eventType,
      // metadata is a jsonb column; cast through unknown to satisfy generated Json type.
      metadata: metadata as unknown as never,
    });
  } catch (e) {
    log.error("Failed to insert payment event", { eventType, error: String(e) });
  }
}

/**
 * Read the Stripe Connect status for the active club. Admin-only.
 * Returns null fields when no Connect account exists yet.
 */
export const getStripeConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select(
        "id, name, stripe_account_id, stripe_account_status, stripe_account_created_at, stripe_charges_enabled, stripe_payouts_enabled",
      )
      .eq("id", data.clubId)
      .single();
    if (!club) throw new Error("Club not found");

    // Detect if the club has an active Clubero subscription (used to compute fee rate).
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, trial_end, current_period_end")
      .eq("club_id", data.clubId)
      .maybeSingle();
    const now = Date.now();
    const hasActiveSubscription = !!sub && (
      (sub.status === "trialing" && sub.trial_end && new Date(sub.trial_end).getTime() > now) ||
      ((sub.status === "active" || sub.status === "past_due") &&
        (!sub.current_period_end || new Date(sub.current_period_end).getTime() > now))
    );

    return {
      clubId: club.id,
      stripeAccountId: club.stripe_account_id,
      status: club.stripe_account_status as
        | "pending" | "active" | "restricted" | "disabled" | null,
      createdAt: club.stripe_account_created_at,
      chargesEnabled: !!club.stripe_charges_enabled,
      payoutsEnabled: !!club.stripe_payouts_enabled,
      hasActiveSubscription,
    };
  });

/**
 * Create a Stripe Connect Express account for the club.
 * Admin-only. Idempotent: returns the existing account id if already created.
 */
export const createStripeConnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name, stripe_account_id")
      .eq("id", data.clubId)
      .single();
    if (!club) throw new Error("Club not found");

    if (club.stripe_account_id) {
      return { stripeAccountId: club.stripe_account_id, created: false };
    }

    const stripe = getStripe();
    const account = await stripe.accounts.create({
      type: "express",
      country: "FR",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        sepa_debit_payments: { requested: true },
      },
      business_type: "non_profit",
      business_profile: {
        name: club.name,
      },
      metadata: { clubero_club_id: club.id },
    });

    await supabaseAdmin
      .from("clubs")
      .update({
        stripe_account_id: account.id,
        stripe_account_status: "pending",
        stripe_account_created_at: new Date().toISOString(),
        stripe_charges_enabled: !!account.charges_enabled,
        stripe_payouts_enabled: !!account.payouts_enabled,
      })
      .eq("id", club.id);

    // Audit trail
    try {
      await supabaseAdmin.from("permission_changes_log").insert({
        actor_id: context.userId,
        scope: "club",
        scope_id: club.id,
        action: "stripe_connect_account_created",
        note: `Stripe Connect account ${account.id} created`,
      });
    } catch (e) {
      log.warn("Failed to insert permission_changes_log entry", { error: String(e) });
    }

    return { stripeAccountId: account.id, created: true };
  });

/**
 * Create a one-time onboarding link the user follows to complete their Stripe profile.
 * The link expires automatically; refresh by calling this fn again.
 */
export const createStripeConnectOnboardingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, stripe_account_id")
      .eq("id", data.clubId)
      .single();
    if (!club?.stripe_account_id) {
      throw new Error("No Stripe account for this club. Create one first.");
    }

    const stripe = getStripe();
    const origin = getOrigin();
    const link = await stripe.accountLinks.create({
      account: club.stripe_account_id,
      refresh_url: `${origin}/admin/settings/payments?refresh=1`,
      return_url: `${origin}/admin/settings/payments?success=1`,
      type: "account_onboarding",
    });

    return { url: link.url, expiresAt: link.expires_at };
  });

/**
 * Pull the latest account state from Stripe and persist it locally.
 * Useful when the user just returned from onboarding and the webhook may
 * not have landed yet.
 */
export const refreshStripeConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, stripe_account_id")
      .eq("id", data.clubId)
      .single();
    if (!club?.stripe_account_id) {
      throw new Error("No Stripe account for this club");
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(club.stripe_account_id);

    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const disabledReason = account.requirements?.disabled_reason ?? null;
    const status: "pending" | "active" | "restricted" | "disabled" =
      disabledReason
        ? (disabledReason.startsWith("rejected") ? "disabled" : "restricted")
        : chargesEnabled && payoutsEnabled
          ? "active"
          : "pending";

    await supabaseAdmin
      .from("clubs")
      .update({
        stripe_account_status: status,
        stripe_charges_enabled: chargesEnabled,
        stripe_payouts_enabled: payoutsEnabled,
      })
      .eq("id", club.id);

    await logEvent(null, "account_updated", {
      club_id: club.id,
      status,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      source: "manual_refresh",
    });

    return { status, chargesEnabled, payoutsEnabled };
  });
