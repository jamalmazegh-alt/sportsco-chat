
-- =====================================================================
-- Player Journey: achievements, seasons, timeline
-- =====================================================================

-- ---------- Helper: season label from a date (Jul-Jun) ----------------
CREATE OR REPLACE FUNCTION public.compute_season_label(_dt date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _dt IS NULL THEN NULL
    WHEN EXTRACT(MONTH FROM _dt) >= 7
      THEN EXTRACT(YEAR FROM _dt)::int::text || '-' || (EXTRACT(YEAR FROM _dt)::int + 1)::text
    ELSE (EXTRACT(YEAR FROM _dt)::int - 1)::text || '-' || EXTRACT(YEAR FROM _dt)::int::text
  END;
$$;

-- =====================================================================
-- TABLE: player_achievements
-- =====================================================================
CREATE TABLE public.player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id   uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  season_label text,
  title text NOT NULL,
  achievement_type text NOT NULL CHECK (achievement_type IN (
    'champion','runner_up','tournament_winner','tournament_finalist','semi_finalist',
    'mvp','top_scorer','best_goalkeeper','best_defender','captain',
    'matches_100','selection','special_award','other'
  )),
  description text,
  achievement_date date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','tournament','league','coach','system')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed','hidden','rejected')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','club','public')),
  related_tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_achievements_player ON public.player_achievements(player_id);
CREATE INDEX idx_player_achievements_club   ON public.player_achievements(club_id);
CREATE INDEX idx_player_achievements_tournament ON public.player_achievements(related_tournament_id) WHERE related_tournament_id IS NOT NULL;
-- Avoid duplicate auto-generated tournament achievements
CREATE UNIQUE INDEX uq_player_achievements_tournament_auto
  ON public.player_achievements(player_id, related_tournament_id, achievement_type)
  WHERE source = 'tournament';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_achievements TO authenticated;
GRANT SELECT ON public.player_achievements TO anon;
GRANT ALL ON public.player_achievements TO service_role;

ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- TABLE: player_seasons (coach summaries; stats come from a view)
-- =====================================================================
CREATE TABLE public.player_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id   uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  season_label text NOT NULL,
  sport text,
  category text,
  primary_position text,
  secondary_position text,
  coach_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, club_id, season_label)
);

CREATE INDEX idx_player_seasons_player ON public.player_seasons(player_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_seasons TO authenticated;
GRANT ALL ON public.player_seasons TO service_role;

ALTER TABLE public.player_seasons ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- TABLE: player_timeline_events
-- =====================================================================
CREATE TABLE public.player_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id   uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'joined_club','joined_team','first_match','first_goal','matches_milestone',
    'achievement','tournament_participation','season_completed','transfer','selection','other'
  )),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('system','manual','coach')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','club','public')),
  related_achievement_id uuid REFERENCES public.player_achievements(id) ON DELETE SET NULL,
  related_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  -- payload to deduplicate system events (e.g. milestone count)
  dedup_key text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_timeline_player ON public.player_timeline_events(player_id, event_date DESC);
CREATE UNIQUE INDEX uq_player_timeline_dedup
  ON public.player_timeline_events(player_id, event_type, dedup_key)
  WHERE dedup_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_timeline_events TO authenticated;
GRANT SELECT ON public.player_timeline_events TO anon;
GRANT ALL ON public.player_timeline_events TO service_role;

ALTER TABLE public.player_timeline_events ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- VIEW: player_season_stats (computed from convocations + event_goals)
-- =====================================================================
CREATE OR REPLACE VIEW public.player_season_stats AS
WITH conv AS (
  SELECT
    c.player_id,
    p.club_id,
    e.team_id,
    public.compute_season_label(e.starts_at::date) AS season_label,
    e.type,
    c.status
  FROM public.convocations c
  JOIN public.events  e ON e.id = c.event_id AND e.deleted_at IS NULL
  JOIN public.players p ON p.id = c.player_id
  WHERE p.deleted_at IS NULL
),
matches AS (
  SELECT player_id, club_id, team_id, season_label,
    COUNT(*) FILTER (WHERE type = 'match' AND status = 'present') AS matches_count,
    COUNT(*) FILTER (WHERE status = 'present')                    AS present_count,
    COUNT(*) FILTER (WHERE status IN ('present','absent'))        AS attendance_total
  FROM conv
  GROUP BY player_id, club_id, team_id, season_label
),
goals AS (
  SELECT g.scorer_player_id AS player_id,
         p.club_id,
         e.team_id,
         public.compute_season_label(e.starts_at::date) AS season_label,
         COUNT(*) AS goals_count
  FROM public.event_goals g
  JOIN public.events  e ON e.id = g.event_id
  JOIN public.players p ON p.id = g.scorer_player_id
  WHERE g.scorer_player_id IS NOT NULL
  GROUP BY g.scorer_player_id, p.club_id, e.team_id, public.compute_season_label(e.starts_at::date)
),
assists AS (
  SELECT g.assist_player_id AS player_id,
         p.club_id,
         e.team_id,
         public.compute_season_label(e.starts_at::date) AS season_label,
         COUNT(*) AS assists_count
  FROM public.event_goals g
  JOIN public.events  e ON e.id = g.event_id
  JOIN public.players p ON p.id = g.assist_player_id
  WHERE g.assist_player_id IS NOT NULL
  GROUP BY g.assist_player_id, p.club_id, e.team_id, public.compute_season_label(e.starts_at::date)
)
SELECT
  m.player_id,
  m.club_id,
  m.team_id,
  m.season_label,
  m.matches_count,
  COALESCE(g.goals_count, 0)   AS goals_count,
  COALESCE(a.assists_count, 0) AS assists_count,
  CASE WHEN m.attendance_total > 0
       THEN ROUND((m.present_count::numeric * 100.0) / m.attendance_total, 1)
       ELSE NULL END           AS attendance_rate
