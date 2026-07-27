ALTER TABLE public.club_publications
  ADD COLUMN IF NOT EXISTS poll_allow_multiple BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS public.uq_poll_vote_subject;
CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_vote_subject_option
  ON public.club_poll_votes(
    publication_id, subject_kind,
    COALESCE(member_id,       '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    option_id
  );

CREATE OR REPLACE FUNCTION public.set_poll_allow_multiple(
  _publication_id UUID,
  _allow BOOLEAN
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _club UUID; _type publication_type;
BEGIN
  SELECT club_id, publication_type INTO _club, _type
    FROM public.club_publications WHERE id = _publication_id AND deleted_at IS NULL;
  IF _club IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.club_publications SET poll_allow_multiple = _allow WHERE id = _publication_id;
END $fn$;
REVOKE ALL ON FUNCTION public.set_poll_allow_multiple(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_poll_allow_multiple(UUID, BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  _publication_id UUID,
  _option_id UUID,
  _subject_kind TEXT,
  _subject_id UUID
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, audit AS $fn$
DECLARE
  _pub RECORD; _opt_pub UUID; _authorized BOOLEAN;
  _vote_id UUID; _prev_option UUID; _action poll_vote_action;
  _member_id UUID; _subject_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _subject_kind NOT IN ('player','user') THEN RAISE EXCEPTION 'invalid_subject_kind'; END IF;

  SELECT id, club_id, publication_type, closed_at, closes_at, deleted_at, poll_allow_multiple
    INTO _pub FROM public.club_publications WHERE id = _publication_id;
  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  IF _pub.closed_at IS NOT NULL OR (_pub.closes_at IS NOT NULL AND _pub.closes_at < now()) THEN
    RAISE EXCEPTION 'poll_closed';
  END IF;

  SELECT publication_id INTO _opt_pub FROM public.club_poll_options WHERE id = _option_id;
  IF _opt_pub IS NULL OR _opt_pub <> _publication_id THEN RAISE EXCEPTION 'option_mismatch'; END IF;

  IF _subject_kind = 'player' THEN
    _member_id := _subject_id;
    SELECT EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = _publication_id
        AND r.subject_kind = 'player' AND r.member_id = _member_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.player_parents pp
             WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid() AND pp.can_respond = TRUE
          )
        )
    ) INTO _authorized;
  ELSE
    _subject_user_id := _subject_id;
    IF _subject_user_id <> auth.uid() THEN
      _authorized := FALSE;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.club_publication_recipients r
        WHERE r.publication_id = _publication_id
          AND r.subject_kind = 'user' AND r.subject_user_id = _subject_user_id
      ) INTO _authorized;
    END IF;
  END IF;
  IF NOT _authorized THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _pub.poll_allow_multiple THEN
    SELECT id INTO _vote_id FROM public.club_poll_votes
      WHERE publication_id = _publication_id
        AND option_id = _option_id
        AND ((_subject_kind = 'player' AND subject_kind = 'player' AND member_id = _member_id)
          OR (_subject_kind = 'user'   AND subject_kind = 'user'   AND subject_user_id = _subject_user_id));

    IF _vote_id IS NOT NULL THEN
      DELETE FROM public.club_poll_votes WHERE id = _vote_id;
      _action := 'retrait';
    ELSE
      INSERT INTO public.club_poll_votes(publication_id, option_id, subject_kind, member_id, subject_user_id, cast_by_user_id)
        VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid())
        RETURNING id INTO _vote_id;
      _action := 'vote';
    END IF;

    INSERT INTO audit.club_poll_vote_log(
      publication_id, option_id, subject_kind, member_id, subject_user_id, cast_by_user_id, action
    ) VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid(), _action);
    RETURN _vote_id;
  END IF;

  IF _subject_kind = 'player' THEN
    SELECT option_id INTO _prev_option FROM public.club_poll_votes
      WHERE publication_id = _publication_id AND subject_kind = 'player' AND member_id = _member_id
      LIMIT 1;
  ELSE
    SELECT option_id INTO _prev_option FROM public.club_poll_votes
      WHERE publication_id = _publication_id AND subject_kind = 'user' AND subject_user_id = _subject_user_id
      LIMIT 1;
  END IF;

  IF _prev_option IS NULL THEN
    _action := 'vote';
    INSERT INTO public.club_poll_votes(publication_id, option_id, subject_kind, member_id, subject_user_id, cast_by_user_id)
      VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid())
      RETURNING id INTO _vote_id;
  ELSIF _prev_option = _option_id THEN
    IF _subject_kind = 'player' THEN
      SELECT id INTO _vote_id FROM public.club_poll_votes
        WHERE publication_id = _publication_id AND subject_kind = 'player' AND member_id = _member_id LIMIT 1;
    ELSE
      SELECT id INTO _vote_id FROM public.club_poll_votes
        WHERE publication_id = _publication_id AND subject_kind = 'user' AND subject_user_id = _subject_user_id LIMIT 1;
    END IF;
    RETURN _vote_id;
  ELSE
    _action := 'change';
    IF _subject_kind = 'player' THEN
      UPDATE public.club_poll_votes
         SET option_id = _option_id, cast_by_user_id = auth.uid(), updated_at = now()
       WHERE publication_id = _publication_id AND subject_kind = 'player' AND member_id = _member_id
       RETURNING id INTO _vote_id;
    ELSE
      UPDATE public.club_poll_votes
         SET option_id = _option_id, cast_by_user_id = auth.uid(), updated_at = now()
       WHERE publication_id = _publication_id AND subject_kind = 'user' AND subject_user_id = _subject_user_id
       RETURNING id INTO _vote_id;
    END IF;
  END IF;

  INSERT INTO audit.club_poll_vote_log(
    publication_id, option_id, subject_kind, member_id, subject_user_id, cast_by_user_id, action
  ) VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid(), _action);
  RETURN _vote_id;
