ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS published_programme_at timestamptz;

ALTER TABLE public.tournament_payment_events
  DROP CONSTRAINT IF EXISTS tournament_payment_events_event_type_check;

ALTER TABLE public.tournament_payment_events
  ADD CONSTRAINT tournament_payment_events_event_type_check
  CHECK (event_type IN (
    'checkout_created', 'payment_succeeded', 'payment_failed',
    'refund_initiated', 'refund_succeeded', 'marked_paid_offline',
    'account_updated', 'programme_published'
  ));