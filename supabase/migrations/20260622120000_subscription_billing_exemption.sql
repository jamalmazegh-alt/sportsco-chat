-- Manual billing exemption for beta / partner clubs (superadmin-granted).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS exempt_from_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exempt_reason text,
  ADD COLUMN IF NOT EXISTS exempt_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS exempt_granted_by uuid REFERENCES auth.users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_exempt_reason_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_exempt_reason_check
      CHECK (
        exempt_reason IS NULL
        OR exempt_reason IN ('beta_club', 'partner', 'internal', 'other')
      );
  END IF;
END $$;

-- Paid access = active Stripe subscription OR manual exemption.
CREATE OR REPLACE FUNCTION public.club_has_active_subscription(_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.club_id = _club_id
      AND (
        s.exempt_from_billing = true
        OR (
          s.status IN ('trialing', 'active', 'past_due')
          AND (
            (s.status = 'trialing' AND s.trial_end IS NOT NULL AND s.trial_end > now())
            OR (
              s.status IN ('active', 'past_due')
              AND (s.current_period_end IS NULL OR s.current_period_end > now())
            )
          )
        )
      )
  );
$$;

-- Tournament creation: club admins/dirigeants with paid club access may create tournaments.
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
  has_club_paid_access boolean;
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
    SELECT 1
    FROM public.tournament_entitlements
    WHERE organizer_id = _user_id
      AND plan = 'annual'
      AND status = 'active'
      AND (valid_until IS NULL OR valid_until > now())
  ) INTO has_annual;
  IF has_annual THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = _user_id
      AND (
        cm.role IN ('admin', 'dirigeant')
        OR cm.roles && ARRAY['admin', 'dirigeant']::text[]
      )
      AND public.club_has_active_subscription(cm.club_id)
  ) INTO has_club_paid_access;
  IF has_club_paid_access THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_entitlements
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
