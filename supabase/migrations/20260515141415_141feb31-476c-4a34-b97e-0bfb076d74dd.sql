
-- Soft-delete columns
ALTER TABLE public.wall_posts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.wall_comments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Helpful indexes for "active" lookups and trash queries
CREATE INDEX IF NOT EXISTS idx_wall_posts_deleted_at ON public.wall_posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_wall_comments_deleted_at ON public.wall_comments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON public.events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_teams_deleted_at ON public.teams(deleted_at);
CREATE INDEX IF NOT EXISTS idx_players_deleted_at ON public.players(deleted_at);

-- Update soft-delete & restore RPCs (admin/coach only, scoped to club)
CREATE OR REPLACE FUNCTION public.soft_delete_entity(_kind text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_club uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF _kind = 'wall_post' THEN
    SELECT club_id INTO v_club FROM public.wall_posts WHERE id = _id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
    IF NOT (has_club_role(v_user, v_club, 'admin'::app_role)
            OR EXISTS (SELECT 1 FROM public.wall_posts WHERE id = _id AND author_user_id = v_user)) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    UPDATE public.wall_posts SET deleted_at = now() WHERE id = _id;

  ELSIF _kind = 'wall_comment' THEN
    SELECT p.club_id INTO v_club FROM public.wall_comments c
      JOIN public.wall_posts p ON p.id = c.post_id
      WHERE c.id = _id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
    IF NOT (has_club_role(v_user, v_club, 'admin'::app_role)
            OR EXISTS (SELECT 1 FROM public.wall_comments WHERE id = _id AND author_user_id = v_user)) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    UPDATE public.wall_comments SET deleted_at = now() WHERE id = _id;

  ELSIF _kind = 'event' THEN
    SELECT t.club_id INTO v_club FROM public.events e
      JOIN public.teams t ON t.id = e.team_id WHERE e.id = _id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _id AND is_team_coach(v_user, e.team_id)) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    UPDATE public.events SET deleted_at = now() WHERE id = _id;

  ELSIF _kind = 'team' THEN
    SELECT club_id INTO v_club FROM public.teams WHERE id = _id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
    IF NOT has_club_role(v_user, v_club, 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
    UPDATE public.teams SET deleted_at = now() WHERE id = _id;

  ELSIF _kind = 'player' THEN
    SELECT club_id INTO v_club FROM public.players WHERE id = _id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
    IF NOT (has_club_role(v_user, v_club, 'admin'::app_role)
            OR has_club_role(v_user, v_club, 'coach'::app_role)) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    UPDATE public.players SET deleted_at = now() WHERE id = _id;

  ELSE
    RAISE EXCEPTION 'Unknown kind: %', _kind;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_entity(_kind text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_club uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF _kind = 'wall_post' THEN
    SELECT club_id INTO v_club FROM public.wall_posts WHERE id = _id;
    IF NOT has_club_role(v_user, v_club, 'admin'::app_role) THEN
      IF NOT EXISTS (SELECT 1 FROM public.wall_posts WHERE id = _id AND author_user_id = v_user) THEN
        RAISE EXCEPTION 'Forbidden';
      END IF;
    END IF;
    UPDATE public.wall_posts SET deleted_at = NULL WHERE id = _id;

  ELSIF _kind = 'wall_comment' THEN
    SELECT p.club_id INTO v_club FROM public.wall_comments c
      JOIN public.wall_posts p ON p.id = c.post_id WHERE c.id = _id;
    IF NOT has_club_role(v_user, v_club, 'admin'::app_role) THEN
      IF NOT EXISTS (SELECT 1 FROM public.wall_comments WHERE id = _id AND author_user_id = v_user) THEN
        RAISE EXCEPTION 'Forbidden';
      END IF;
    END IF;
    UPDATE public.wall_comments SET deleted_at = NULL WHERE id = _id;

  ELSIF _kind = 'event' THEN
    IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _id AND is_team_coach(v_user, e.team_id)) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    UPDATE public.events SET deleted_at = NULL WHERE id = _id;

  ELSIF _kind = 'team' THEN
    SELECT club_id INTO v_club FROM public.teams WHERE id = _id;
    IF NOT has_club_role(v_user, v_club, 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
    UPDATE public.teams SET deleted_at = NULL WHERE id = _id;

  ELSIF _kind = 'player' THEN
    SELECT club_id INTO v_club FROM public.players WHERE id = _id;
    IF NOT (has_club_role(v_user, v_club, 'admin'::app_role)
            OR has_club_role(v_user, v_club, 'coach'::app_role)) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    UPDATE public.players SET deleted_at = NULL WHERE id = _id;

  ELSE
    RAISE EXCEPTION 'Unknown kind: %', _kind;
  END IF;
END;
$$;

-- Permanently purge items soft-deleted more than 7 days ago.
-- Safe to call from any admin client; only purges expired rows.
CREATE OR REPLACE FUNCTION public.purge_soft_deleted()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.wall_comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '7 days';
  DELETE FROM public.wall_posts    WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '7 days';
  DELETE FROM public.events        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '7 days';
  DELETE FROM public.teams         WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '7 days';
  DELETE FROM public.players       WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '7 days';
END;
$$;
