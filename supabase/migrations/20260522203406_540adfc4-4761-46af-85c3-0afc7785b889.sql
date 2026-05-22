-- 1) Tournament team players: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS ttp_select ON public.tournament_team_players;
CREATE POLICY ttp_select
  ON public.tournament_team_players
  FOR SELECT
  TO authenticated
  USING (can_view_tournament(auth.uid(), tournament_id));

-- 2) Storage 'player-photos' bucket: drop overly broad policies and add club-role scoped ones
DROP POLICY IF EXISTS player_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS player_photos_auth_write ON storage.objects;
DROP POLICY IF EXISTS player_photos_auth_update ON storage.objects;
DROP POLICY IF EXISTS player_photos_auth_delete ON storage.objects;

-- Path convention: <club_id>/<player_id>.<ext>  (set by the client)
-- INSERT: caller must be admin or coach of the target club (first path segment)
CREATE POLICY player_photos_club_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (
      has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
      OR has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::app_role)
    )
  );

CREATE POLICY player_photos_club_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (
      has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
      OR has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (
      has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
      OR has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::app_role)
    )
  );

CREATE POLICY player_photos_club_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (
      has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin'::app_role)
      OR has_club_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'coach'::app_role)
    )
  );
-- Note: no SELECT policy is needed because the bucket is public — files remain
-- reachable via getPublicUrl, while listing through the API is now disabled.