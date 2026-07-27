DROP FUNCTION IF EXISTS public.get_poll_voters(uuid);

CREATE FUNCTION public.get_poll_voters(_publication_id uuid)
RETURNS TABLE (
  option_id uuid,
  option_label text,
  sort_order integer,
  voter_name text,
  subject_name text,
  subject_kind text,
  voter_roles text[],
  voter_teams text[],
  voted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
         COALESCE(cm.roles, '{}')::TEXT[],
         COALESCE((
           SELECT array_agg(DISTINCT COALESCE(NULLIF(TRIM(tt.age_group), ''), tt.name))
           FROM public.team_members tm
           JOIN public.teams tt ON tt.id = tm.team_id
           WHERE tm.user_id = COALESCE(v.subject_user_id, v.cast_by_user_id)
             AND tm.role <> 'player'
             AND tt.club_id = _pub.club_id
         ), '{}')::TEXT[],
         v.created_at
  FROM public.club_poll_votes v
  JOIN public.club_poll_options o ON o.id = v.option_id
  LEFT JOIN public.profiles caster ON caster.id = v.cast_by_user_id
  LEFT JOIN public.players p ON p.id = v.member_id
  LEFT JOIN public.profiles pr ON pr.id = v.subject_user_id
  LEFT JOIN public.club_members cm
    ON cm.club_id = _pub.club_id
   AND cm.user_id = COALESCE(v.subject_user_id, v.cast_by_user_id)
  WHERE v.publication_id = _publication_id
  ORDER BY o.sort_order, o.created_at, 4;
END
$$;

REVOKE ALL ON FUNCTION public.get_poll_voters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll_voters(uuid) TO authenticated;