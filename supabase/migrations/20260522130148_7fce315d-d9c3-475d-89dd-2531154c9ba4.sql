-- Stop auto-creating a trialing subscription when a club is created.
-- New clubs will start with NO subscription row — admin must purchase
-- from the Admin > Abonnement tab to unlock event creation.
DROP TRIGGER IF EXISTS trg_create_trial_subscription ON public.clubs;
DROP FUNCTION IF EXISTS public.create_trial_subscription_for_new_club();