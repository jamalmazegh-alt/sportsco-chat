-- Helper qui vérifie le rôle via roles[] OU la colonne role (compat legacy)
CREATE OR REPLACE FUNCTION public.has_club_role_any(_user_id uuid, _club_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id
      AND club_id = _club_id
      AND (
        COALESCE(roles, ARRAY[]::text[]) && _roles
        OR role::text = ANY(_roles)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_club_role_any(uuid, uuid, text[]) TO authenticated, service_role;

-- Remplacer les policies club-logos pour qu'elles acceptent admin OU dirigeant
-- et tolèrent la colonne legacy `role` si `roles[]` est vide.
DROP POLICY IF EXISTS club_logos_admin_write ON storage.objects;
DROP POLICY IF EXISTS club_logos_admin_update ON storage.objects;
DROP POLICY IF EXISTS club_logos_admin_delete ON storage.objects;

CREATE POLICY club_logos_admin_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'club-logos'
    AND public.has_club_role_any(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['admin','dirigeant']
    )
  );

CREATE POLICY club_logos_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND public.has_club_role_any(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['admin','dirigeant']
    )
  )
  WITH CHECK (
    bucket_id = 'club-logos'
    AND public.has_club_role_any(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['admin','dirigeant']
    )
  );

CREATE POLICY club_logos_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND public.has_club_role_any(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['admin','dirigeant']
    )
  );