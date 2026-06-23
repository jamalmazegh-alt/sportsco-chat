-- Fix wall_posts INSERT ... RETURNING returning 42501.
-- Root cause: the SELECT policy called user_in_wall_post_audience(auth.uid(), id),
-- a STABLE SECURITY DEFINER function that re-reads public.wall_posts WHERE id = _post_id.
-- During INSERT ... RETURNING, PostgREST re-evaluates the SELECT policy on the new row,
-- but a STABLE function's snapshot does not see the row created by the current statement,
-- so the function returns false and the insert fails with "new row violates row-level
-- security policy". Fix by adding a row-driven variant that receives the row's columns
-- directly, and rewriting the SELECT policy to use it. Keep the post-id variant for
-- other callers (push dispatcher, etc.).

CREATE OR REPLACE FUNCTION public.user_in_wall_audience(
  _user uuid,
  _club_id uuid,
  _audience_team_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Club admins / dirigeants always see every post in their club.
    WHEN public.has_club_role(_user, _club_id, 'admin')
      OR public.has_club_role(_user, _club_id, 'dirigeant') THEN true
    -- Club-wide post: any club member.
    WHEN _audience_team_ids IS NULL THEN public.is_club_member(_user, _club_id)
    -- Team-scoped: user is staff/coach on one of the targeted teams.
    WHEN EXISTS (
      SELECT 1
      FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE t.id = ANY(_audience_team_ids)
        AND t.club_id = _club_id
        AND t.deleted_at IS NULL
        AND tm.user_id = _user
    ) THEN true
    -- Team-scoped: user is a player of one of the targeted teams.
    WHEN EXISTS (
      SELECT 1
      FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      JOIN public.players pl ON pl.id = tm.player_id AND pl.user_id = _user
      WHERE t.id = ANY(_audience_team_ids)
        AND t.club_id = _club_id
        AND t.deleted_at IS NULL
    ) THEN true
    -- Team-scoped: user is a tutor/parent of a player of one of the targeted teams.
    WHEN EXISTS (
      SELECT 1
      FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      JOIN public.players pl ON pl.id = tm.player_id
      JOIN public.player_parents pp ON pp.player_id = pl.id AND pp.parent_user_id = _user
      WHERE t.id = ANY(_audience_team_ids)
        AND t.club_id = _club_id
        AND t.deleted_at IS NULL
    ) THEN true
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.user_in_wall_audience(uuid, uuid, uuid[]) TO authenticated, service_role;

-- Rewrite SELECT policy to use the row-driven helper.
DROP POLICY IF EXISTS "wall_posts_select" ON public.wall_posts;
CREATE POLICY "wall_posts_select" ON public.wall_posts
  FOR SELECT TO authenticated
  USING (
    public.is_club_member(auth.uid(), club_id)
    AND public.user_in_wall_audience(auth.uid(), club_id, audience_team_ids)
  );