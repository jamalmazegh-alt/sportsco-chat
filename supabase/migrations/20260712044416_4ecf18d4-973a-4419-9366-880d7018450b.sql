
-- =========================================================================
-- Phase 2 completion: anti-doublon, remaining spots, family tracking token
-- =========================================================================

-- 1) Anti-doublon: partial unique index (case-insensitive), atomique.
--    Deux soumissions simultanées identiques → l'une lève 23505.
CREATE UNIQUE INDEX IF NOT EXISTS club_camp_registrations_unique_participant
ON public.club_camp_registrations (
  camp_id,
  lower(participant_first_name),
  lower(participant_last_name),
  birth_date
)
WHERE registration_status <> 'cancelled';

-- 2) get_public_camp_by_slug : ajoute taken_count + remaining
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

  SELECT id, name, slug, logo_url, theme_color, city, country
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
      'status', v_camp.status
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

-- 3) get_camp_registration_by_token : page de suivi famille (token = auth unique)
--    Renvoie NULL si token invalide OU stage non publié (→ 404 générique côté route).
CREATE OR REPLACE FUNCTION public.get_camp_registration_by_token(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_camp record;
  v_club record;
  v_result jsonb;
BEGIN
  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.*
  INTO v_reg
  FROM public.club_camp_registrations r
  WHERE r.access_token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT c.id, c.slug, c.title, c.start_date, c.end_date, c.status, c.club_id
  INTO v_camp
  FROM public.club_camps c
  WHERE c.id = v_reg.camp_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id, name, slug INTO v_club FROM public.clubs WHERE id = v_camp.club_id;

  v_result := jsonb_build_object(
    'registration', jsonb_build_object(
      'id', v_reg.id,
      'participant_first_name', v_reg.participant_first_name,
      'participant_last_name', v_reg.participant_last_name,
      'birth_date', v_reg.birth_date,
      'guardian_first_name', v_reg.guardian_first_name,
      'guardian_last_name', v_reg.guardian_last_name,
      'guardian_email', v_reg.guardian_email,
      'registration_status', v_reg.registration_status,
      'payment_status', v_reg.payment_status,
      'rejection_reason', v_reg.rejection_reason,
      'created_at', v_reg.created_at
    ),
    'camp', to_jsonb(v_camp),
    'club', to_jsonb(v_club),
    'required_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rd.id,
        'title', rd.title,
        'document_type', rd.document_type,
        'required', rd.required,
        'sort_order', rd.sort_order
      ) ORDER BY rd.sort_order, rd.title)
      FROM public.club_camp_required_documents rd
      WHERE rd.camp_id = v_reg.camp_id
    ), '[]'::jsonb),
    'submitted_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'required_document_id', d.required_document_id,
        'review_status', d.review_status,
        'rejection_reason', d.rejection_reason,
        'uploaded_at', d.uploaded_at
      ) ORDER BY d.uploaded_at DESC)
      FROM public.club_camp_registration_documents d
      WHERE d.registration_id = v_reg.id
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_camp_registration_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_camp_registration_by_token(uuid) TO anon, authenticated;

-- 4) resolve_camp_registration_document : vérifie qu'un doc appartient bien
--    à la registration désignée par le token. Renvoie file_path si OK, sinon NULL.
--    Utilisé par la route serveur qui signe l'URL (10 min).
CREATE OR REPLACE FUNCTION public.resolve_camp_registration_document(
  _token uuid,
  _document_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  IF _token IS NULL OR _document_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT d.file_path INTO v_path
  FROM public.club_camp_registration_documents d
  JOIN public.club_camp_registrations r ON r.id = d.registration_id
  WHERE d.id = _document_id
    AND r.access_token = _token
  LIMIT 1;

  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_camp_registration_document(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_camp_registration_document(uuid, uuid) TO anon, authenticated;

-- 5) resolve_camp_registration_for_upload : renvoie l'id de la registration
--    et le camp_id si le token est valide ET la pièce demandée appartient au stage.
CREATE OR REPLACE FUNCTION public.resolve_camp_registration_for_upload(
  _token uuid,
  _required_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id uuid;
  v_camp_id uuid;
BEGIN
  IF _token IS NULL OR _required_document_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.id, r.camp_id INTO v_reg_id, v_camp_id
  FROM public.club_camp_registrations r
  WHERE r.access_token = _token
  LIMIT 1;

  IF v_reg_id IS NULL THEN RETURN NULL; END IF;

  PERFORM 1
  FROM public.club_camp_required_documents
  WHERE id = _required_document_id AND camp_id = v_camp_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object('registration_id', v_reg_id, 'camp_id', v_camp_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_camp_registration_for_upload(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_camp_registration_for_upload(uuid, uuid) TO anon, authenticated;
