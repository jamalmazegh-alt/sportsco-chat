-- Expose tournament_team logo_url in roster token RPC + add setter

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
    'logo_url', tt.logo_url,
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
  LEFT JOIN public.tournament_teams tt ON tt.id = r.tournament_team_id
  WHERE r.roster_token = _token
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.set_team_logo_via_token(_token uuid, _logo_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.tournament_registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_reg FROM public.tournament_registrations WHERE roster_token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF v_reg.status <> 'approved' OR v_reg.tournament_team_id IS NULL THEN
    RAISE EXCEPTION 'registration_not_approved';
  END IF;
  IF _logo_url IS NOT NULL AND length(_logo_url) > 1000 THEN
    RAISE EXCEPTION 'logo_url_too_long';
  END IF;

  UPDATE public.tournament_teams
     SET logo_url = NULLIF(_logo_url, '')
   WHERE id = v_reg.tournament_team_id;

  RETURN jsonb_build_object('ok', true, 'logo_url', NULLIF(_logo_url, ''));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_team_logo_via_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_team_logo_via_token(uuid, text) TO anon, authenticated;