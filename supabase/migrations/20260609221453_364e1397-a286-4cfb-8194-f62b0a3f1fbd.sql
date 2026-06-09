-- fundraising_contributions
REVOKE SELECT (stripe_payment_intent_id, external_reference, donor_email)
  ON public.fundraising_contributions FROM authenticated, anon;

-- payment_transactions
REVOKE SELECT (stripe_payment_intent_id, stripe_charge_id, stripe_refund_id)
  ON public.payment_transactions FROM authenticated, anon;

-- tournament_passes
REVOKE SELECT (stripe_session_id, stripe_payment_intent_id)
  ON public.tournament_passes FROM authenticated, anon;
