-- Tighten player_parents SELECT
DROP POLICY IF EXISTS player_parents_select ON public.player_parents;

CREATE POLICY player_parents_select ON public.player_parents
FOR SELECT
USING (
  parent_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_parents.player_id
      AND (
        has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
  OR public.has_super_admin(auth.uid())
);
