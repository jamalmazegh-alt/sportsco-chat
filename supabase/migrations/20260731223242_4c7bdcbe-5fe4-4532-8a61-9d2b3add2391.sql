DROP POLICY IF EXISTS "Members can report club content" ON public.wall_content_reports;

CREATE POLICY "Members can report club content"
ON public.wall_content_reports FOR INSERT TO authenticated
WITH CHECK (
  reporter_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = wall_content_reports.club_id
  )
  AND EXISTS (
    SELECT 1 FROM public.wall_posts p
    WHERE p.id = wall_content_reports.post_id
      AND p.club_id = wall_content_reports.club_id
  )
  AND (
    wall_content_reports.comment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.wall_comments c
      WHERE c.id = wall_content_reports.comment_id
        AND c.post_id = wall_content_reports.post_id
    )
  )
);