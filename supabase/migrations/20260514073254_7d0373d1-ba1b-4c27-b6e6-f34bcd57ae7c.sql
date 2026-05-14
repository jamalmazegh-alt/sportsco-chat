
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS championship text;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS preferred_position text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS can_respond boolean NOT NULL DEFAULT true;

ALTER TABLE public.player_parents
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS can_respond boolean NOT NULL DEFAULT true;

-- parent_user_id is nullable for parent contacts without an account
ALTER TABLE public.player_parents
  ALTER COLUMN parent_user_id DROP NOT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS convocation_time timestamptz,
  ADD COLUMN IF NOT EXISTS competition_type text,
  ADD COLUMN IF NOT EXISTS competition_name text,
  ADD COLUMN IF NOT EXISTS location_url text,
  ADD COLUMN IF NOT EXISTS convocations_sent boolean NOT NULL DEFAULT false;

-- Update handle_new_user to read first/last name
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_first text := NEW.raw_user_meta_data->>'first_name';
  v_last  text := NEW.raw_user_meta_data->>'last_name';
  v_full  text := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(trim(concat_ws(' ', v_first, v_last)), ''),
    NEW.email
  );
BEGIN
  INSERT INTO public.profiles (id, full_name, first_name, last_name, preferred_language)
  VALUES (
    NEW.id,
    v_full,
    v_first,
    v_last,
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for player photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('player-photos', 'player-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "player_photos_public_read" ON storage.objects;
CREATE POLICY "player_photos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-photos');

DROP POLICY IF EXISTS "player_photos_auth_write" ON storage.objects;
CREATE POLICY "player_photos_auth_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'player-photos');

DROP POLICY IF EXISTS "player_photos_auth_update" ON storage.objects;
CREATE POLICY "player_photos_auth_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'player-photos');

DROP POLICY IF EXISTS "player_photos_auth_delete" ON storage.objects;
CREATE POLICY "player_photos_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'player-photos');
