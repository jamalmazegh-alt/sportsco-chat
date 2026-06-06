-- Public player profiles: opt-in shareable profile via slug
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS public_profile_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS players_public_slug_unique
  ON public.players(public_slug)
  WHERE public_slug IS NOT NULL;

-- Helper: generate a short random slug
CREATE OR REPLACE FUNCTION public.gen_player_public_slug()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.players WHERE public_slug = candidate);
    attempts := attempts + 1;
    IF attempts > 5 THEN
      candidate := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Block enabling public profile for minors (under 18)
CREATE OR REPLACE FUNCTION public.enforce_no_public_profile_for_minors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_profile_enabled = true
     AND NEW.birth_date IS NOT NULL
     AND NEW.birth_date > (CURRENT_DATE - INTERVAL '18 years')
  THEN
    RAISE EXCEPTION 'Public profile is not allowed for minors';
  END IF;
  IF NEW.public_profile_enabled = true AND NEW.public_slug IS NULL THEN
    NEW.public_slug := public.gen_player_public_slug();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_no_public_profile_for_minors ON public.players;
CREATE TRIGGER trg_enforce_no_public_profile_for_minors
BEFORE INSERT OR UPDATE OF public_profile_enabled, public_slug, birth_date
ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.enforce_no_public_profile_for_minors();

-- Public RPC (callable by anon) returning only public data for a given slug
CREATE OR REPLACE FUNCTION public.get_public_player_profile(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player record;
  v_club record;
  v_achievements jsonb;
  v_timeline jsonb;
  v_seasons jsonb;
BEGIN
  SELECT id, club_id, first_name, last_name, photo_url, preferred_position, position, jersey_number, birth_date
    INTO v_player
  FROM public.players
  WHERE public_slug = _slug
    AND public_profile_enabled = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Refuse if (defensive) minor
  IF v_player.birth_date IS NOT NULL
     AND v_player.birth_date > (CURRENT_DATE - INTERVAL '18 years') THEN
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
      'jersey_number', v_player.jersey_number
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
$$;

GRANT EXECUTE ON FUNCTION public.get_public_player_profile(text) TO anon, authenticated;

-- RPC to toggle public profile (player owner / club admin via existing RLS-style checks)
CREATE OR REPLACE FUNCTION public.set_player_public_profile(_player_id uuid, _enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Authorization: player themselves, parent of player, or club admin/coach
  IF NOT (
    v_user_id = v_caller
    OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = _player_id AND pp.user_id = v_caller)
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
$$;

GRANT EXECUTE ON FUNCTION public.set_player_public_profile(uuid, boolean) TO authenticated;