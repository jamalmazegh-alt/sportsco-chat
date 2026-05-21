-- 1) Close role-escalation vulnerability: only club admins can insert club_members.
-- Self-onboarding goes through SECURITY DEFINER RPCs (redeem_member_invite, redeem_club_invite).
DROP POLICY IF EXISTS club_members_insert_admin_or_self_first ON public.club_members;
CREATE POLICY club_members_insert_admin
  ON public.club_members FOR INSERT
  WITH CHECK (
    public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR (user_id = auth.uid() AND role IN ('player'::app_role, 'parent'::app_role))
  );

-- 2) Fix infinite recursion: players_parent_media_update used EXISTS on player_parents,
-- whose own SELECT policy queries players → recursion. Use SECURITY DEFINER helper.
DROP POLICY IF EXISTS players_parent_media_update ON public.players;
CREATE POLICY players_parent_media_update
  ON public.players FOR UPDATE
  USING (public.is_parent_of_player(auth.uid(), id))
  WITH CHECK (public.is_parent_of_player(auth.uid(), id));
