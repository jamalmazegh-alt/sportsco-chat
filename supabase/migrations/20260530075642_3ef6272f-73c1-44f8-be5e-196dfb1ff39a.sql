CREATE OR REPLACE FUNCTION public.set_player_public_profile(_player_id uuid, _enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_user_id uuid;
  v_birth date;
  v_caller uuid := auth.uid();
  v_slug text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT club_id, user_id, birth_date INTO v_club_id, v_user_id, v_birth
  FROM public.players WHERE id = _player_id AND deleted_at IS NULL;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT (
    v_user_id = v_caller
    OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = _player_id AND pp.parent_user_id = v_caller)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = v_club_id
        AND cm.user_id = v_caller
        AND cm.role IN ('admin','coach')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _enabled AND v_birth IS NOT NULL AND v_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'Public profile is not allowed for minors';
  END IF;

  UPDATE public.players
     SET public_profile_enabled = _enabled,
         public_slug = CASE WHEN _enabled AND public_slug IS NULL THEN public.gen_player_public_slug() ELSE public_slug END
   WHERE id = _player_id
   RETURNING public_slug INTO v_slug;

  RETURN jsonb_build_object('enabled', _enabled, 'slug', v_slug);
END;
$function$;