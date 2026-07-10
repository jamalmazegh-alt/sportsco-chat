
DROP POLICY IF EXISTS team_images_coach_write ON storage.objects;
DROP POLICY IF EXISTS team_images_coach_update ON storage.objects;
DROP POLICY IF EXISTS team_images_coach_delete ON storage.objects;

CREATE POLICY team_images_coach_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-images'
    AND (
      public.has_club_role_any(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['admin','dirigeant','coach','assistant_coach','staff']
      )
      OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY team_images_coach_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-images'
    AND (
      public.has_club_role_any(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['admin','dirigeant','coach','assistant_coach','staff']
      )
      OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'team-images'
    AND (
      public.has_club_role_any(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['admin','dirigeant','coach','assistant_coach','staff']
      )
      OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY team_images_coach_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-images'
    AND (
      public.has_club_role_any(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid,
        ARRAY['admin','dirigeant','coach','assistant_coach','staff']
      )
      OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
    )
  );
