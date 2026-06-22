-- 1. Mask OAuth tokens on club_social_connections
REVOKE SELECT (access_token, refresh_token) ON public.club_social_connections FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.club_social_connections FROM anon;

-- 2. Mask Stripe Connect fields on clubs
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_account_created_at, stripe_charges_enabled, stripe_payouts_enabled)
  ON public.clubs FROM authenticated;
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_account_created_at, stripe_charges_enabled, stripe_payouts_enabled)
  ON public.clubs FROM anon;

-- 3. Mask Stripe PaymentIntent ID on fundraising_contributions
REVOKE SELECT (stripe_payment_intent_id) ON public.fundraising_contributions FROM authenticated;
REVOKE SELECT (stripe_payment_intent_id) ON public.fundraising_contributions FROM anon;

-- 4. Mask Stripe identifiers on subscriptions
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id) ON public.subscriptions FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id) ON public.subscriptions FROM anon;

-- 5. Tighten llm_usage insert policy: forbid NULL user_id
DROP POLICY IF EXISTS llm_usage_self_insert ON public.llm_usage;
CREATE POLICY llm_usage_self_insert ON public.llm_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 6. Add explicit INSERT policy for push_subscriptions
CREATE POLICY push_sub_insert_own ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());