FROM matches m
LEFT JOIN goals   g USING (player_id, club_id, team_id, season_label)
LEFT JOIN assists a USING (player_id, club_id, team_id, season_label)
WHERE m.season_label IS NOT NULL;

GRANT SELECT ON public.player_season_stats TO authenticated, anon, service_role;

-- =====================================================================
-- RLS HELPER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.can_view_player_journey(_user_id uuid, _player_id uuid, _visibility text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN _visibility = 'public' THEN true
    WHEN _user_id IS NULL THEN false
    WHEN _visibility = 'club' THEN EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = _player_id AND public.is_club_member(_user_id, p.club_id)
    )
    ELSE -- private
      EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = _player_id
          AND (
            p.user_id = _user_id
            OR public.is_parent_of_player(_user_id, _player_id)
            OR public.has_club_role(_user_id, p.club_id, 'admin'::app_role)
            OR public.has_club_role(_user_id, p.club_id, 'coach'::app_role)
            OR public.has_club_role(_user_id, p.club_id, 'dirigeant'::app_role)
            OR public.has_super_admin(_user_id)
          )
      )
  END;
$$;

-- Helper: can edit (coach/admin of club, or parent of player)
CREATE OR REPLACE FUNCTION public.can_edit_player_journey(_user_id uuid, _player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id
      AND (
        public.has_club_role(_user_id, p.club_id, 'admin'::app_role)
        OR public.has_club_role(_user_id, p.club_id, 'coach'::app_role)
        OR public.has_club_role(_user_id, p.club_id, 'dirigeant'::app_role)
        OR public.has_super_admin(_user_id)
        OR public.is_parent_of_player(_user_id, _player_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_player_club_admin(_user_id uuid, _player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id
      AND (public.has_club_role(_user_id, p.club_id, 'admin'::app_role) OR public.has_super_admin(_user_id))
  );
$$;

-- =====================================================================
-- RLS POLICIES: player_achievements
-- =====================================================================
CREATE POLICY "achievements_select"
ON public.player_achievements FOR SELECT
USING (
  status NOT IN ('hidden','rejected') OR public.can_edit_player_journey(auth.uid(), player_id)
);
-- The visibility gate is applied through can_view_player_journey:
CREATE POLICY "achievements_select_visibility"
ON public.player_achievements FOR SELECT
USING (public.can_view_player_journey(auth.uid(), player_id, visibility));

-- Note: multiple SELECT policies are OR'ed. Keep just the visibility one and drop the first.
DROP POLICY "achievements_select" ON public.player_achievements;

CREATE POLICY "achievements_insert"
ON public.player_achievements FOR INSERT
WITH CHECK (public.can_edit_player_journey(auth.uid(), player_id));

CREATE POLICY "achievements_update"
ON public.player_achievements FOR UPDATE
USING (public.can_edit_player_journey(auth.uid(), player_id))
WITH CHECK (public.can_edit_player_journey(auth.uid(), player_id));

CREATE POLICY "achievements_delete"
ON public.player_achievements FOR DELETE
USING (public.is_player_club_admin(auth.uid(), player_id));

-- =====================================================================
-- RLS POLICIES: player_seasons
-- =====================================================================
CREATE POLICY "seasons_select"
ON public.player_seasons FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id AND public.is_club_member(auth.uid(), p.club_id)
  )
);

CREATE POLICY "seasons_insert"
ON public.player_seasons FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
);

CREATE POLICY "seasons_update"
ON public.player_seasons FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
)
WITH CHECK (true);

CREATE POLICY "seasons_delete"
ON public.player_seasons FOR DELETE
USING (public.is_player_club_admin(auth.uid(), player_id));

