CREATE TABLE public.tournament_team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_team_id uuid NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  jersey_number integer,
  position text,
  is_captain boolean NOT NULL DEFAULT false,
  birth_date date,
  license_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_team_players_jersey_chk CHECK (jersey_number IS NULL OR (jersey_number >= 0 AND jersey_number <= 999))
);

CREATE INDEX idx_ttp_team ON public.tournament_team_players(tournament_team_id);
CREATE INDEX idx_ttp_tournament ON public.tournament_team_players(tournament_id);
CREATE UNIQUE INDEX uniq_ttp_team_jersey ON public.tournament_team_players(tournament_team_id, jersey_number) WHERE jersey_number IS NOT NULL;

ALTER TABLE public.tournament_team_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ttp_select"
  ON public.tournament_team_players FOR SELECT
  TO anon, authenticated
  USING (public.can_view_tournament(auth.uid(), tournament_id));

CREATE POLICY "ttp_write"
  ON public.tournament_team_players FOR ALL
  TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE TRIGGER trg_ttp_updated
  BEFORE UPDATE ON public.tournament_team_players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
