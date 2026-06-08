
-- Tighten member_invites RLS: a coach (without higher club role) can only
-- invite for a team where they are listed as coach in team_members.

DROP POLICY IF EXISTS member_invites_manage ON public.member_invites;

-- Admin/dirigeant/tournament_manager: full club-wide manage
CREATE POLICY member_invites_manage_admin
  ON public.member_invites
  FOR ALL
  TO authenticated
  USING (
    public.has_club_role_any(
      auth.uid(), club_id,
      ARRAY['admin','dirigeant','tournament_manager']
    )
  )
  WITH CHECK (
    public.has_club_role_any(
      auth.uid(), club_id,
      ARRAY['admin','dirigeant','tournament_manager']
    )
  );

-- Coach / assistant_coach: only for a team where they are coach in team_members
CREATE POLICY member_invites_manage_coach
  ON public.member_invites
  FOR ALL
  TO authenticated
  USING (
    public.has_club_role_any(
      auth.uid(), club_id,
      ARRAY['coach','assistant_coach']
    )
    AND team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = member_invites.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'coach'
    )
  )
  WITH CHECK (
    public.has_club_role_any(
      auth.uid(), club_id,
      ARRAY['coach','assistant_coach']
    )
    AND team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = member_invites.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'coach'
    )
  );
