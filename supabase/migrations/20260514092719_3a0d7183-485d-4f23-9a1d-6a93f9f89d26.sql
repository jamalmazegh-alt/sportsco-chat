
-- Team distinctive image
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS image_url text;

-- Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('club-logos', 'club-logos', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('team-images', 'team-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for both buckets
CREATE POLICY "club_logos_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'club-logos');

CREATE POLICY "team_images_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'team-images');

-- Club admins can write under {club_id}/...
CREATE POLICY "club_logos_admin_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::public.app_role)
);
CREATE POLICY "club_logos_admin_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'club-logos'
  AND public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::public.app_role)
);
CREATE POLICY "club_logos_admin_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'club-logos'
  AND public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::public.app_role)
);

-- Team images: admin/coach of the club can write under {club_id}/{team_id}.ext
CREATE POLICY "team_images_coach_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'team-images'
  AND (
    public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::public.app_role)
    OR public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::public.app_role)
  )
);
CREATE POLICY "team_images_coach_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'team-images'
  AND (
    public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::public.app_role)
    OR public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::public.app_role)
  )
);
CREATE POLICY "team_images_coach_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'team-images'
  AND (
    public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::public.app_role)
    OR public.has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::public.app_role)
  )
);
