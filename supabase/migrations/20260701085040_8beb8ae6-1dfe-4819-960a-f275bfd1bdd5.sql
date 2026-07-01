CREATE OR REPLACE FUNCTION public.link_parent_memberships()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_added integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RETURN 0; END IF;

  -- Claim any player_parents rows that match this user's email
  UPDATE public.player_parents
     SET parent_user_id = v_uid
   WHERE parent_user_id IS NULL
     AND lower(email) = v_email;

  -- Insert missing club_members(role='parent') for each linked child's club
  WITH ins AS (
    INSERT INTO public.club_members (club_id, user_id, role, roles)
    SELECT DISTINCT p.club_id, v_uid, 'parent'::app_role, ARRAY['parent']::text[]
      FROM public.player_parents pp
      JOIN public.players p ON p.id = pp.player_id
     WHERE pp.parent_user_id = v_uid
       AND NOT EXISTS (
         SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = p.club_id AND cm.user_id = v_uid
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM ins;

  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.link_parent_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_parent_memberships() TO authenticated;