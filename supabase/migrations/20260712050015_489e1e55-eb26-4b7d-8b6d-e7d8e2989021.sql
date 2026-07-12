CREATE OR REPLACE FUNCTION public.get_public_camp_by_slug(
  _club_slug text,
  _camp_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp public.club_camps%ROWTYPE;
  v_club record;
  v_venue record;
  v_facility record;
  v_taken int;
  v_remaining int;
  v_result jsonb;
BEGIN
  SELECT c.* INTO v_camp
  FROM public.club_camps c
  JOIN public.clubs cl ON cl.id = c.club_id
  WHERE cl.slug = _club_slug
    AND c.slug = _camp_slug
    AND c.status = 'published'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id, name, slug, logo_url, theme_color
  INTO v_club
  FROM public.clubs WHERE id = v_camp.club_id;

  IF v_camp.venue_id IS NOT NULL THEN
    SELECT id, name, address, city, country
    INTO v_venue FROM public.club_venues WHERE id = v_camp.venue_id;
  END IF;

  IF v_camp.facility_id IS NOT NULL THEN
    SELECT id, name, sport, surface_type
    INTO v_facility FROM public.club_facilities WHERE id = v_camp.facility_id;
  END IF;

  SELECT count(*)::int INTO v_taken
  FROM public.club_camp_registrations
  WHERE camp_id = v_camp.id
    AND registration_status IN ('pending', 'approved');

  v_remaining := GREATEST(v_camp.capacity - v_taken, 0);

  v_result := jsonb_build_object(
    'camp', jsonb_build_object(
      'id', v_camp.id,
      'slug', v_camp.slug,
      'title', v_camp.title,
      'description', v_camp.description,
      'cover_image_url', v_camp.cover_image_url,
      'start_date', v_camp.start_date,
      'end_date', v_camp.end_date,
      'registration_deadline', v_camp.registration_deadline,
      'capacity', v_camp.capacity,
      'taken_count', v_taken,
      'remaining', v_remaining,
      'is_full', v_taken >= v_camp.capacity,
      'price', v_camp.price,
      'currency', v_camp.currency,
      'external_location', v_camp.external_location,
      'payment_instructions', v_camp.payment_instructions,
      'status', v_camp.status,
      'document_retention_months', v_camp.document_retention_months
    ),
    'club', to_jsonb(v_club),
    'venue', to_jsonb(v_venue),
    'facility', to_jsonb(v_facility),
    'age_groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'label', label,
        'birth_year_min', birth_year_min,
        'birth_year_max', birth_year_max,
        'sort_order', sort_order
      ) ORDER BY sort_order, label)
      FROM public.club_camp_age_groups WHERE camp_id = v_camp.id
    ), '[]'::jsonb),
    'program_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'description', description,
        'starts_at', starts_at, 'ends_at', ends_at, 'sort_order', sort_order
      ) ORDER BY sort_order, starts_at NULLS LAST)
      FROM public.club_camp_program_items WHERE camp_id = v_camp.id
    ), '[]'::jsonb),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'document_type', document_type,
        'file_url', file_url, 'sort_order', sort_order
      ) ORDER BY sort_order, title)
      FROM public.club_camp_documents WHERE camp_id = v_camp.id
    ), '[]'::jsonb),
    'required_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'document_type', document_type,
        'required', required, 'sort_order', sort_order
      ) ORDER BY sort_order, title)
      FROM public.club_camp_required_documents WHERE camp_id = v_camp.id
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_camp_by_slug(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_camp_by_slug(text, text) TO anon, authenticated;