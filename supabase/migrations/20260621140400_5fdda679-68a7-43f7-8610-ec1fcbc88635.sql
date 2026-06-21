
-- 1. tournament_entitlements table
CREATE TABLE public.tournament_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('single', 'annual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'canceled')),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_session_id text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournament_entitlements_organizer ON public.tournament_entitlements(organizer_id);
CREATE INDEX idx_tournament_entitlements_active_lookup
  ON public.tournament_entitlements(organizer_id, plan, status)
  WHERE status = 'active';
CREATE INDEX idx_tournament_entitlements_stripe_sub
  ON public.tournament_entitlements(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_tournament_entitlements_session
  ON public.tournament_entitlements(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- 2. GRANTs (anon never reads — auth-only)
GRANT SELECT ON public.tournament_entitlements TO authenticated;
GRANT ALL ON public.tournament_entitlements TO service_role;

-- 3. RLS
ALTER TABLE public.tournament_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can view own entitlements"
  ON public.tournament_entitlements FOR SELECT
  TO authenticated
  USING (organizer_id = auth.uid());

CREATE POLICY "superadmins can view all entitlements"
  ON public.tournament_entitlements FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

-- writes restricted to service_role (no public policy needed)

-- 4. updated_at trigger (reuse existing helper if present)
CREATE OR REPLACE FUNCTION public.tournament_entitlements_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tournament_entitlements_updated_at
  BEFORE UPDATE ON public.tournament_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tournament_entitlements_touch_updated_at();

-- 5. can_create_tournament(user) — fail-closed
CREATE OR REPLACE FUNCTION public.can_create_tournament(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_annual boolean;
  has_single boolean;
  is_super boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
    INTO is_super;
  IF is_super THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entitlements
    WHERE organizer_id = _user_id
      AND plan = 'annual'
      AND status = 'active'
      AND (valid_until IS NULL OR valid_until > now())
  ) INTO has_annual;
  IF has_annual THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entitlements
    WHERE organizer_id = _user_id
      AND plan = 'single'
      AND status = 'active'
      AND tournament_id IS NULL
  ) INTO has_single;

  RETURN has_single;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_create_tournament(uuid) TO authenticated;

-- 6. consume_single_entitlement(user, tournament_id)
-- Attaches one unused single entitlement to a freshly-created tournament.
-- Returns true if a single was consumed, false if user is on annual / superadmin / no single available.
CREATE OR REPLACE FUNCTION public.consume_single_entitlement(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  consumed_id uuid;
BEGIN
  IF _user_id IS NULL OR _tournament_id IS NULL THEN
    RETURN false;
  END IF;

  -- annual users / superadmins: nothing to consume
  IF EXISTS (
    SELECT 1 FROM public.tournament_entitlements
    WHERE organizer_id = _user_id
      AND plan = 'annual'
      AND status = 'active'
      AND (valid_until IS NULL OR valid_until > now())
  ) OR EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = _user_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.tournament_entitlements
  SET tournament_id = _tournament_id
  WHERE id = (
    SELECT id FROM public.tournament_entitlements
    WHERE organizer_id = _user_id
      AND plan = 'single'
      AND status = 'active'
      AND tournament_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO consumed_id;

  RETURN consumed_id IS NOT NULL;
END;
$$;

-- service_role only (called from webhook / server fn with admin client)
REVOKE ALL ON FUNCTION public.consume_single_entitlement(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_single_entitlement(uuid, uuid) TO service_role;
