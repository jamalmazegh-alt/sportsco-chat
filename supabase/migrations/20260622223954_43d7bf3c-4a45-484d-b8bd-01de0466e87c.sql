
-- Revoke client-side SELECT on sensitive Stripe identifiers on public.clubs
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_created_at)
  ON public.clubs FROM authenticated;
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_created_at)
  ON public.clubs FROM anon;

-- Revoke client-side SELECT on sensitive Stripe identifiers on public.subscriptions
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  ON public.subscriptions FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  ON public.subscriptions FROM anon;
