CREATE POLICY member_invites_parent_child_player_insert
ON public.member_invites
FOR INSERT
TO authenticated
WITH CHECK (
  role = 'player'::public.app_role
  AND created_by = auth.uid()
  AND player_id IS NOT NULL
  AND parent_for_player_id IS NULL
  AND team_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.id = member_invites.player_id
      AND p.club_id = member_invites.club_id
      AND p.child_platform_access = true
      AND p.user_id IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM public.player_parents pp
    WHERE pp.player_id = member_invites.player_id
      AND pp.parent_user_id = auth.uid()
  )
);