
-- 1) Lock down U15 merge backup tables: enable RLS with no policies (deny all via PostgREST; service_role still bypasses for admin ops).
-- These backup tables are created ad-hoc on environments where the U15 merge ran (e.g. prod). They may not exist on other envs
-- (bughunt, fresh clones, CI DBs), so every ALTER/REVOKE below is wrapped in a to_regclass existence guard to keep the migration idempotent.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'public._backup_u15_merge_20260719_convocations',
    'public._backup_u15_merge_20260719_guardians',
    'public._backup_u15_merge_20260719_parents',
    'public._backup_u15_merge_20260719_players',
    'public._backup_u15_merge_20260719_team_members',
    'public._backup_u15_merge_20260719_timeline'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

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
