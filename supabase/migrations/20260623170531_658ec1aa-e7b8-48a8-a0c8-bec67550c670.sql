
-- Wall posts: per-post audience (Option A)
ALTER TABLE public.wall_posts
  ADD COLUMN IF NOT EXISTS audience_team_ids uuid[],
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'club';

ALTER TABLE public.wall_posts
  DROP CONSTRAINT IF EXISTS wall_posts_audience_type_check;
ALTER TABLE public.wall_posts
  ADD CONSTRAINT wall_posts_audience_type_check
  CHECK (audience_type IN ('club','team','multi_team'));

ALTER TABLE public.wall_posts
  DROP CONSTRAINT IF EXISTS wall_posts_audience_cardinality_check;
ALTER TABLE public.wall_posts
  ADD CONSTRAINT wall_posts_audience_cardinality_check
  CHECK (audience_team_ids IS NULL OR cardinality(audience_team_ids) > 0);

ALTER TABLE public.wall_posts
  DROP CONSTRAINT IF EXISTS wall_posts_audience_shape_check;
ALTER TABLE public.wall_posts
  ADD CONSTRAINT wall_posts_audience_shape_check
  CHECK (
    (audience_team_ids IS NULL AND audience_type = 'club')
    OR (audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) = 1 AND audience_type = 'team')
    OR (audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) >= 2 AND audience_type = 'multi_team')
  );

CREATE INDEX IF NOT EXISTS idx_wall_posts_audience_teams
  ON public.wall_posts USING gin (audience_team_ids);

-- Trigger: validate audience at write time + compute discriminant server-side.
CREATE OR REPLACE FUNCTION public.wall_posts_validate_audience()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
  _tid uuid;
  _t_club uuid;
  _t_deleted timestamptz;
  _deduped uuid[];
BEGIN
  -- Dedupe + null-on-empty.
  IF NEW.audience_team_ids IS NOT NULL THEN
    SELECT ARRAY(SELECT DISTINCT unnest(NEW.audience_team_ids))
      INTO _deduped;
    IF _deduped IS NULL OR cardinality(_deduped) = 0 THEN
      NEW.audience_team_ids := NULL;
    ELSE
      NEW.audience_team_ids := _deduped;
    END IF;
  END IF;

  -- Compute discriminant (never trust the client).
  IF NEW.audience_team_ids IS NULL THEN
    NEW.audience_type := 'club';
  ELSIF cardinality(NEW.audience_team_ids) = 1 THEN
    NEW.audience_type := 'team';
  ELSE
    NEW.audience_type := 'multi_team';
  END IF;

  -- Authorization: admins/dirigeants can always target anything in their club.
  _is_priv := public.has_club_role(_uid, NEW.club_id, 'admin')
           OR public.has_club_role(_uid, NEW.club_id, 'dirigeant');

  IF NEW.audience_team_ids IS NOT NULL THEN
    FOREACH _tid IN ARRAY NEW.audience_team_ids LOOP
      SELECT t.club_id, t.deleted_at INTO _t_club, _t_deleted
      FROM public.teams t WHERE t.id = _tid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'wall_post audience: team % not found', _tid USING ERRCODE = '22023';
      END IF;
      IF _t_club <> NEW.club_id THEN
        RAISE EXCEPTION 'wall_post audience: team % is not in club %', _tid, NEW.club_id USING ERRCODE = '22023';
      END IF;
      IF _t_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'wall_post audience: team % is deleted', _tid USING ERRCODE = '22023';
      END IF;
      IF NOT _is_priv AND NOT public.is_team_coach(_uid, _tid) THEN
        RAISE EXCEPTION 'wall_post audience: user % cannot target team %', _uid, _tid USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wall_posts_validate_audience ON public.wall_posts;
CREATE TRIGGER trg_wall_posts_validate_audience
  BEFORE INSERT OR UPDATE OF audience_team_ids, club_id ON public.wall_posts
  FOR EACH ROW EXECUTE FUNCTION public.wall_posts_validate_audience();

-- Single source of truth for "is user in the audience of this post".
-- Used both by the SELECT policy (feed) and the push dispatcher.
CREATE OR REPLACE FUNCTION public.user_in_wall_post_audience(_user uuid, _post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT club_id, audience_team_ids
    FROM public.wall_posts
    WHERE id = _post_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM p) THEN false
    -- Club admins / dirigeants always see every post in their club.
    WHEN EXISTS (
      SELECT 1 FROM p
      WHERE public.has_club_role(_user, p.club_id, 'admin')
         OR public.has_club_role(_user, p.club_id, 'dirigeant')
    ) THEN true
    -- Club-wide post: any club member.
    WHEN EXISTS (
      SELECT 1 FROM p
      WHERE p.audience_team_ids IS NULL
        AND public.is_club_member(_user, p.club_id)
    ) THEN true
    -- Team-scoped: user is staff/coach on one of the targeted teams (still existing).
    WHEN EXISTS (
      SELECT 1
      FROM p
      JOIN public.teams t ON t.id = ANY(p.audience_team_ids)
       AND t.club_id = p.club_id
       AND t.deleted_at IS NULL
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = _user
    ) THEN true
    -- Team-scoped: user is a player of one of the targeted teams.
    WHEN EXISTS (
      SELECT 1
      FROM p
      JOIN public.teams t ON t.id = ANY(p.audience_team_ids)
       AND t.club_id = p.club_id
       AND t.deleted_at IS NULL
      JOIN public.team_members tm ON tm.team_id = t.id
      JOIN public.players pl ON pl.id = tm.player_id AND pl.user_id = _user
    ) THEN true
    -- Team-scoped: user is a tutor/parent of a player of one of the targeted teams.
    WHEN EXISTS (
      SELECT 1
      FROM p
      JOIN public.teams t ON t.id = ANY(p.audience_team_ids)
       AND t.club_id = p.club_id
       AND t.deleted_at IS NULL
      JOIN public.team_members tm ON tm.team_id = t.id
      JOIN public.players pl ON pl.id = tm.player_id
      JOIN public.player_parents pp ON pp.player_id = pl.id AND pp.parent_user_id = _user
    ) THEN true
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.user_in_wall_post_audience(uuid, uuid) TO authenticated, service_role;

-- Replace SELECT policy on wall_posts to enforce per-post audience.
DROP POLICY IF EXISTS "wall_posts_select" ON public.wall_posts;
CREATE POLICY "wall_posts_select" ON public.wall_posts
  FOR SELECT TO authenticated
  USING (
    public.is_club_member(auth.uid(), club_id)
    AND public.user_in_wall_post_audience(auth.uid(), id)
  );
