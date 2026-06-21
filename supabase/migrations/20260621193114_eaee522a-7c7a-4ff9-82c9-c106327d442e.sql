
REVOKE SELECT (stripe_payment_intent_id) ON public.fundraising_contributions FROM authenticated, anon;
REVOKE SELECT (stripe_payment_intent_id, stripe_charge_id, stripe_refund_id) ON public.payment_transactions FROM authenticated, anon;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id) ON public.subscriptions FROM authenticated, anon;
