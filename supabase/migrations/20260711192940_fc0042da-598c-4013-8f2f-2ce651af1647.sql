CREATE OR REPLACE FUNCTION public.create_support_view_session(_target_user_id uuid, _club_id uuid, _persona support_view_persona, _reason text, _duration_minutes integer DEFAULT 30)
 RETURNS support_view_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _caller UUID := auth.uid();
  _duration INTEGER := LEAST(GREATEST(COALESCE(_duration_minutes, 30), 1), 60);
  _persona_ok BOOLEAN := false;
  _session public.support_view_sessions;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_super_admin(_caller) THEN
    RAISE EXCEPTION 'forbidden: superadmin required' USING ERRCODE = '42501';
  END IF;

  IF _target_user_id IS NULL OR _club_id IS NULL OR _persona IS NULL THEN
    RAISE EXCEPTION 'missing_parameters' USING ERRCODE = '22023';
  END IF;

  IF _target_user_id = _caller THEN
    RAISE EXCEPTION 'cannot_impersonate_self' USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(_reason, '')) = '' OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id) THEN
    RAISE EXCEPTION 'club_not_found' USING ERRCODE = '22023';
  END IF;

  -- Validate persona against real DB roles.
  -- club_admin => aligné sur computeTargetPermissions (admin || dirigeant).
  IF _persona = 'club_admin' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id AND m.user_id = _target_user_id
        AND m.role IN ('admin', 'dirigeant')
    ) INTO _persona_ok;
  ELSIF _persona = 'coach' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = _club_id AND tm.user_id = _target_user_id
        AND tm.role = 'coach'
    ) INTO _persona_ok;
  ELSIF _persona = 'player' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.club_id = _club_id AND p.user_id = _target_user_id
    ) INTO _persona_ok;
  ELSIF _persona = 'parent' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.player_parents pp
      JOIN public.players p ON p.id = pp.player_id
      WHERE p.club_id = _club_id AND pp.parent_user_id = _target_user_id
    ) INTO _persona_ok;
  ELSIF _persona = 'member' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id AND m.user_id = _target_user_id
    ) INTO _persona_ok;
  END IF;

  IF NOT _persona_ok THEN
    RAISE EXCEPTION 'persona_not_matching_real_role' USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_view_sessions s
     SET ended_at = now()
   WHERE s.superadmin_id = _caller
     AND s.ended_at IS NULL;

  INSERT INTO public.support_view_sessions (
    superadmin_id, target_user_id, club_id, persona, reason,
    started_at, expires_at
  ) VALUES (
    _caller, _target_user_id, _club_id, _persona, btrim(_reason),
    now(), now() + make_interval(mins => _duration)
  )
  RETURNING * INTO _session;

  INSERT INTO public.support_view_actions (session_id, superadmin_id, action, target_kind, target_id, metadata)
  VALUES (_session.id, _caller, 'session.create', 'club', _club_id,
          jsonb_build_object('persona', _persona, 'target_user_id', _target_user_id));

  RETURN _session;
END;
$function$;