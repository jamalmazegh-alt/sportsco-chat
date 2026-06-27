
CREATE OR REPLACE FUNCTION public.get_registration_by_roster_token(_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'registration_id', r.id,
    'tournament_id', r.tournament_id,
    'tournament_name', t.name,
    'tournament_slug', t.slug,
    'team_name', r.team_name,
    'short_name', r.short_name,
    'contact_name', r.contact_name,
    'contact_email', r.contact_email,
    'status', r.status,
    'tournament_team_id', r.tournament_team_id,
    'roster_submitted_at', r.roster_submitted_at,
    'max_players', GREATEST(
      COALESCE((t.settings->'roster'->>'playersPerTeam')::int, 11)
      + COALESCE((t.settings->'roster'->>'maxSubstitutes')::int, 5),
      1
    ),
    'players',
      CASE
        WHEN r.tournament_team_id IS NOT NULL THEN
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', p.id,
              'first_name', p.first_name,
              'last_name', p.last_name,
              'jersey_number', p.jersey_number,
              'position', p.position,
              'is_captain', p.is_captain
            ) ORDER BY p.created_at)
            FROM public.tournament_team_players p
            WHERE p.tournament_team_id = r.tournament_team_id
          ), '[]'::jsonb)
        ELSE COALESCE(r.players, '[]'::jsonb)
      END
  )
  FROM public.tournament_registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  WHERE r.roster_token = _token
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.save_roster_via_token(_token uuid, _players jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.tournament_registrations%ROWTYPE;
  v_max int;
  v_count int;
BEGIN
  SELECT * INTO v_reg FROM public.tournament_registrations WHERE roster_token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF v_reg.status <> 'approved' OR v_reg.tournament_team_id IS NULL THEN
    RAISE EXCEPTION 'registration_not_approved';
  END IF;

  IF jsonb_typeof(_players) <> 'array' THEN
    RAISE EXCEPTION 'invalid_players';
  END IF;

  SELECT GREATEST(
    COALESCE((t.settings->'roster'->>'playersPerTeam')::int, 11)
    + COALESCE((t.settings->'roster'->>'maxSubstitutes')::int, 5),
    1
  )
  INTO v_max
  FROM public.tournaments t
  WHERE t.id = v_reg.tournament_id;

  v_count := jsonb_array_length(_players);
  IF v_count > v_max THEN
    RAISE EXCEPTION 'too_many_players: max %', v_max;
  END IF;

  DELETE FROM public.tournament_team_players
   WHERE tournament_team_id = v_reg.tournament_team_id;

  IF v_count > 0 THEN
    INSERT INTO public.tournament_team_players
      (tournament_team_id, tournament_id, first_name, last_name, jersey_number, position, is_captain)
    SELECT
      v_reg.tournament_team_id,
      v_reg.tournament_id,
      left(coalesce(p->>'first_name',''), 80),
      left(coalesce(p->>'last_name',''),  80),
      NULLIF((p->>'jersey_number')::text, '')::int,
      NULLIF(left(coalesce(p->>'position',''), 40), ''),
      coalesce((p->>'is_captain')::boolean, false)
    FROM jsonb_array_elements(_players) p
    WHERE coalesce(trim(p->>'first_name'),'') <> ''
      AND coalesce(trim(p->>'last_name'),'')  <> '';
  END IF;

  UPDATE public.tournament_registrations
     SET roster_submitted_at = now(), updated_at = now()
   WHERE id = v_reg.id;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'max', v_max);
END;
$function$;
