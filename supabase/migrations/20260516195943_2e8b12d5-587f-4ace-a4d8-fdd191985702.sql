ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text,
  ADD COLUMN IF NOT EXISTS communication_mode text NOT NULL DEFAULT 'app';

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_communication_mode_check;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_communication_mode_check
  CHECK (communication_mode IN ('app', 'whatsapp', 'hybrid'));