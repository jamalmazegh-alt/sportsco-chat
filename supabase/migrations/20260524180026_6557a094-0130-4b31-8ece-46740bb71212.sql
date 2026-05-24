ALTER TABLE public.tournament_members ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.tournament_members DROP CONSTRAINT IF EXISTS tournament_members_tournament_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS tournament_members_tournament_email_uidx
  ON public.tournament_members(tournament_id, email) WHERE email IS NOT NULL;