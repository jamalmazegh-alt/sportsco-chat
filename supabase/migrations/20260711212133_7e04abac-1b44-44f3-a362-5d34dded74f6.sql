-- RLS policies on storage.objects for camp-covers bucket
-- Read: public (bucket is public, covers are meant to be shared on flyers/OG)
-- Write/Update/Delete: admins/dirigeants of the club owning the camp

CREATE POLICY "camp-covers: public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'camp-covers');

CREATE POLICY "camp-covers: managers insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'camp-covers'
  AND EXISTS (
    SELECT 1 FROM public.club_camps c
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.can_manage_club_camp(auth.uid(), c.id)
  )
);

CREATE POLICY "camp-covers: managers update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'camp-covers'
  AND EXISTS (
    SELECT 1 FROM public.club_camps c
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.can_manage_club_camp(auth.uid(), c.id)
  )
);

CREATE POLICY "camp-covers: managers delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'camp-covers'
  AND EXISTS (
    SELECT 1 FROM public.club_camps c
    WHERE c.id::text = split_part(name, '/', 1)
      AND public.can_manage_club_camp(auth.uid(), c.id)
  )
);
