-- Auto-create a 14-day trialing subscription when a new (non-personal, non-test) club is created.
-- Without this, brand-new clubs have no subscription row, club_has_active_subscription returns
-- false, and the _authenticated layout immediately redirects the new admin to /admin/billing
-- — preventing them from ever seeing the onboarding wizard.

CREATE OR REPLACE FUNCTION public.auto_create_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.is_personal, false) THEN RETURN NEW; END IF;
  IF NEW.name LIKE '__rls_%' OR NEW.name LIKE '__e2e_%' THEN RETURN NEW; END IF;

  INSERT INTO public.subscriptions (club_id, status, trial_end)
  VALUES (NEW.id, 'trialing', now() + interval '14 days')
  ON CONFLICT (club_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_trial_subscription_trg ON public.clubs;
CREATE TRIGGER auto_create_trial_subscription_trg
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.auto_create_trial_subscription();

-- Backfill: give a 14-day trial to existing clubs that have no subscription row,
-- excluding personal clubs and test fixtures.
INSERT INTO public.subscriptions (club_id, status, trial_end)
SELECT c.id, 'trialing', now() + interval '14 days'
FROM public.clubs c
LEFT JOIN public.subscriptions s ON s.club_id = c.id
WHERE s.id IS NULL
  AND COALESCE(c.is_personal, false) = false
  AND c.name NOT LIKE '__rls_%'
  AND c.name NOT LIKE '__e2e_%';
