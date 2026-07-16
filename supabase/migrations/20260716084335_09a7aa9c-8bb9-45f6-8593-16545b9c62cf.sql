
-- Restore team-scope base + convert gate to RESTRICTIVE, mirroring event_lineups.
DROP POLICY IF EXISTS convocations_visibility_gate ON public.convocations;
DROP POLICY IF EXISTS convocations_select ON public.convocations;

-- PERMISSIVE base: must be able to view the event's team
CREATE POLICY convocations_select
ON public.convocations
FOR SELECT
TO authenticated
USING (
  public.can_view_team(
    (SELECT auth.uid()),
    (SELECT e.team_id FROM public.events e WHERE e.id = convocations.event_id)
  )
);

-- RESTRICTIVE gate: staff OR list visible OR self OR parent-linked
CREATE POLICY convocations_visibility_gate
ON public.convocations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_team_staff_of_event(event_id, (SELECT auth.uid()))
  OR public.call_up_list_visible(event_id)
  OR player_id IN (
    SELECT p.id FROM public.players p WHERE p.user_id = (SELECT auth.uid())
  )
  OR player_id IN (
    SELECT pp.player_id FROM public.player_parents pp
    WHERE pp.parent_user_id = (SELECT auth.uid())
  )
);
