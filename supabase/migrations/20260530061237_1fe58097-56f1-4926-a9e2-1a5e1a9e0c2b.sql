
-- Drop old signature
DROP FUNCTION IF EXISTS public.list_public_players(text, text, uuid, int, int);

CREATE OR REPLACE FUNCTION public.list_public_players(
  _search text DEFAULT NULL,
  _sport text DEFAULT NULL,
  _club_id uuid DEFAULT NULL,
  _region text DEFAULT NULL,
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
           c.name AS club_name, c.logo_url AS club_logo, c.sport AS club_sport,
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
      AND (_sport IS NULL OR c.sport = _sport)
      AND (_club_id IS NULL OR p.club_id = _club_id)
      AND (_region IS NULL OR _region = '' OR pr.region ILIKE _region)
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
           c.name AS club_name, c.logo_url AS club_logo, c.sport AS club_sport,
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
      AND (_sport IS NULL OR c.sport = _sport)
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
$function$;

GRANT EXECUTE ON FUNCTION public.list_public_players(text, text, uuid, text, int, int) TO anon, authenticated;

-- Relax minor block on profile fetch (allow with parental consent) + expose birth_date & parental_public_consent
CREATE OR REPLACE FUNCTION public.get_public_player_profile(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player record;
  v_club record;
  v_parental_consent boolean := false;
  v_achievements jsonb;
  v_timeline jsonb;
  v_seasons jsonb;
BEGIN
  SELECT id, club_id, user_id, first_name, last_name, photo_url, preferred_position, position, jersey_number, birth_date
    INTO v_player
  FROM public.players
  WHERE public_slug = _slug
    AND public_profile_enabled = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_player.user_id IS NOT NULL THEN
    SELECT COALESCE(parental_public_consent, false)
      INTO v_parental_consent
    FROM public.profiles
    WHERE id = v_player.user_id;
  END IF;

  -- Block minors without parental consent (and minors with no account = no consent path)
  IF v_player.birth_date IS NOT NULL
     AND v_player.birth_date > (CURRENT_DATE - INTERVAL '18 years')
     AND v_parental_consent = false THEN
    RETURN NULL;
  END IF;

  SELECT id, name, logo_url, sport, theme_color
    INTO v_club
  FROM public.clubs
  WHERE id = v_player.club_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'achievement_type', a.achievement_type,
    'achievement_date', a.achievement_date,
    'season_label', a.season_label,
    'description', a.description
  ) ORDER BY a.achievement_date DESC NULLS LAST), '[]'::jsonb)
    INTO v_achievements
  FROM public.player_achievements a
  WHERE a.player_id = v_player.id
    AND a.visibility = 'public'
    AND a.status = 'confirmed';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'event_type', t.event_type,
    'title', t.title,
    'description', t.description,
    'event_date', t.event_date
  ) ORDER BY t.event_date DESC NULLS LAST), '[]'::jsonb)
    INTO v_timeline
  FROM public.player_timeline_events t
  WHERE t.player_id = v_player.id
    AND t.visibility = 'public';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'season_label', s.season_label,
    'sport', s.sport,
    'category', s.category,
    'primary_position', s.primary_position
  ) ORDER BY s.season_label DESC), '[]'::jsonb)
    INTO v_seasons
  FROM public.player_seasons s
  WHERE s.player_id = v_player.id;

  RETURN jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id,
      'first_name', v_player.first_name,
      'last_name', v_player.last_name,
      'photo_url', v_player.photo_url,
      'preferred_position', v_player.preferred_position,
      'position', v_player.position,
      'jersey_number', v_player.jersey_number,
      'birth_date', v_player.birth_date,
      'parental_public_consent', v_parental_consent
    ),
    'club', CASE WHEN v_club.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'logo_url', v_club.logo_url,
      'sport', v_club.sport,
      'theme_color', v_club.theme_color
    ) END,
    'achievements', v_achievements,
    'timeline', v_timeline,
    'seasons', v_seasons
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_player_profile(text) TO anon, authenticated;
