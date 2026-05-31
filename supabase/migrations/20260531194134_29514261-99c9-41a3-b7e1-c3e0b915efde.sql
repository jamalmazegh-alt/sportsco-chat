CREATE OR REPLACE FUNCTION public.list_public_players(
  _search text DEFAULT NULL::text,
  _sport text DEFAULT NULL::text,
  _club_id uuid DEFAULT NULL::uuid,
  _region text DEFAULT NULL::text,
  _limit integer DEFAULT 24,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(_limit, 24), 1), 60);
  v_offset int := GREATEST(COALESCE(_offset, 0), 0);
  v_total bigint;
  v_items jsonb;
  v_sports jsonb;
  v_clubs jsonb;
BEGIN
  WITH base AS (
    SELECT p.id, p.first_name, p.last_name, p.photo_url, p.preferred_position, p.position,
           p.jersey_number, p.public_slug, p.club_id,
           c.name AS club_name, c.logo_url AS club_logo,
           (SELECT t.sport FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id WHERE tm.player_id = p.id LIMIT 1) AS player_sport,
           pr.region AS player_region
    FROM public.players p
    LEFT JOIN public.clubs c ON c.id = p.club_id
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.public_profile_enabled = true
      AND p.public_slug IS NOT NULL
      AND p.deleted_at IS NULL
      AND (
        p.birth_date IS NULL
        OR p.birth_date <= (CURRENT_DATE - INTERVAL '18 years')
        OR EXISTS (
          SELECT 1 FROM public.profiles pr2
          WHERE pr2.id = p.user_id
            AND pr2.parental_public_consent = true
        )
      )
      AND (_sport IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE tm.player_id = p.id AND t.sport = _sport
      ))
      AND (_club_id IS NULL OR p.club_id = _club_id)
      AND (_region IS NULL OR _region = '' OR pr.region ILIKE _region)
      AND (
        _search IS NULL OR _search = '' OR
        (p.first_name || ' ' || p.last_name) ILIKE ('%' || _search || '%') OR
        c.name ILIKE ('%' || _search || '%')
      )
    ORDER BY p.last_name ASC, p.first_name ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'first_name', b.first_name,
    'last_name', b.last_name,
    'photo_url', b.photo_url,
    'preferred_position', b.preferred_position,
    'position', b.position,
    'jersey_number', b.jersey_number,
    'public_slug', b.public_slug,
    'region', b.player_region,
    'club', CASE WHEN b.club_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', b.club_id,
      'name', b.club_name,
      'logo_url', b.club_logo,
      'sport', b.player_sport
    ) END
  )), '[]'::jsonb) INTO v_items FROM base b;

  SELECT COALESCE(jsonb_agg(DISTINCT t.sport ORDER BY t.sport), '[]'::jsonb) INTO v_sports
  FROM public.players p
  JOIN public.team_members tm ON tm.player_id = p.id
  JOIN public.teams t ON t.id = tm.team_id
  WHERE p.public_profile_enabled = true AND p.public_slug IS NOT NULL
    AND p.deleted_at IS NULL AND t.sport IS NOT NULL;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name) ORDER BY jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
  INTO v_clubs
  FROM public.players p
  JOIN public.clubs c ON c.id = p.club_id
  WHERE p.public_profile_enabled = true AND p.public_slug IS NOT NULL
    AND p.deleted_at IS NULL;

  SELECT count(*) INTO v_total
  FROM public.players p
  LEFT JOIN public.clubs c ON c.id = p.club_id
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.public_profile_enabled = true
    AND p.public_slug IS NOT NULL
    AND p.deleted_at IS NULL
    AND (
      p.birth_date IS NULL
      OR p.birth_date <= (CURRENT_DATE - INTERVAL '18 years')
      OR EXISTS (SELECT 1 FROM public.profiles pr2 WHERE pr2.id = p.user_id AND pr2.parental_public_consent = true)
    )
    AND (_sport IS NULL OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.player_id = p.id AND t.sport = _sport
    ))
    AND (_club_id IS NULL OR p.club_id = _club_id)
    AND (_region IS NULL OR _region = '' OR pr.region ILIKE _region)
    AND (
      _search IS NULL OR _search = '' OR
      (p.first_name || ' ' || p.last_name) ILIKE ('%' || _search || '%') OR
      c.name ILIKE ('%' || _search || '%')
    );

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'sports', v_sports,
    'clubs', v_clubs
  );
END;
$function$;