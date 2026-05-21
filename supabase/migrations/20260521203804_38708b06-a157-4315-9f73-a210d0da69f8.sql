ALTER TABLE public.players ADD COLUMN license_number text;
CREATE INDEX IF NOT EXISTS idx_players_license_number ON public.players(club_id, license_number) WHERE license_number IS NOT NULL;