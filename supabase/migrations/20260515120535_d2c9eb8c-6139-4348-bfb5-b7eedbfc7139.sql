-- Tighten player_parents: remove self-insert path.
-- Parent linkage must be created by admin/coach (via invite) and the parent
-- user can only attach themselves through redeem_member_invite (SECURITY DEFINER).
DROP POLICY IF EXISTS player_parents_write_admin_coach_or_self ON public.player_parents;

-- INSERT: admin/coach of the player's club only
CREATE POLICY player_parents_insert_admin_coach
ON public.player_parents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_parents.player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
);

-- UPDATE: admin/coach of the club, or the parent themselves on their own row
CREATE POLICY player_parents_update_admin_coach_or_self
ON public.player_parents
FOR UPDATE
TO authenticated
USING (
  parent_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_parents.player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
)
WITH CHECK (
  parent_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_parents.player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
);

-- DELETE: admin/coach only
CREATE POLICY player_parents_delete_admin_coach
ON public.player_parents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_parents.player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
);