
-- 1) Lock down U15 merge backup tables: enable RLS with no policies (deny all via PostgREST; service_role still bypasses for admin ops).
ALTER TABLE public._backup_u15_merge_20260719_convocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_guardians    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_parents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_timeline     ENABLE ROW LEVEL SECURITY;

-- Force RLS so even table owner is subject to policies via PostgREST; explicitly revoke any lingering grants from anon/authenticated.
ALTER TABLE public._backup_u15_merge_20260719_convocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_guardians    FORCE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_parents      FORCE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_players      FORCE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_team_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public._backup_u15_merge_20260719_timeline     FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public._backup_u15_merge_20260719_convocations FROM anon, authenticated;
REVOKE ALL ON public._backup_u15_merge_20260719_guardians    FROM anon, authenticated;
REVOKE ALL ON public._backup_u15_merge_20260719_parents      FROM anon, authenticated;
REVOKE ALL ON public._backup_u15_merge_20260719_players      FROM anon, authenticated;
REVOKE ALL ON public._backup_u15_merge_20260719_team_members FROM anon, authenticated;
REVOKE ALL ON public._backup_u15_merge_20260719_timeline     FROM anon, authenticated;

-- 2) Drop broad SELECT policy on the public 'camp-covers' bucket. Bucket is public so files remain accessible via direct CDN URL, but clients can no longer LIST files.
DROP POLICY IF EXISTS "camp-covers: public read" ON storage.objects;

-- 3) Fix broken staff policy on publication-media: compare against the object's own name, not clubs.name.
DROP POLICY IF EXISTS "publication_media_staff_all" ON storage.objects;
CREATE POLICY "publication_media_staff_all"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'publication-media'
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id::text = split_part(storage.objects.name, '/', 1)
        AND public.is_club_staff(auth.uid(), c.id)
    )
  )
  WITH CHECK (
    bucket_id = 'publication-media'
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id::text = split_part(storage.objects.name, '/', 1)
        AND public.is_club_staff(auth.uid(), c.id)
    )
  );
