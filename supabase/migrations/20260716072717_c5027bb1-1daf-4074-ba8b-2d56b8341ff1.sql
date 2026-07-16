-- Fix: convocations_visibility_gate was RESTRICTIVE, but after dropping the
-- permissive convocations_select policy in the previous migration, no
-- PERMISSIVE SELECT policy remained on public.convocations. A RESTRICTIVE
-- policy cannot grant access on its own — Postgres requires at least one
-- PERMISSIVE policy to match. Result: players and parents could no longer
-- read their own convocations. Recreate the same gate as PERMISSIVE so it
-- is the single SELECT authority for the table.

DROP POLICY IF EXISTS convocations_visibility_gate ON public.convocations;

CREATE POLICY convocations_visibility_gate
  ON public.convocations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    is_team_staff_of_event(event_id, (SELECT auth.uid()))
    OR call_up_list_visible(event_id)
    OR player_id IN (
      SELECT players.id FROM public.players WHERE players.user_id = (SELECT auth.uid())
    )
    OR player_id IN (
      SELECT player_parents.player_id FROM public.player_parents
      WHERE player_parents.parent_user_id = (SELECT auth.uid())
    )
  );