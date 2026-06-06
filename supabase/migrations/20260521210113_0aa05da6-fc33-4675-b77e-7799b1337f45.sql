
-- =========================================================================
-- TOURNAMENT MANAGEMENT — V1 schema
-- =========================================================================

-- Enums
CREATE TYPE public.tournament_format AS ENUM ('group', 'knockout', 'mixed');
CREATE TYPE public.tournament_status AS ENUM ('draft', 'published', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.tournament_match_status AS ENUM ('scheduled', 'live', 'completed', 'cancelled');
CREATE TYPE public.tournament_match_round AS ENUM ('group', 'r32', 'r16', 'qf', 'sf', 'final', 'third_place');

-- =========================================================================
-- TOURNAMENTS
-- =========================================================================
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sport text,
  category text,
  description text,
  location text,
  starts_on date NOT NULL,
  ends_on date,
  format public.tournament_format NOT NULL DEFAULT 'group',
  num_teams integer NOT NULL DEFAULT 8,
  status public.tournament_status NOT NULL DEFAULT 'draft',
  -- Scoring rules
  points_win integer NOT NULL DEFAULT 3,
  points_draw integer NOT NULL DEFAULT 1,
  points_loss integer NOT NULL DEFAULT 0,
  -- Ordered tiebreakers, e.g. ["points","head_to_head","goal_diff","goals_for"]
  tiebreakers jsonb NOT NULL DEFAULT '["points","head_to_head","goal_diff","goals_for","wins"]'::jsonb,
  -- Fixture generation
  match_duration_min integer NOT NULL DEFAULT 60,
  break_min integer NOT NULL DEFAULT 15,
  fields jsonb NOT NULL DEFAULT '["Terrain 1"]'::jsonb,
  daily_start_time time NOT NULL DEFAULT '09:00',
  daily_end_time time NOT NULL DEFAULT '20:00',
  -- Misc
  cover_image_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX idx_tournaments_club ON public.tournaments(club_id);
CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_tournaments_slug ON public.tournaments(slug);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Public can read PUBLISHED tournaments (for public page)
CREATE POLICY tournaments_select_public
  ON public.tournaments FOR SELECT
  TO anon, authenticated
  USING (status IN ('published','in_progress','completed') AND archived_at IS NULL);

-- Club members can see all (incl. drafts)
CREATE POLICY tournaments_select_member
  ON public.tournaments FOR SELECT
  TO authenticated
  USING (is_club_member(auth.uid(), club_id) OR has_super_admin(auth.uid()));

-- Admins or dirigeants can write
CREATE POLICY tournaments_write_admin_dirigeant
  ON public.tournaments FOR ALL
  TO authenticated
  USING (
    has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
  )
  WITH CHECK (
    has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
  );

-- =========================================================================
-- HELPER FUNCTIONS for child-table RLS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_view_tournament(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament_id
      AND (
        (t.status IN ('published','in_progress','completed') AND t.archived_at IS NULL)
        OR is_club_member(_user_id, t.club_id)
        OR has_super_admin(_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tournament(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament_id
      AND (
        has_club_role(_user_id, t.club_id, 'admin'::app_role)
        OR has_club_role(_user_id, t.club_id, 'dirigeant'::app_role)
      )
  );
$$;

-- =========================================================================
-- TOURNAMENT GROUPS
-- =========================================================================
CREATE TABLE public.tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  qualifiers_count integer NOT NULL DEFAULT 2,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);
CREATE INDEX idx_tournament_groups_tournament ON public.tournament_groups(tournament_id);

ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_groups_select ON public.tournament_groups FOR SELECT
  TO anon, authenticated USING (can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY tournament_groups_write ON public.tournament_groups FOR ALL
  TO authenticated USING (can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (can_manage_tournament(auth.uid(), tournament_id));

-- =========================================================================
-- TOURNAMENT TEAMS (Clubero team OR external)
-- =========================================================================
CREATE TABLE public.tournament_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  short_name text,
  logo_url text,
  seed integer,
  group_id uuid REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tournament_teams_tournament ON public.tournament_teams(tournament_id);
CREATE INDEX idx_tournament_teams_group ON public.tournament_teams(group_id);

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_teams_select ON public.tournament_teams FOR SELECT
  TO anon, authenticated USING (can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY tournament_teams_write ON public.tournament_teams FOR ALL
  TO authenticated USING (can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (can_manage_tournament(auth.uid(), tournament_id));

-- =========================================================================
-- TOURNAMENT MATCHES
-- =========================================================================
CREATE TABLE public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
  round public.tournament_match_round NOT NULL DEFAULT 'group',
  -- For bracket positioning: position within the round (0,1,2,...)
  bracket_position integer,
  match_number integer,
  team_a_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  -- For knockout TBD slots: { kind: 'winner_of'|'loser_of'|'group_pos', match_id?, group_id?, position? }
  team_a_source jsonb,
  team_b_source jsonb,
  -- Schedule
  scheduled_at timestamptz,
  field text,
  duration_min integer,
  -- Result
  status public.tournament_match_status NOT NULL DEFAULT 'scheduled',
  score_a integer,
  score_b integer,
  winner_team_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tournament_matches_tournament ON public.tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_group ON public.tournament_matches(group_id);
CREATE INDEX idx_tournament_matches_schedule ON public.tournament_matches(tournament_id, scheduled_at);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_matches_select ON public.tournament_matches FOR SELECT
  TO anon, authenticated USING (can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY tournament_matches_write ON public.tournament_matches FOR ALL
  TO authenticated USING (can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (can_manage_tournament(auth.uid(), tournament_id));

-- =========================================================================
-- Triggers updated_at
-- =========================================================================
CREATE TRIGGER trg_tournaments_updated
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tournament_matches_updated
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- Trigger: auto-derive winner_team_id when a match completes
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tournament_match_compute_winner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.score_a IS NOT NULL AND NEW.score_b IS NOT NULL THEN
    IF NEW.score_a > NEW.score_b THEN
      NEW.winner_team_id := NEW.team_a_id;
    ELSIF NEW.score_b > NEW.score_a THEN
      NEW.winner_team_id := NEW.team_b_id;
    ELSE
      NEW.winner_team_id := NULL; -- draw (knockout handled by app)
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tournament_match_winner
  BEFORE INSERT OR UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.tournament_match_compute_winner();