-- =====================================================================
-- RLS POLICIES: player_timeline_events
-- =====================================================================
CREATE POLICY "timeline_select_visibility"
ON public.player_timeline_events FOR SELECT
USING (public.can_view_player_journey(auth.uid(), player_id, visibility));

CREATE POLICY "timeline_insert"
ON public.player_timeline_events FOR INSERT
WITH CHECK (public.can_edit_player_journey(auth.uid(), player_id));

CREATE POLICY "timeline_update"
ON public.player_timeline_events FOR UPDATE
USING (public.can_edit_player_journey(auth.uid(), player_id))
WITH CHECK (public.can_edit_player_journey(auth.uid(), player_id));

CREATE POLICY "timeline_delete"
ON public.player_timeline_events FOR DELETE
USING (public.is_player_club_admin(auth.uid(), player_id));

-- =====================================================================
-- TRIGGER: minor privacy enforcement + updated_at
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_minor_visibility_achievements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.player_is_minor(NEW.player_id) AND NEW.visibility = 'public' THEN
    NEW.visibility := 'private';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_achievements_minor_visibility
BEFORE INSERT OR UPDATE OF visibility ON public.player_achievements
FOR EACH ROW EXECUTE FUNCTION public.enforce_minor_visibility_achievements();

CREATE TRIGGER trg_achievements_updated_at
BEFORE UPDATE ON public.player_achievements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_seasons_updated_at
BEFORE UPDATE ON public.player_seasons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_minor_visibility_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.player_is_minor(NEW.player_id) AND NEW.visibility = 'public' THEN
    NEW.visibility := 'private';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_timeline_minor_visibility
BEFORE INSERT OR UPDATE OF visibility ON public.player_timeline_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_minor_visibility_timeline();

-- =====================================================================
-- TRIGGER: team_members INSERT -> joined_club / joined_team
-- =====================================================================
CREATE OR REPLACE FUNCTION public.on_team_member_added_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_club uuid;
  v_team_name text;
  v_club_name text;
BEGIN
  IF NEW.player_id IS NULL THEN RETURN NEW; END IF;
  SELECT t.club_id, t.name, c.name
    INTO v_club, v_team_name, v_club_name
  FROM public.teams t JOIN public.clubs c ON c.id = t.club_id
  WHERE t.id = NEW.team_id;
  IF v_club IS NULL THEN RETURN NEW; END IF;

  -- joined_club (only once per club)
  INSERT INTO public.player_timeline_events
    (player_id, club_id, team_id, event_type, title, event_date, source, dedup_key)
  VALUES (NEW.player_id, v_club, NEW.team_id, 'joined_club',
          COALESCE(v_club_name, 'Club'), CURRENT_DATE, 'system',
          'club:' || v_club::text)
  ON CONFLICT DO NOTHING;

  -- joined_team (one per team)
  INSERT INTO public.player_timeline_events
    (player_id, club_id, team_id, event_type, title, event_date, source, dedup_key)
  VALUES (NEW.player_id, v_club, NEW.team_id, 'joined_team',
          COALESCE(v_team_name, 'Équipe'), CURRENT_DATE, 'system',
          'team:' || NEW.team_id::text)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_team_members_journey
AFTER INSERT ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.on_team_member_added_journey();

-- =====================================================================
-- TRIGGER: convocations UPDATE -> first_match + matches_milestone
-- =====================================================================
CREATE OR REPLACE FUNCTION public.on_convocation_present_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_club uuid;
  v_total int;
  v_milestone int;
BEGIN
  IF NEW.status <> 'present' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'present' THEN RETURN NEW; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;
  IF v_event.id IS NULL OR v_event.type <> 'match' THEN RETURN NEW; END IF;

  SELECT club_id INTO v_club FROM public.players WHERE id = NEW.player_id;
  IF v_club IS NULL THEN RETURN NEW; END IF;

  -- first_match
  INSERT INTO public.player_timeline_events
    (player_id, club_id, team_id, event_type, title, event_date, source, related_event_id, dedup_key)
  VALUES (NEW.player_id, v_club, v_event.team_id, 'first_match',
          COALESCE(v_event.title, 'Premier match'),
          v_event.starts_at::date, 'system', v_event.id, 'first_match')
  ON CONFLICT DO NOTHING;

  -- matches milestones
  SELECT COUNT(*) INTO v_total
  FROM public.convocations c
  JOIN public.events e ON e.id = c.event_id
  WHERE c.player_id = NEW.player_id AND c.status = 'present' AND e.type = 'match';

  FOREACH v_milestone IN ARRAY ARRAY[10,25,50,100] LOOP
    IF v_total = v_milestone THEN
      INSERT INTO public.player_timeline_events
        (player_id, club_id, team_id, event_type, title, description, event_date, source, dedup_key)
      VALUES (NEW.player_id, v_club, v_event.team_id, 'matches_milestone',
              v_milestone::text || ' matchs joués', NULL,
              v_event.starts_at::date, 'system',
              'milestone:' || v_milestone::text)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_convocations_journey
