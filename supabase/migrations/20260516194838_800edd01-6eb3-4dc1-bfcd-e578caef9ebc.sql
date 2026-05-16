ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS trial_reminders_sent integer[] NOT NULL DEFAULT '{}'::integer[];