
-- 1) Webhook idempotency table — barrier #1 against duplicate Stripe deliveries
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies → no client access. Only service_role (via supabaseAdmin) can use it.

-- 2) Explicit registration state machine — barrier #2 against double processing
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS registration_state text NOT NULL DEFAULT 'pending_payment'
  CHECK (registration_state IN (
    'pending_payment',
    'paid_pending_team',
    'confirmed',
    'failed',
    'cancelled'
  ));

-- Backfill from legacy payment_status + status so existing rows are coherent.
UPDATE public.tournament_registrations
SET registration_state = CASE
  WHEN payment_status IN ('paid_online', 'paid_offline') AND tournament_team_id IS NOT NULL THEN 'confirmed'
  WHEN payment_status IN ('paid_online', 'paid_offline') AND tournament_team_id IS NULL THEN 'paid_pending_team'
  WHEN payment_status = 'refunded' THEN 'cancelled'
  WHEN status = 'rejected' THEN 'cancelled'
  ELSE 'pending_payment'
END
WHERE registration_state = 'pending_payment';

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_state
  ON public.tournament_registrations (registration_state);

-- 3) One team per registration: prevent duplicate team creation on webhook retry
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tournament_registrations_team
  ON public.tournament_registrations (tournament_team_id)
  WHERE tournament_team_id IS NOT NULL;

-- 4) Atomic team creation RPC for a registration.
--    SECURITY DEFINER so the webhook (called without a user session) can run it.
--    Returns the team id; idempotent — if a team is already linked, returns it.
CREATE OR REPLACE FUNCTION public.ensure_team_for_registration(_registration_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_team_id uuid;
  _tournament_id uuid;
  _team_name text;
  _short_name text;
  _email text;
  _phone text;
  _new_team_id uuid;
BEGIN
  SELECT tournament_team_id, tournament_id, team_name, short_name, contact_email, contact_phone
    INTO _existing_team_id, _tournament_id, _team_name, _short_name, _email, _phone
  FROM public.tournament_registrations
  WHERE id = _registration_id
  FOR UPDATE;

  IF _existing_team_id IS NOT NULL THEN
    -- Idempotent: team already linked.
    RETURN _existing_team_id;
  END IF;

  INSERT INTO public.tournament_teams (tournament_id, name, short_name, contact_email, contact_phone)
  VALUES (_tournament_id, _team_name, _short_name, lower(_email), _phone)
  RETURNING id INTO _new_team_id;

  UPDATE public.tournament_registrations
  SET tournament_team_id = _new_team_id,
      decided_at = COALESCE(decided_at, now()),
      registration_state = 'confirmed'
  WHERE id = _registration_id;

  RETURN _new_team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_team_for_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_team_for_registration(uuid) TO service_role;
