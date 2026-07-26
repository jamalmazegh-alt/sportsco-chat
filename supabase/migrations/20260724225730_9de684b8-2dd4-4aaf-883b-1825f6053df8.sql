-- Relax shape: team_staff can now target 1..N teams
ALTER TABLE public.wall_posts DROP CONSTRAINT IF EXISTS wall_posts_audience_shape_check;
ALTER TABLE public.wall_posts ADD CONSTRAINT wall_posts_audience_shape_check
  CHECK (
    (audience_type = 'club' AND audience_team_ids IS NULL AND audience_group_ids IS NULL)
    OR (audience_type = 'team' AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) = 1 AND audience_group_ids IS NULL)
    OR (audience_type = 'multi_team' AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) >= 2 AND audience_group_ids IS NULL)
    OR (audience_type = 'group' AND audience_team_ids IS NULL AND audience_group_ids IS NOT NULL AND cardinality(audience_group_ids) >= 1)
    OR (audience_type = 'team_staff' AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) >= 1 AND audience_group_ids IS NULL)
  );

-- SELECT policy: reader must be staff of at least one targeted team
DROP POLICY IF EXISTS wall_posts_select ON public.wall_posts;
CREATE POLICY wall_posts_select ON public.wall_posts
  FOR SELECT
  USING (
    is_club_member(auth.uid(), club_id)
    AND (
      author_user_id = auth.uid()
      OR (
        audience_type NOT IN ('group','team_staff')
        AND user_in_wall_audience(auth.uid(), club_id, audience_team_ids)
      )
      OR (
        audience_type = 'group'
        AND (
          has_club_role(auth.uid(), club_id, 'admin'::app_role)
          OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
          OR EXISTS (
            SELECT 1
            FROM club_group_members cgm
            JOIN club_members cm ON cm.id = cgm.member_id
            WHERE cgm.group_id = ANY (wall_posts.audience_group_ids)
              AND cm.user_id = auth.uid()
          )
        )
      )
      OR (
        audience_type = 'team_staff'
        AND audience_team_ids IS NOT NULL
        AND cardinality(audience_team_ids) >= 1
        AND EXISTS (
          SELECT 1
          FROM unnest(wall_posts.audience_team_ids) AS tid
          WHERE public.is_team_staff(tid, auth.uid())
        )
      )
    )
  );

-- INSERT policy: author must be staff of EVERY targeted team
DROP POLICY IF EXISTS wall_posts_insert ON public.wall_posts;
CREATE POLICY wall_posts_insert ON public.wall_posts
  FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    AND is_club_member(auth.uid(), club_id)
    AND (
      audience_type <> 'team_staff'
      OR (
        audience_team_ids IS NOT NULL
        AND cardinality(audience_team_ids) >= 1
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(wall_posts.audience_team_ids) AS tid
          WHERE NOT public.is_team_staff(tid, auth.uid())
        )
      )
    )
  );