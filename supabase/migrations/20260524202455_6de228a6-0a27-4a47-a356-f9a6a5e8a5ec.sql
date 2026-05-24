ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS payment_link text,
  ADD COLUMN IF NOT EXISTS payment_link_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_link_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_link_sent_via text,
  ADD COLUMN IF NOT EXISTS payment_link_sent_at timestamptz;

ALTER TABLE public.tournament_registrations
  DROP CONSTRAINT IF EXISTS tournament_registrations_payment_link_sent_via_check;

ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_payment_link_sent_via_check
  CHECK (payment_link_sent_via IS NULL OR payment_link_sent_via IN ('email', 'whatsapp', 'copy'));

CREATE INDEX IF NOT EXISTS tournament_registrations_payment_link_idx
  ON public.tournament_registrations (payment_link)
  WHERE payment_link IS NOT NULL;