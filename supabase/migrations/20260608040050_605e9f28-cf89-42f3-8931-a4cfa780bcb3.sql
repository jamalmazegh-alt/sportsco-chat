DROP POLICY IF EXISTS member_invites_admin_all ON public.member_invites;
DROP POLICY IF EXISTS member_invites_select_admin ON public.member_invites;

CREATE POLICY member_invites_manage ON public.member_invites
FOR ALL TO authenticated
USING (public.has_club_role_any(auth.uid(), club_id, ARRAY['admin','dirigeant','coach','assistant_coach','tournament_manager']))
WITH CHECK (public.has_club_role_any(auth.uid(), club_id, ARRAY['admin','dirigeant','coach','assistant_coach','tournament_manager']));