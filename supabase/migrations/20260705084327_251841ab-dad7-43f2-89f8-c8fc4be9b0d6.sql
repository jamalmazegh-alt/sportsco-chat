
-- =========================================================================
-- ENUMS
-- =========================================================================
DO $$ BEGIN CREATE TYPE public.challenge_kind AS ENUM ('challenge','physical_test');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_unit AS ENUM ('count','time_seconds','distance_meters','stage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_direction AS ENUM ('higher_better','lower_better');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_aggregate AS ENUM ('cumulative','record');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_derived AS ENUM ('none','vo2_leger','vo2_cooper');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_recurrence AS ENUM ('season','half_season','punctual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_visibility AS ENUM ('staff','category');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- TABLES
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  season_id     uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  name          text NOT NULL,
  icon          text,
  kind          public.challenge_kind NOT NULL,
  unit          public.challenge_unit NOT NULL,
  direction     public.challenge_direction NOT NULL DEFAULT 'higher_better',
  aggregate     public.challenge_aggregate NOT NULL DEFAULT 'record',
  derived       public.challenge_derived NOT NULL DEFAULT 'none',
  recurrence    public.challenge_recurrence NOT NULL DEFAULT 'season',
  ranking_visibility public.challenge_visibility NOT NULL DEFAULT 'staff',
  template_key  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS challenges_club_idx   ON public.challenges(club_id);
CREATE INDEX IF NOT EXISTS challenges_team_idx   ON public.challenges(team_id, season_id);
CREATE INDEX IF NOT EXISTS challenges_active_idx ON public.challenges(is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.challenge_passages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  event_id      uuid REFERENCES public.events(id) ON DELETE SET NULL,
  passage_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_passages TO authenticated;
GRANT ALL ON public.challenge_passages TO service_role;
ALTER TABLE public.challenge_passages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS challenge_passages_challenge_idx ON public.challenge_passages(challenge_id, passage_date DESC);
CREATE INDEX IF NOT EXISTS challenge_passages_event_idx     ON public.challenge_passages(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.challenge_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passage_id    uuid NOT NULL REFERENCES public.challenge_passages(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  value         numeric NOT NULL CHECK (value >= 0),
  derived_value numeric,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passage_id, player_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_results TO authenticated;
GRANT ALL ON public.challenge_results TO service_role;
ALTER TABLE public.challenge_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS challenge_results_passage_idx ON public.challenge_results(passage_id);
CREATE INDEX IF NOT EXISTS challenge_results_player_idx  ON public.challenge_results(player_id, created_at DESC);

-- =========================================================================
-- updated_at trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.challenges_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_challenges_updated_at ON public.challenges;
CREATE TRIGGER trg_challenges_updated_at BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.challenges_set_updated_at();

DROP TRIGGER IF EXISTS trg_challenge_results_updated_at ON public.challenge_results;
CREATE TRIGGER trg_challenge_results_updated_at BEFORE UPDATE ON public.challenge_results
  FOR EACH ROW EXECUTE FUNCTION public.challenges_set_updated_at();

-- =========================================================================
-- Passage.event_id cohérence : même équipe/club que le défi
-- =========================================================================
CREATE OR REPLACE FUNCTION public.challenge_passage_check_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team uuid; v_club uuid; v_ev_team uuid; v_ev_club uuid;
BEGIN
  IF NEW.event_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.team_id, c.club_id INTO v_team, v_club
    FROM public.challenges c WHERE c.id = NEW.challenge_id;
  SELECT e.team_id, t.club_id INTO v_ev_team, v_ev_club
    FROM public.events e JOIN public.teams t ON t.id = e.team_id
    WHERE e.id = NEW.event_id;
  IF v_ev_club IS DISTINCT FROM v_club THEN
    RAISE EXCEPTION 'challenge_passage.event_id club mismatch';
  END IF;
  IF v_team IS NOT NULL AND v_ev_team IS DISTINCT FROM v_team THEN
    RAISE EXCEPTION 'challenge_passage.event_id team mismatch';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_challenge_passage_check_event ON public.challenge_passages;
CREATE TRIGGER trg_challenge_passage_check_event
  BEFORE INSERT OR UPDATE OF event_id, challenge_id ON public.challenge_passages
  FOR EACH ROW EXECUTE FUNCTION public.challenge_passage_check_event();

-- =========================================================================
-- Helpers d'accès
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_club_staff(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_club_role(_user_id, _club_id, 'admin'::app_role)
      OR public.has_club_role(_user_id, _club_id, 'coach'::app_role)
      OR public.has_club_role(_user_id, _club_id, 'dirigeant'::app_role);
$$;

-- Utilisateur = joueur lui-même OU parent lié
CREATE OR REPLACE FUNCTION public.player_belongs_to_user(_user_id uuid, _player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p WHERE p.id = _player_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.player_parents pp
      WHERE pp.player_id = _player_id AND pp.parent_user_id = _user_id
  );
$$;

-- Utilisateur appartient à la team : staff-membre, joueur de la team, ou parent d'un joueur de la team
CREATE OR REPLACE FUNCTION public.user_is_in_team(_user_id uuid, _team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = _team_id AND tm.user_id = _user_id
  ) OR EXISTS (
    SELECT 1
      FROM public.team_members tm
      JOIN public.players p ON p.id = tm.player_id
      WHERE tm.team_id = _team_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1
      FROM public.team_members tm
      JOIN public.player_parents pp ON pp.player_id = tm.player_id
      WHERE tm.team_id = _team_id AND pp.parent_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_challenge(_user_id uuid, _challenge_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.challenges c
      WHERE c.id = _challenge_id AND (
        public.is_club_staff(_user_id, c.club_id)
        OR (
          c.ranking_visibility = 'category'
          AND c.kind = 'challenge'
          AND c.team_id IS NOT NULL
          AND public.user_is_in_team(_user_id, c.team_id)
        )
      )
  );
$$;

-- =========================================================================
-- Formules VO2
-- =========================================================================
CREATE OR REPLACE FUNCTION public.vo2_leger(_stage numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT ROUND((3.5 * (8 + 0.5 * (_stage - 1)))::numeric, 2);
$$;

CREATE OR REPLACE FUNCTION public.vo2_cooper(_distance_m numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT ROUND(((_distance_m - 504.9) / 44.73)::numeric, 2);
$$;

CREATE OR REPLACE FUNCTION public.vo2_age_factor(_age integer)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _age IS NULL THEN 1.0
    WHEN _age <= 10 THEN 0.90
    WHEN _age <= 12 THEN 0.94
    WHEN _age <= 14 THEN 0.98
    ELSE 1.0
  END::numeric;
$$;

-- =========================================================================
-- POLICIES
-- =========================================================================
DROP POLICY IF EXISTS challenges_select ON public.challenges;
CREATE POLICY challenges_select ON public.challenges FOR SELECT TO authenticated
USING (
  public.is_club_staff(auth.uid(), club_id)
  OR (
    ranking_visibility = 'category' AND kind = 'challenge'
    AND team_id IS NOT NULL AND public.user_is_in_team(auth.uid(), team_id)
  )
);

DROP POLICY IF EXISTS challenges_insert ON public.challenges;
CREATE POLICY challenges_insert ON public.challenges FOR INSERT TO authenticated
WITH CHECK (public.is_club_staff(auth.uid(), club_id));

DROP POLICY IF EXISTS challenges_update ON public.challenges;
CREATE POLICY challenges_update ON public.challenges FOR UPDATE TO authenticated
USING (public.is_club_staff(auth.uid(), club_id))
WITH CHECK (public.is_club_staff(auth.uid(), club_id));

DROP POLICY IF EXISTS challenges_delete ON public.challenges;
CREATE POLICY challenges_delete ON public.challenges FOR DELETE TO authenticated
USING (public.is_club_staff(auth.uid(), club_id));

DROP POLICY IF EXISTS challenge_passages_select ON public.challenge_passages;
CREATE POLICY challenge_passages_select ON public.challenge_passages FOR SELECT TO authenticated
USING (public.can_read_challenge(auth.uid(), challenge_id));

DROP POLICY IF EXISTS challenge_passages_write ON public.challenge_passages;
CREATE POLICY challenge_passages_write ON public.challenge_passages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND public.is_club_staff(auth.uid(), c.club_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND public.is_club_staff(auth.uid(), c.club_id)));

DROP POLICY IF EXISTS challenge_results_select ON public.challenge_results;
CREATE POLICY challenge_results_select ON public.challenge_results FOR SELECT TO authenticated
USING (
  public.player_belongs_to_user(auth.uid(), player_id)
  OR EXISTS (
    SELECT 1 FROM public.challenge_passages cp
      JOIN public.challenges c ON c.id = cp.challenge_id
      WHERE cp.id = passage_id AND (
        public.is_club_staff(auth.uid(), c.club_id)
        OR (
          c.ranking_visibility = 'category' AND c.kind = 'challenge'
          AND c.team_id IS NOT NULL AND public.user_is_in_team(auth.uid(), c.team_id)
        )
      )
  )
);

DROP POLICY IF EXISTS challenge_results_write ON public.challenge_results;
CREATE POLICY challenge_results_write ON public.challenge_results FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.challenge_passages cp JOIN public.challenges c ON c.id = cp.challenge_id
    WHERE cp.id = passage_id AND public.is_club_staff(auth.uid(), c.club_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.challenge_passages cp JOIN public.challenges c ON c.id = cp.challenge_id
    WHERE cp.id = passage_id AND public.is_club_staff(auth.uid(), c.club_id)
));
