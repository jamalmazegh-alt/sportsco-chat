
-- Helper: is the caller a manager of the club owning the camp whose storage path starts with 'camps/{campId}/…'
CREATE OR REPLACE FUNCTION public.user_can_manage_camp_storage(_user uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_camps c
    WHERE split_part(_name, '/', 1) = 'camps'
      AND c.id::text = split_part(_name, '/', 2)
      AND (
        public.has_club_role_text(_user, c.club_id, 'admin')
        OR public.has_club_role_text(_user, c.club_id, 'dirigeant')
        OR public.has_club_role_text(_user, c.club_id, 'coach')
      )
  )
$$;

-- Storage policies scoped to camps/{campId}/ prefix + club managers
DROP POLICY IF EXISTS camps_attachments_manager_insert ON storage.objects;
CREATE POLICY camps_attachments_manager_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND name LIKE 'camps/%'
    AND public.user_can_manage_camp_storage(auth.uid(), name)
  );

DROP POLICY IF EXISTS camps_attachments_manager_update ON storage.objects;
CREATE POLICY camps_attachments_manager_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND name LIKE 'camps/%'
    AND public.user_can_manage_camp_storage(auth.uid(), name)
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND name LIKE 'camps/%'
    AND public.user_can_manage_camp_storage(auth.uid(), name)
  );

DROP POLICY IF EXISTS camps_attachments_manager_delete ON storage.objects;
CREATE POLICY camps_attachments_manager_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND name LIKE 'camps/%'
    AND public.user_can_manage_camp_storage(auth.uid(), name)
  );

-- Purge every stored file under camps/{campId}/ when the camp is deleted
CREATE OR REPLACE FUNCTION public.purge_camp_storage_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id = 'attachments'
     AND name LIKE 'camps/' || OLD.id::text || '/%';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_camp_storage ON public.club_camps;
CREATE TRIGGER trg_purge_camp_storage
  BEFORE DELETE ON public.club_camps
  FOR EACH ROW EXECUTE FUNCTION public.purge_camp_storage_on_delete();
