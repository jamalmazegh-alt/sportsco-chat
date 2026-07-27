CREATE OR REPLACE FUNCTION public.get_poll_non_voters(_publication_id uuid)
RETURNS TABLE(subject_kind text, subject_name text, subject_roles text[], subject_teams text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _pub RECORD;
BEGIN
  SELECT id, club_id, publication_type, poll_visibility, deleted_at
    INTO _pub FROM public.club_publications WHERE id = _publication_id;
  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  IF _pub.poll_visibility <> 'staff_visible' THEN RAISE EXCEPTION 'poll_is_anonymous'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _pub.club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT r.subject_kind::TEXT,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
           NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''),
           'Membre'
         )::TEXT,
         COALESCE(cm.roles, '{}')::TEXT[],
         COALESCE((
           SELECT array_agg(DISTINCT COALESCE(NULLIF(TRIM(tt.age_group), ''), tt.name))
           FROM public.team_members tm
           JOIN public.teams tt ON tt.id = tm.team_id
           WHERE tm.user_id = r.subject_user_id
             AND tm.role <> 'player'
             AND tt.club_id = _pub.club_id
         ), '{}')::TEXT[]
  FROM public.club_publication_recipients r
  LEFT JOIN public.players p ON p.id = r.member_id
  LEFT JOIN public.profiles pr ON pr.id = r.subject_user_id
  LEFT JOIN public.club_members cm
    ON cm.club_id = _pub.club_id
   AND cm.user_id = r.subject_user_id
  WHERE r.publication_id = _publication_id
    AND NOT EXISTS (
      SELECT 1 FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND (
          (r.subject_kind = 'player' AND v.subject_kind = 'player' AND v.member_id = r.member_id)
          OR (r.subject_kind = 'user' AND v.subject_kind = 'user' AND v.subject_user_id = r.subject_user_id)
        )
    )
  ORDER BY 2;
END
$function$;

REVOKE ALL ON FUNCTION public.get_poll_non_voters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll_non_voters(uuid) TO authenticated;