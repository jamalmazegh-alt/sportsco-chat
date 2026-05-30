
CREATE OR REPLACE FUNCTION public.get_public_coach_profile(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach record;
  v_profile record;
  v_club record;
  v_diplomas jsonb;
  v_history jsonb;
BEGIN
  SELECT * INTO v_coach FROM public.coach_profiles
  WHERE public_slug = _slug
    AND public_profile_enabled = true
    AND profile_visibility = 'public'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, first_name, last_name, avatar_url, city, region, country, bio
    INTO v_profile FROM public.profiles WHERE id = v_coach.user_id;

  IF v_coach.current_club_id IS NOT NULL THEN
    SELECT id, name, logo_url, theme_color INTO v_club FROM public.clubs WHERE id = v_coach.current_club_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'issuing_body', issuing_body, 'obtained_at', obtained_at, 'expiry_date', expiry_date
  ) ORDER BY obtained_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_diplomas FROM public.coach_diplomas WHERE coach_id = v_coach.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'club_name', club_name, 'role', role, 'sport', sport,
    'joined_at', joined_at, 'left_at', left_at, 'is_current', is_current
  ) ORDER BY COALESCE(joined_at, '1900-01-01'::date) DESC), '[]'::jsonb)
    INTO v_history FROM public.coach_club_history WHERE coach_id = v_coach.id;

  RETURN jsonb_build_object(
    'coach', jsonb_build_object(
      'id', v_coach.id,
      'sport', v_coach.sport,
      'speciality', v_coach.speciality,
      'philosophy', v_coach.philosophy,
      'years_experience', v_coach.years_experience,
      'looking_for_club', v_coach.looking_for_club,
      'followers_count', v_coach.followers_count,
      'public_slug', v_coach.public_slug
    ),
    'profile', CASE WHEN v_profile.id IS NULL THEN NULL ELSE jsonb_build_object(
      'full_name', v_profile.full_name,
      'first_name', v_profile.first_name,
      'last_name', v_profile.last_name,
      'avatar_url', v_profile.avatar_url,
      'city', v_profile.city,
      'region', v_profile.region,
      'country', v_profile.country,
      'bio', v_profile.bio
    ) END,
    'club', CASE WHEN v_club.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_club.id, 'name', v_club.name, 'logo_url', v_club.logo_url, 'theme_color', v_club.theme_color
    ) END,
    'diplomas', v_diplomas,
    'history', v_history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_coach_profile(text) TO anon, authenticated;
