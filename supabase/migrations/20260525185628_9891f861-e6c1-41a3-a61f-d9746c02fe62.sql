
-- Roster token per registration (used to fill the roster post-approval)
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS roster_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS roster_submitted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_registrations_roster_token
  ON public.tournament_registrations(roster_token);

-- Public RPC: fetch registration info by roster token (no auth required)
CREATE OR REPLACE FUNCTION public.get_registration_by_roster_token(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Public RPC: save roster via token. Only works once registration is approved.
CREATE OR REPLACE FUNCTION public.save_roster_via_token(_token uuid, _players jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg public.tournament_registrations%ROWTYPE;
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

  v_count := jsonb_array_length(_players);
  IF v_count > 40 THEN
    RAISE EXCEPTION 'too_many_players';
  END IF;

  -- Replace existing roster
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

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_registration_by_roster_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registration_by_roster_token(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.save_roster_via_token(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_roster_via_token(uuid, jsonb) TO anon, authenticated;
