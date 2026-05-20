-- Allow team coaches AND club admins/dirigeants to read draft lineups,
-- and surface 'staff' visibility to admins & dirigeants.
DROP POLICY IF EXISTS event_lineups_select_viewer ON public.event_lineups;

CREATE POLICY event_lineups_select_viewer
ON public.event_lineups
FOR SELECT
TO authenticated
USING (
  -- Coaches of the team always see their own lineups (draft or published)
  is_team_coach(auth.uid(), team_id)
  -- Club admins always see all lineups of their club
  OR has_club_role(auth.uid(), club_id, 'admin'::app_role)
  -- Dirigeants see published team-wide or staff-restricted lineups
  OR (
    published_at IS NOT NULL
    AND has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
    AND visibility IN ('team'::lineup_visibility, 'staff'::lineup_visibility)
  )
  -- Regular viewers (players/parents) see published lineups according to visibility
  OR (
    published_at IS NOT NULL
    AND can_view_team(auth.uid(), team_id)
    AND (
      visibility = 'team'::lineup_visibility
      OR (
        visibility = 'selected_players'::lineup_visibility
        AND EXISTS (
          SELECT 1
          FROM convocations c
          JOIN players p ON p.id = c.player_id
          WHERE c.event_id = event_lineups.event_id
            AND (
              p.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM player_parents pp
                WHERE pp.player_id = p.id
                  AND pp.parent_user_id = auth.uid()
              )
            )
            AND c.status <> 'absent'::attendance_status
        )
      )
    )
  )
);