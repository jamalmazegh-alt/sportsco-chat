
CREATE OR REPLACE FUNCTION public.can_manage_player_photo(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _club_id uuid;
  _player_id uuid;
  _parts text[];
BEGIN
  IF _user_id IS NULL OR _object_name IS NULL THEN
    RETURN false;
  END IF;
  _parts := storage.foldername(_object_name);
  IF array_length(_parts, 1) IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    _club_id := _parts[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF public.has_club_role(_user_id, _club_id, 'admin'::app_role)
     OR public.has_club_role(_user_id, _club_id, 'coach'::app_role) THEN
    RETURN true;
  END IF;

  BEGIN
    _player_id := split_part(regexp_replace(_object_name, '^.*/', ''), '.', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN public.is_parent_of_player(_user_id, _player_id);
END;
$$;

DROP POLICY IF EXISTS player_photos_club_insert ON storage.objects;
DROP POLICY IF EXISTS player_photos_club_update ON storage.objects;
DROP POLICY IF EXISTS player_photos_club_delete ON storage.objects;

CREATE POLICY player_photos_club_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'player-photos' AND public.can_manage_player_photo(auth.uid(), name));

CREATE POLICY player_photos_club_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'player-photos' AND public.can_manage_player_photo(auth.uid(), name))
WITH CHECK (bucket_id = 'player-photos' AND public.can_manage_player_photo(auth.uid(), name));

CREATE POLICY player_photos_club_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'player-photos' AND public.can_manage_player_photo(auth.uid(), name));
