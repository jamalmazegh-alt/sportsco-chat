-- ============================================================
-- Stripe Connect Express for tournament registrations
-- Step 1: schema changes (DB only, no code yet)
-- ============================================================

-- 1) tournaments: registration fee + capacity + payment mode
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS registration_fee integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_currency text NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS registration_fee_description text,
  ADD COLUMN IF NOT EXISTS max_teams integer,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'online';

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_payment_mode_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_payment_mode_check
  CHECK (payment_mode IN ('online', 'offline', 'both'));

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_registration_fee_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_registration_fee_check
  CHECK (registration_fee >= 0);

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_max_teams_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_max_teams_check
  CHECK (max_teams IS NULL OR max_teams > 0);

-- 2) clubs: Stripe Connect Express account
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_account_status text,
  ADD COLUMN IF NOT EXISTS stripe_account_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.clubs
  DROP CONSTRAINT IF EXISTS clubs_stripe_account_status_check;
ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_stripe_account_status_check
  CHECK (stripe_account_status IS NULL
         OR stripe_account_status IN ('pending', 'active', 'restricted', 'disabled'));

CREATE UNIQUE INDEX IF NOT EXISTS clubs_stripe_account_id_key
  ON public.clubs(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- 3) tournament_registrations: payment fields
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS amount_paid integer,
  ADD COLUMN IF NOT EXISTS platform_fee integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS marked_paid_at timestamptz;

ALTER TABLE public.tournament_registrations
  DROP CONSTRAINT IF EXISTS tournament_registrations_payment_status_check;
ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_payment_status_check
  CHECK (payment_status IN ('pending', 'paid_online', 'paid_offline', 'refunded', 'refund_pending', 'free'));

CREATE INDEX IF NOT EXISTS tournament_registrations_payment_intent_idx
  ON public.tournament_registrations(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- 4) tournament_payment_events: audit log
CREATE TABLE IF NOT EXISTS public.tournament_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.tournament_registrations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  stripe_event_id text,
  amount integer,
  currency text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_payment_events_event_type_check
    CHECK (event_type IN (
      'checkout_created', 'payment_succeeded', 'payment_failed',
      'refund_initiated', 'refund_succeeded', 'marked_paid_offline',
      'account_updated'
    ))
);

CREATE INDEX IF NOT EXISTS tournament_payment_events_tournament_idx
  ON public.tournament_payment_events(tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tournament_payment_events_registration_idx
  ON public.tournament_payment_events(registration_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_payment_events_stripe_event_key
  ON public.tournament_payment_events(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

ALTER TABLE public.tournament_payment_events ENABLE ROW LEVEL SECURITY;

-- Only club admins/dirigeants of the tournament's club (and super admins) can read events.
-- Writes happen exclusively via service role (webhooks / server fns), so no INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS tournament_payment_events_select ON public.tournament_payment_events;
CREATE POLICY tournament_payment_events_select
  ON public.tournament_payment_events
  FOR SELECT
  TO authenticated
  USING (
    has_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_payment_events.tournament_id
        AND (
          has_club_role(auth.uid(), t.club_id, 'admin'::app_role)
          OR has_club_role(auth.uid(), t.club_id, 'dirigeant'::app_role)
        )
    )
  );
