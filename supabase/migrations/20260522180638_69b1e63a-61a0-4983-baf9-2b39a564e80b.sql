-- Paid tournament registrations: track Stripe payment status
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- Allowed values: not_required | pending | paid | refunded | failed
ALTER TABLE public.tournament_registrations
  DROP CONSTRAINT IF EXISTS tournament_registrations_payment_status_check;
ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_payment_status_check
  CHECK (payment_status IN ('not_required','pending','paid','refunded','failed'));

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_session
  ON public.tournament_registrations (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
