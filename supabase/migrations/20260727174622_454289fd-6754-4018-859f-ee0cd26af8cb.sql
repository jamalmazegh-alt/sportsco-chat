DROP FUNCTION IF EXISTS public.get_poll_voters(UUID);

CREATE OR REPLACE FUNCTION public.get_poll_voters(_publication_id UUID)
RETURNS TABLE(option_id UUID, option_label TEXT, sort_order INT,
              voter_name TEXT, subject_name TEXT, subject_kind TEXT, voted_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _pub RECORD;
BEGIN
  SELECT id, club_id, publication_type, poll_visibility, deleted_at
    INTO _pub FROM public.club_publications WHERE id = _publication_id;
  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  IF _pub.poll_visibility <> 'staff_visible' THEN RAISE EXCEPTION 'poll_is_anonymous'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _pub.club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT o.id,
         o.label,
         o.sort_order,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', caster.first_name, caster.last_name)), ''), 'Membre')::TEXT,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
           NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''),
           'Membre'
         )::TEXT,
         v.subject_kind::TEXT,
         v.created_at
  FROM public.club_poll_votes v
  JOIN public.club_poll_options o ON o.id = v.option_id
  LEFT JOIN public.profiles caster ON caster.id = v.cast_by_user_id
  LEFT JOIN public.players p ON p.id = v.member_id
  LEFT JOIN public.profiles pr ON pr.id = v.subject_user_id
  WHERE v.publication_id = _publication_id
  ORDER BY o.sort_order, o.created_at, 4;
END $$;
REVOKE ALL ON FUNCTION public.get_poll_voters(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll_voters(UUID) TO authenticated, service_role;