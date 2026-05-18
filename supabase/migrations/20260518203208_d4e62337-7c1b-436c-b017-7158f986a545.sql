
-- Visibility enum
DO $$ BEGIN
  CREATE TYPE public.feedback_visibility AS ENUM (
    'coach_only', 'staff', 'share_summary', 'parent_summary', 'player_summary'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ player_feedback ============
CREATE TABLE IF NOT EXISTS public.player_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  author_user_id uuid NOT NULL,
  rating smallint CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  comment text,
  dev_notes text,
  strengths text,
  improvements text,
  tags text[] NOT NULL DEFAULT '{}',
  visibility public.feedback_visibility NOT NULL DEFAULT 'coach_only',
  shared_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_player_feedback_player ON public.player_feedback(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_feedback_event  ON public.player_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_player_feedback_club   ON public.player_feedback(club_id);

DROP TRIGGER IF EXISTS trg_player_feedback_updated ON public.player_feedback;
CREATE TRIGGER trg_player_feedback_updated
  BEFORE UPDATE ON public.player_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.player_feedback ENABLE ROW LEVEL SECURITY;

-- Visibility helper
CREATE OR REPLACE FUNCTION public.can_view_player_feedback(_user_id uuid, _feedback_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_feedback f
    JOIN public.players p ON p.id = f.player_id
    WHERE f.id = _feedback_id
      AND f.deleted_at IS NULL
      AND (
        -- Coach/admin of the club can always see
        public.has_club_role(_user_id, f.club_id, 'admin'::app_role)
        OR public.has_club_role(_user_id, f.club_id, 'coach'::app_role)
        OR public.has_super_admin(_user_id)
        -- Staff-level visibility includes club dirigeants
        OR (f.visibility IN ('staff','share_summary','parent_summary','player_summary')
            AND public.has_club_role(_user_id, f.club_id, 'dirigeant'::app_role))
        -- Parents see summaries marked parent_summary
        OR (f.visibility IN ('parent_summary','share_summary')
            AND public.is_parent_of_player(_user_id, f.player_id))
        -- Player sees their own summary when visibility allows
        OR (f.visibility IN ('player_summary','share_summary')
            AND p.user_id = _user_id)
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_view_player_feedback(uuid, uuid) TO authenticated;

-- Helper: caller can author feedback for a given player (coach/admin of player's club)
CREATE OR REPLACE FUNCTION public.can_author_player_feedback(_user_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id
      AND (
        public.has_club_role(_user_id, p.club_id, 'admin'::app_role)
        OR public.has_club_role(_user_id, p.club_id, 'coach'::app_role)
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_author_player_feedback(uuid, uuid) TO authenticated;

-- Policies
DROP POLICY IF EXISTS player_feedback_select ON public.player_feedback;
CREATE POLICY player_feedback_select ON public.player_feedback
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_view_player_feedback(auth.uid(), id));

DROP POLICY IF EXISTS player_feedback_insert ON public.player_feedback;
CREATE POLICY player_feedback_insert ON public.player_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.can_author_player_feedback(auth.uid(), player_id)
  );

DROP POLICY IF EXISTS player_feedback_update ON public.player_feedback;
CREATE POLICY player_feedback_update ON public.player_feedback
  FOR UPDATE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
  )
  WITH CHECK (
    author_user_id = auth.uid()
    OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
  );

DROP POLICY IF EXISTS player_feedback_delete ON public.player_feedback;
CREATE POLICY player_feedback_delete ON public.player_feedback
  FOR DELETE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
  );

-- ============ player_reviews ============
CREATE TABLE IF NOT EXISTS public.player_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('end_of_season','meeting','development','coaching')),
  period_start date,
  period_end date,
  content text NOT NULL,
  visibility public.feedback_visibility NOT NULL DEFAULT 'coach_only',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_reviews_player ON public.player_reviews(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_reviews_club ON public.player_reviews(club_id);

ALTER TABLE public.player_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_player_review(_user_id uuid, _review_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_reviews r
    JOIN public.players p ON p.id = r.player_id
    WHERE r.id = _review_id
      AND (
        public.has_club_role(_user_id, r.club_id, 'admin'::app_role)
        OR public.has_club_role(_user_id, r.club_id, 'coach'::app_role)
        OR public.has_super_admin(_user_id)
        OR (r.visibility IN ('staff','share_summary','parent_summary','player_summary')
            AND public.has_club_role(_user_id, r.club_id, 'dirigeant'::app_role))
        OR (r.visibility IN ('parent_summary','share_summary')
            AND public.is_parent_of_player(_user_id, r.player_id))
        OR (r.visibility IN ('player_summary','share_summary')
            AND p.user_id = _user_id)
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_view_player_review(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS player_reviews_select ON public.player_reviews;
CREATE POLICY player_reviews_select ON public.player_reviews
  FOR SELECT TO authenticated
  USING (public.can_view_player_review(auth.uid(), id));

DROP POLICY IF EXISTS player_reviews_insert ON public.player_reviews;
CREATE POLICY player_reviews_insert ON public.player_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.can_author_player_feedback(auth.uid(), player_id)
  );

DROP POLICY IF EXISTS player_reviews_update ON public.player_reviews;
CREATE POLICY player_reviews_update ON public.player_reviews
  FOR UPDATE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
  )
  WITH CHECK (
    author_user_id = auth.uid()
    OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
  );

DROP POLICY IF EXISTS player_reviews_delete ON public.player_reviews;
CREATE POLICY player_reviews_delete ON public.player_reviews
  FOR DELETE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
  );