AFTER INSERT OR UPDATE OF status ON public.convocations
FOR EACH ROW EXECUTE FUNCTION public.on_convocation_present_journey();

-- =====================================================================
-- TRIGGER: event_goals INSERT -> first_goal
-- =====================================================================
CREATE OR REPLACE FUNCTION public.on_event_goal_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_club uuid;
  v_event public.events%ROWTYPE;
BEGIN
  IF NEW.scorer_player_id IS NULL THEN RETURN NEW; END IF;
  SELECT club_id INTO v_club FROM public.players WHERE id = NEW.scorer_player_id;
  IF v_club IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;
  IF v_event.id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.player_timeline_events
    (player_id, club_id, team_id, event_type, title, event_date, source, related_event_id, dedup_key)
  VALUES (NEW.scorer_player_id, v_club, v_event.team_id, 'first_goal',
          'Premier but', v_event.starts_at::date, 'system', v_event.id, 'first_goal')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_event_goals_journey
AFTER INSERT ON public.event_goals
FOR EACH ROW EXECUTE FUNCTION public.on_event_goal_journey();

-- =====================================================================
-- TRIGGER: achievement confirmed -> timeline 'achievement'
-- =====================================================================
CREATE OR REPLACE FUNCTION public.on_achievement_confirmed_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    INSERT INTO public.player_timeline_events
      (player_id, club_id, team_id, event_type, title, description, event_date,
       source, visibility, related_achievement_id, dedup_key)
    VALUES (NEW.player_id, NEW.club_id, NEW.team_id, 'achievement',
            NEW.title, NEW.description, COALESCE(NEW.achievement_date, CURRENT_DATE),
            'system', NEW.visibility, NEW.id, 'achievement:' || NEW.id::text)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_achievement_confirmed_journey
AFTER INSERT OR UPDATE OF status ON public.player_achievements
FOR EACH ROW EXECUTE FUNCTION public.on_achievement_confirmed_journey();

-- =====================================================================
-- TRIGGER: tournament completed -> suggested achievements for winner/finalist
-- =====================================================================
CREATE OR REPLACE FUNCTION public.on_tournament_completed_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_final RECORD;
  v_season text;
  v_winner_team uuid;
  v_finalist_team uuid;
BEGIN
  IF NEW.status <> 'completed' OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  v_season := public.compute_season_label(COALESCE(NEW.start_date, CURRENT_DATE));

  -- Find the final match (latest "final" round, completed)
  SELECT m.winner_team_id,
         CASE WHEN m.winner_team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END AS finalist
    INTO v_winner_team, v_finalist_team
  FROM public.tournament_matches m
  WHERE m.tournament_id = NEW.id
    AND m.round = 'final'
    AND m.status = 'completed'
    AND m.winner_team_id IS NOT NULL
  ORDER BY m.scheduled_at DESC NULLS LAST
  LIMIT 1;

  IF v_winner_team IS NOT NULL THEN
    -- Tournament teams -> link to a real club team via tournament_teams.team_id
    INSERT INTO public.player_achievements
      (player_id, club_id, team_id, season_label, title, achievement_type,
       source, status, visibility, related_tournament_id)
    SELECT DISTINCT
      tm.player_id,
      p.club_id,
      tt.team_id,
      v_season,
      NEW.name || COALESCE(' — ' || v_season, ''),
      'tournament_winner',
      'tournament', 'suggested', 'private',
      NEW.id
    FROM public.tournament_teams tt
    JOIN public.team_members tm ON tm.team_id = tt.team_id AND tm.player_id IS NOT NULL
    JOIN public.players p ON p.id = tm.player_id AND p.deleted_at IS NULL
    WHERE tt.id = v_winner_team
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_finalist_team IS NOT NULL THEN
    INSERT INTO public.player_achievements
      (player_id, club_id, team_id, season_label, title, achievement_type,
       source, status, visibility, related_tournament_id)
    SELECT DISTINCT
      tm.player_id, p.club_id, tt.team_id, v_season,
      NEW.name || COALESCE(' — ' || v_season, ''),
      'tournament_finalist',
      'tournament', 'suggested', 'private',
      NEW.id
    FROM public.tournament_teams tt
    JOIN public.team_members tm ON tm.team_id = tt.team_id AND tm.player_id IS NOT NULL
    JOIN public.players p ON p.id = tm.player_id AND p.deleted_at IS NULL
    WHERE tt.id = v_finalist_team
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_tournament_completed_journey
AFTER UPDATE OF status ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.on_tournament_completed_journey();
