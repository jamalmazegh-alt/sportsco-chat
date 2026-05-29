
-- Restrict sensitive Stripe / billing columns to server-side (service_role) only.
-- The user-scoped authenticated/anon roles cannot read these columns from the client.
-- Server functions use supabaseAdmin (service_role) which bypasses these grants.

-- ============ clubs: Stripe Connect fields ============
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_charges_enabled,
               stripe_payouts_enabled, stripe_account_created_at)
  ON public.clubs FROM authenticated, anon;

-- ============ subscriptions: Stripe identifiers ============
REVOKE SELECT (stripe_subscription_id, stripe_customer_id, stripe_price_id)
  ON public.subscriptions FROM authenticated, anon;

-- ============ tournament_registrations: Stripe payment identifiers ============
REVOKE SELECT (stripe_session_id, stripe_payment_intent_id, stripe_charge_id,
               payment_intent_id, platform_fee)
  ON public.tournament_registrations FROM authenticated, anon;
