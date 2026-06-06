DROP POLICY IF EXISTS players_select_clubmate ON public.players;

CREATE POLICY players_select_team_viewer
ON public.players
FOR SELECT
TO authenticated
USING (
  public.is_club_member(auth.uid(), club_id)
  OR public.has_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.player_id = players.id
      AND public.can_view_team(auth.uid(), tm.team_id)
  )
);