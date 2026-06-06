-- Public RPC to list public player profiles with filters + pagination
CREATE OR REPLACE FUNCTION public.list_public_players(
  _search text DEFAULT NULL,
  _sport text DEFAULT NULL,
  _club_id uuid DEFAULT NULL,
  _limit int DEFAULT 24,
  _offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           c.name AS club_name, c.logo_url AS club_logo, c.sport AS club_sport
    FROM public.players p
    LEFT JOIN public.clubs c ON c.id = p.club_id
    WHERE p.public_profile_enabled = true
      AND p.public_slug IS NOT NULL
      AND p.deleted_at IS NULL
      AND (p.birth_date IS NULL OR p.birth_date <= (CURRENT_DATE - INTERVAL '18 years'))
      AND (_sport IS NULL OR c.sport = _sport)
      AND (_club_id IS NULL OR p.club_id = _club_id)
      AND (
        _search IS NULL OR _search = '' OR
        (p.first_name || ' ' || p.last_name) ILIKE ('%' || _search || '%') OR
        c.name ILIKE ('%' || _search || '%')
      )
  )
  SELECT COUNT(*) INTO v_total FROM base;

  WITH base AS (
    SELECT p.id, p.first_name, p.last_name, p.photo_url, p.preferred_position, p.position,
           p.jersey_number, p.public_slug, p.club_id,
           c.name AS club_name, c.logo_url AS club_logo, c.sport AS club_sport
    FROM public.players p
    LEFT JOIN public.clubs c ON c.id = p.club_id
    WHERE p.public_profile_enabled = true
      AND p.public_slug IS NOT NULL
      AND p.deleted_at IS NULL
      AND (p.birth_date IS NULL OR p.birth_date <= (CURRENT_DATE - INTERVAL '18 years'))
      AND (_sport IS NULL OR c.sport = _sport)
      AND (_club_id IS NULL OR p.club_id = _club_id)
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
    'club', CASE WHEN b.club_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', b.club_id,
      'name', b.club_name,
      'logo_url', b.club_logo,
      'sport', b.club_sport
    ) END
  )), '[]'::jsonb) INTO v_items FROM base b;

  SELECT COALESCE(jsonb_agg(DISTINCT c.sport ORDER BY c.sport), '[]'::jsonb) INTO v_sports
  FROM public.players p
  JOIN public.clubs c ON c.id = p.club_id
  WHERE p.public_profile_enabled = true AND p.public_slug IS NOT NULL
    AND p.deleted_at IS NULL AND c.sport IS NOT NULL;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name) ORDER BY jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
  INTO v_clubs
  FROM public.players p
  JOIN public.clubs c ON c.id = p.club_id
  WHERE p.public_profile_enabled = true AND p.public_slug IS NOT NULL
    AND p.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'sports', v_sports,
    'clubs', v_clubs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_players(text, text, uuid, int, int) TO anon, authenticated;