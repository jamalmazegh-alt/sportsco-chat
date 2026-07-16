DROP POLICY IF EXISTS convocations_select ON public.convocations;

CREATE POLICY convocations_select
ON public.convocations
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.can_view_team(
    (SELECT auth.uid()),
    (
      SELECT e.team_id
      FROM public.events e
      WHERE e.id = convocations.event_id
    )
  )
  OR player_id IN (
    SELECT p.id
    FROM public.players p
    WHERE p.user_id = (SELECT auth.uid())
  )
  OR player_id IN (
    SELECT pp.player_id
    FROM public.player_parents pp
    WHERE pp.parent_user_id = (SELECT auth.uid())
  )
);