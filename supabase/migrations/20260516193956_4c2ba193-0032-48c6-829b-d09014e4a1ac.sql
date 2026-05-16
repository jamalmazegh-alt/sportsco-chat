
-- 1) Auto-create a trialing subscription (no Stripe, no CB) on club creation
CREATE OR REPLACE FUNCTION public.create_trial_subscription_for_new_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (club_id, status, trial_end)
  VALUES (NEW.id, 'trialing', now() + interval '30 days')
  ON CONFLICT (club_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_trial_subscription ON public.clubs;
CREATE TRIGGER trg_create_trial_subscription
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.create_trial_subscription_for_new_club();

-- Ensure unique (club_id) on subscriptions for the ON CONFLICT clause + future upserts
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_club_id_unique ON public.subscriptions(club_id);

-- 2) Backfill: every existing club without a subscription row gets a 30-day trial starting now
INSERT INTO public.subscriptions (club_id, status, trial_end)
SELECT c.id, 'trialing', now() + interval '30 days'
FROM public.clubs c
LEFT JOIN public.subscriptions s ON s.club_id = c.id
WHERE s.id IS NULL;

-- 3) Helper: does a club currently have an active (trialing/active/past_due) and non-expired subscription?
CREATE OR REPLACE FUNCTION public.club_has_active_subscription(_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.club_id = _club_id
      AND s.status IN ('trialing', 'active', 'past_due')
      AND (
        (s.status = 'trialing' AND s.trial_end IS NOT NULL AND s.trial_end > now())
        OR (s.status IN ('active', 'past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      )
  );
$$;

-- 4) Block event creation when the club has no active subscription
CREATE OR REPLACE FUNCTION public.enforce_active_subscription_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
BEGIN
  SELECT t.club_id INTO v_club FROM public.teams t WHERE t.id = NEW.team_id;
  IF v_club IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.club_has_active_subscription(v_club) THEN
    RAISE EXCEPTION 'subscription_required'
      USING HINT = 'Activez votre abonnement Clubero pour créer des événements.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_subscription_on_event ON public.events;
CREATE TRIGGER trg_enforce_subscription_on_event
BEFORE INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_on_event();
