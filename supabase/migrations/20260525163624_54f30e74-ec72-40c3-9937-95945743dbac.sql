-- Add is_personal marker to identify auto-created organizer workspaces
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

-- Helper: get or create the user's personal club (used to host Stripe Connect
-- and branding for tournament organizers who don't manage a real club).
CREATE OR REPLACE FUNCTION public.get_or_create_personal_club(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_name text;
  v_first text;
  v_last text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  -- Reuse if already exists
  SELECT id INTO v_club_id
  FROM public.clubs
  WHERE is_personal = true
    AND created_by = _user_id
    AND archived_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_club_id IS NOT NULL THEN
    RETURN v_club_id;
  END IF;

  -- Build a friendly name from the profile
  SELECT first_name, last_name, full_name
    INTO v_first, v_last, v_name
  FROM public.profiles
  WHERE id = _user_id;

  v_name := COALESCE(
    NULLIF(trim(v_name), ''),
    NULLIF(trim(concat_ws(' ', v_first, v_last)), ''),
    'Mes tournois'
  );

  INSERT INTO public.clubs (name, created_by, is_personal)
  VALUES (v_name, _user_id, true)
  RETURNING id INTO v_club_id;

  INSERT INTO public.club_members (club_id, user_id, role, roles)
  VALUES (v_club_id, _user_id, 'admin'::app_role, ARRAY['admin']::text[])
  ON CONFLICT DO NOTHING;

  RETURN v_club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_personal_club(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_personal_club(uuid) TO authenticated, service_role;

-- Backfill: every tournament currently without a club gets attached to its
-- creator's personal club so Stripe Connect onboarding becomes accessible.
DO $$
DECLARE
  r RECORD;
  v_club uuid;
BEGIN
  FOR r IN
    SELECT id, created_by FROM public.tournaments
    WHERE club_id IS NULL AND created_by IS NOT NULL
  LOOP
    v_club := public.get_or_create_personal_club(r.created_by);
    UPDATE public.tournaments SET club_id = v_club WHERE id = r.id;
  END LOOP;
END $$;