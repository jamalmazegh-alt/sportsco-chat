
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS auto_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_reminder_hours_before integer[] NOT NULL DEFAULT '{48,3}';

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS milestone_hours integer;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_conv_milestone_unique
  ON public.reminders (convocation_id, milestone_hours)
  WHERE milestone_hours IS NOT NULL;