END $fn$;
REVOKE ALL ON FUNCTION public.cast_poll_vote(UUID, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(UUID, UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_poll_results(_publication_id UUID)
RETURNS TABLE(option_id UUID, label TEXT, sort_order INT, vote_count INT,
              total_voters INT, below_threshold BOOLEAN, is_anonymous BOOLEAN, is_closed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _pub RECORD; _is_recipient BOOLEAN; _is_staff BOOLEAN; _total INT; _threshold_hit BOOLEAN;
BEGIN
  SELECT id, club_id, publication_type, poll_visibility, closed_at, closes_at, deleted_at
    INTO _pub FROM public.club_publications WHERE id = _publication_id;
  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  _is_staff := public.is_club_staff(auth.uid(), _pub.club_id);
  IF NOT _is_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      WHERE r.publication_id = _publication_id
        AND (
          (r.subject_kind = 'user' AND r.subject_user_id = auth.uid())
          OR (r.subject_kind = 'player' AND EXISTS (
                SELECT 1 FROM public.players p
                WHERE p.id = r.member_id
                  AND (
                    p.user_id = auth.uid()
                    OR EXISTS (SELECT 1 FROM public.player_parents pp
                                WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid())
                  )
              ))
        )
    ) INTO _is_recipient;
    IF NOT _is_recipient THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  SELECT count(DISTINCT (v.subject_kind, COALESCE(v.member_id, v.subject_user_id)))::INT
    INTO _total FROM public.club_poll_votes v WHERE v.publication_id = _publication_id;
  _threshold_hit := (_pub.poll_visibility = 'anonymous' AND _total < 3);

  RETURN QUERY
  SELECT o.id, o.label, o.sort_order,
    CASE WHEN _threshold_hit
         THEN NULL::INT
         ELSE COALESCE((SELECT count(*)::INT FROM public.club_poll_votes v WHERE v.option_id = o.id), 0)
    END,
    _total, _threshold_hit,
    (_pub.poll_visibility = 'anonymous'),
    (_pub.closed_at IS NOT NULL OR (_pub.closes_at IS NOT NULL AND _pub.closes_at < now()))
  FROM public.club_poll_options o
  WHERE o.publication_id = _publication_id
  ORDER BY o.sort_order, o.created_at;
END $fn$;
REVOKE ALL ON FUNCTION public.get_poll_results(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll_results(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_eligible_vote_subjects(uuid);
CREATE OR REPLACE FUNCTION public.get_eligible_vote_subjects(_publication_id uuid)
RETURNS TABLE(subject_kind text, subject_id uuid, relation text, label text,
              current_option_id uuid, current_option_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'user'::text, _uid, 'self'::text, NULL::text,
    (SELECT v.option_id FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'user' AND v.subject_user_id = _uid
      LIMIT 1),
    COALESCE((SELECT array_agg(v.option_id) FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'user' AND v.subject_user_id = _uid), ARRAY[]::uuid[])
  FROM public.club_publication_recipients r
  WHERE r.publication_id = _publication_id
    AND r.subject_kind = 'user'
    AND r.subject_user_id = _uid
  UNION ALL
  SELECT 'player'::text, p.id, 'self'::text, (p.first_name || ' ' || p.last_name),
    (SELECT v.option_id FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'player' AND v.member_id = p.id
      LIMIT 1),
    COALESCE((SELECT array_agg(v.option_id) FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'player' AND v.member_id = p.id), ARRAY[]::uuid[])
  FROM public.club_publication_recipients r
  JOIN public.players p ON p.id = r.member_id
  WHERE r.publication_id = _publication_id
    AND r.subject_kind = 'player'
    AND p.user_id = _uid
  UNION ALL
  SELECT 'player'::text, p.id, 'guardian'::text, (p.first_name || ' ' || p.last_name),
    (SELECT v.option_id FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'player' AND v.member_id = p.id
      LIMIT 1),
    COALESCE((SELECT array_agg(v.option_id) FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'player' AND v.member_id = p.id), ARRAY[]::uuid[])
  FROM public.club_publication_recipients r
  JOIN public.players p ON p.id = r.member_id
  JOIN public.player_parents pp
    ON pp.player_id = p.id
   AND pp.parent_user_id = _uid
   AND pp.can_respond = TRUE
  WHERE r.publication_id = _publication_id
    AND r.subject_kind = 'player'
    AND (p.user_id IS DISTINCT FROM _uid);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_eligible_vote_subjects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eligible_vote_subjects(uuid) TO authenticated, service_role;