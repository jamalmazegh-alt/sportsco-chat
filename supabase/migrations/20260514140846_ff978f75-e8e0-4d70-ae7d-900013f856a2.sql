-- Tighten can_view_team so non-admin members only see their assigned teams
CREATE OR REPLACE FUNCTION public.can_view_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = _team_id AND public.has_club_role(_user_id, t.club_id, 'admin'::app_role)
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = _team_id AND tm.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.player_parents pp ON pp.player_id = tm.player_id
      WHERE tm.team_id = _team_id AND pp.parent_user_id = _user_id
    );
$$;

-- Replace broad teams select policy with a scoped one
DROP POLICY IF EXISTS teams_select_member ON public.teams;
CREATE POLICY teams_select_member ON public.teams
FOR SELECT TO authenticated
USING (
  has_club_role(auth.uid(), club_id, 'admin'::app_role)
  OR can_view_team(auth.uid(), id)
);
