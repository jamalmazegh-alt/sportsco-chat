
-- =========================================================================
-- storage.objects RLS for camp-registration-documents (private bucket)
--
-- Read/write in this bucket goes through server-side code with service role
-- (submit endpoint uploads, admin URL signer). We still add restrictive RLS
-- as defense-in-depth so a leaked publishable/user JWT can never touch it.
-- =========================================================================

-- Read: club roles managing the parent camp only (path shape: <camp_id>/...)
CREATE POLICY "Club roles read camp registration files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'camp-registration-documents'
  AND public.can_manage_club_camp(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
);

-- Update / delete: same rule (rare — server does most of it via service role)
CREATE POLICY "Club roles update camp registration files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'camp-registration-documents'
  AND public.can_manage_club_camp(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'camp-registration-documents'
  AND public.can_manage_club_camp(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
);

CREATE POLICY "Club roles delete camp registration files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'camp-registration-documents'
  AND public.can_manage_club_camp(
    NULLIF((storage.foldername(name))[1], '')::uuid,
    auth.uid()
  )
);

-- No INSERT policy for authenticated users: uploads flow through the
-- server (service role bypasses RLS). Same for anon: no policies at all.
