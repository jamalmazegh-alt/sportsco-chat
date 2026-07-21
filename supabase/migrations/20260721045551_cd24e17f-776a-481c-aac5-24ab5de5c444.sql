
DROP POLICY IF EXISTS wall_posts_select ON public.wall_posts;
CREATE POLICY wall_posts_select ON public.wall_posts
  FOR SELECT
  USING (
    public.is_club_member(auth.uid(), club_id)
    AND (
      wall_posts.author_user_id = auth.uid()
      OR (
        audience_type <> 'group'
        AND public.user_in_wall_audience(auth.uid(), club_id, audience_team_ids)
      )
      OR (
        audience_type = 'group'
        AND (
          public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
          OR public.has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
          OR EXISTS (
            SELECT 1 FROM public.club_group_members cgm
            JOIN public.club_members cm ON cm.id = cgm.member_id
            WHERE cgm.group_id = ANY (wall_posts.audience_group_ids)
              AND cm.user_id = auth.uid()
          )
        )
      )
    )
  );
