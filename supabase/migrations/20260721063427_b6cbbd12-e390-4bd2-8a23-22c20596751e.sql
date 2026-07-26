-- Fix poll publication visibility and audience snapshot recursion/ambiguity

-- 1) Make recipient-based publication visibility avoid querying the recipients table
-- in a way that can re-enter club_publications policies.
CREATE OR REPLACE FUNCTION public.viewer_is_publication_recipient(
  _publication_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_publication_recipients r
    WHERE r.publication_id = _publication_id
      AND r.subject_kind = 'user'
      AND r.subject_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.club_publication_recipients r
    JOIN public.players p ON p.id = r.member_id
    WHERE r.publication_id = _publication_id
      AND r.subject_kind = 'player'
      AND (
        p.user_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.player_parents pp
          WHERE pp.player_id = p.id
            AND pp.parent_user_id = _user_id
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.viewer_is_publication_recipient(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_is_publication_recipient(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS publications_recipient_read ON public.club_publications;
CREATE POLICY publications_recipient_read
ON public.club_publications
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND public.viewer_is_publication_recipient(id, auth.uid())
);

-- 2) Avoid PL/pgSQL output-column ambiguity in the shared audience resolver.
CREATE OR REPLACE FUNCTION public._resolve_audience_subjects(
  _club_id uuid,
  _audiences jsonb,
  _manual_member_ids uuid[]
)
RETURNS TABLE(subject_kind text, member_id uuid, subject_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH aud AS (
    SELECT
      (elem->>'audience_type')::text           AS audience_type,
      NULLIF(elem->>'team_id','')::uuid        AS team_id,
      NULLIF(elem->>'season_id','')::uuid      AS season_id,
      NULLIF(elem->>'category_label','')::text AS category_label,
      NULLIF(elem->>'event_id','')::uuid       AS event_id,
      NULLIF(elem->>'group_id','')::uuid       AS group_id
    FROM jsonb_array_elements(COALESCE(_audiences, '[]'::jsonb)) elem
  ),
  manual_ids AS (
    SELECT unnest(COALESCE(_manual_member_ids, ARRAY[]::uuid[])) AS manual_player_id
  ),
  players_ AS (
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN public.team_members tm ON tm.team_id = a.team_id
      JOIN public.players p ON p.id = tm.player_id
     WHERE a.audience_type = 'joueurs_equipe'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.players p ON p.id = ps.player_id
     WHERE a.audience_type = 'joueurs_categorie'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN public.convocations c ON c.event_id = a.event_id
      JOIN public.players p ON p.id = c.player_id
     WHERE a.audience_type = 'joueurs_convoques'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN manual_ids mi ON TRUE
      JOIN public.players p ON p.id = mi.manual_player_id
     WHERE a.audience_type = 'selection_manuelle'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
  ),
  users_ AS (
    SELECT DISTINCT pp.parent_user_id AS user_id
      FROM aud a
      JOIN public.team_members tm ON tm.team_id = a.team_id
      JOIN public.players p ON p.id = tm.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_equipe'
    UNION
    SELECT DISTINCT pp.parent_user_id AS user_id
      FROM aud a
      JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.players p ON p.id = ps.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_categorie'
    UNION
    SELECT DISTINCT pp.parent_user_id AS user_id
      FROM aud a
      JOIN public.convocations c ON c.event_id = a.event_id
      JOIN public.players p ON p.id = c.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_convoques'
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.club_members cm ON cm.club_id = _club_id
     WHERE a.audience_type = 'educateurs'
       AND public.has_club_role_any(cm.user_id, _club_id, ARRAY['coach','assistant_coach'])
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.club_members cm ON cm.club_id = _club_id
     WHERE a.audience_type = 'dirigeants'
       AND public.has_club_role_any(cm.user_id, _club_id, ARRAY['admin','dirigeant'])
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.club_group_members cgm ON cgm.group_id = a.group_id
      JOIN public.club_members cm ON cm.id = cgm.member_id AND cm.club_id = _club_id
     WHERE a.audience_type = 'groupe_personnalise'
       AND cm.user_id IS NOT NULL
  )
  SELECT 'player'::text AS subject_kind, p.player_id AS member_id, NULL::uuid AS subject_user_id
  FROM players_ p
  UNION ALL
  SELECT 'user'::text AS subject_kind, NULL::uuid AS member_id, u.user_id AS subject_user_id
  FROM users_ u
  WHERE u.user_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public._resolve_audience_subjects(uuid, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._resolve_audience_subjects(uuid, jsonb, uuid[]) TO authenticated, service_role;

-- 3) Make publication publish use direct table reads inside the definer function
-- and qualify every temp-table column to avoid name collisions.
CREATE OR REPLACE FUNCTION public.publish_publication_atomic(
  _publication_id uuid,
  _kind publication_dispatch_kind,
  _dispatch_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(dispatch_row_id uuid, recipients_count integer, new_recipient_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _club_id uuid;
  _pub_type publication_type;
  _dispatch_row uuid;
  _resolved_count integer;
  _delta_count integer;
  _final_dispatch uuid := COALESCE(_dispatch_id, gen_random_uuid());
  _audiences jsonb;
  _manual uuid[];
BEGIN
  SELECT cp.club_id, cp.publication_type
    INTO _club_id, _pub_type
    FROM public.club_publications cp
   WHERE cp.id = _publication_id
     AND cp.deleted_at IS NULL;

  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'publication_not_found_or_deleted';
  END IF;

  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _pub_type = 'poll'
     AND (SELECT count(*) FROM public.club_poll_options cpo WHERE cpo.publication_id = _publication_id) < 2 THEN
    RAISE EXCEPTION 'poll_requires_two_options';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'audience_type', cpa.audience_type,
      'team_id', cpa.team_id,
      'season_id', cpa.season_id,
      'category_label', cpa.category_label,
      'event_id', cpa.event_id,
      'group_id', cpa.group_id
    )), '[]'::jsonb)
    INTO _audiences
    FROM public.club_publication_audiences cpa
   WHERE cpa.publication_id = _publication_id;

  SELECT COALESCE(array_agg(cpmm.member_id), ARRAY[]::uuid[])
    INTO _manual
    FROM public.club_publication_manual_members cpmm
   WHERE cpmm.publication_id = _publication_id;

  CREATE TEMP TABLE _resolved_publication_recipients(
    resolved_subject_kind text,
    resolved_member_id uuid,
    resolved_subject_user_id uuid
  ) ON COMMIT DROP;

  INSERT INTO _resolved_publication_recipients(
    resolved_subject_kind,
    resolved_member_id,
    resolved_subject_user_id
  )
  SELECT ras.subject_kind, ras.member_id, ras.subject_user_id
    FROM public._resolve_audience_subjects(_club_id, _audiences, _manual) ras;

  SELECT count(*) INTO _resolved_count FROM _resolved_publication_recipients;

  INSERT INTO public.club_publication_dispatches(publication_id, dispatch_id, kind, created_by, recipients_count)
  VALUES(_publication_id, _final_dispatch, _kind, auth.uid(), 0)
  RETURNING id INTO _dispatch_row;

  WITH inserted AS (
    INSERT INTO public.club_publication_recipients(
      publication_id,
      subject_kind,
      member_id,
      subject_user_id,
      first_dispatch_id
    )
    SELECT
      _publication_id,
      r.resolved_subject_kind,
      r.resolved_member_id,
      r.resolved_subject_user_id,
      _dispatch_row
    FROM _resolved_publication_recipients r
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.club_publication_recipients existing
      WHERE existing.publication_id = _publication_id
        AND existing.subject_kind = r.resolved_subject_kind
        AND COALESCE(existing.member_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(r.resolved_member_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(existing.subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(r.resolved_subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    RETURNING id
  )
  SELECT count(*) INTO _delta_count FROM inserted;

  UPDATE public.club_publication_dispatches cpd
     SET recipients_count = CASE WHEN _kind = 'audience_refresh' THEN _delta_count ELSE _resolved_count END
   WHERE cpd.id = _dispatch_row;

  RETURN QUERY SELECT _dispatch_row, _resolved_count, _delta_count;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_publication_atomic(uuid, publication_dispatch_kind, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_publication_atomic(uuid, publication_dispatch_kind, uuid) TO authenticated, service_role;

-- 4) Vote authorization should use the same definer-safe recipient checks.
CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  _publication_id uuid,
  _option_id uuid,
  _subject_kind text,
  _subject_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'audit'
AS $$
DECLARE
  _pub record;
  _opt_pub uuid;
  _authorized boolean := false;
  _vote_id uuid;
  _prev_option uuid;
  _action poll_vote_action;
  _member_id uuid;
  _subject_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _subject_kind NOT IN ('player','user') THEN RAISE EXCEPTION 'invalid_subject_kind'; END IF;

  SELECT cp.id, cp.club_id, cp.publication_type, cp.closed_at, cp.closes_at, cp.deleted_at
    INTO _pub
    FROM public.club_publications cp
   WHERE cp.id = _publication_id;

  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  IF _pub.closed_at IS NOT NULL OR (_pub.closes_at IS NOT NULL AND _pub.closes_at < now()) THEN
    RAISE EXCEPTION 'poll_closed';
  END IF;

  SELECT cpo.publication_id INTO _opt_pub
    FROM public.club_poll_options cpo
   WHERE cpo.id = _option_id;
  IF _opt_pub IS NULL OR _opt_pub <> _publication_id THEN RAISE EXCEPTION 'option_mismatch'; END IF;

  IF _subject_kind = 'player' THEN
    _member_id := _subject_id;
    SELECT EXISTS (
      SELECT 1
      FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = _publication_id
        AND r.subject_kind = 'player'
        AND r.member_id = _member_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.player_parents pp
            WHERE pp.player_id = p.id
              AND pp.parent_user_id = auth.uid()
              AND pp.can_respond = TRUE
          )
        )
    ) INTO _authorized;
  ELSE
    _subject_user_id := _subject_id;
    IF _subject_user_id = auth.uid() THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.club_publication_recipients r
        WHERE r.publication_id = _publication_id
          AND r.subject_kind = 'user'
          AND r.subject_user_id = _subject_user_id
      ) INTO _authorized;
    END IF;
  END IF;

  IF NOT _authorized THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _subject_kind = 'player' THEN
    SELECT cpv.option_id INTO _prev_option
      FROM public.club_poll_votes cpv
     WHERE cpv.publication_id = _publication_id
       AND cpv.subject_kind = 'player'
       AND cpv.member_id = _member_id;
  ELSE
    SELECT cpv.option_id INTO _prev_option
      FROM public.club_poll_votes cpv
     WHERE cpv.publication_id = _publication_id
       AND cpv.subject_kind = 'user'
       AND cpv.subject_user_id = _subject_user_id;
  END IF;

  IF _prev_option IS NULL THEN
    _action := 'vote';
    INSERT INTO public.club_poll_votes(publication_id, option_id, subject_kind, member_id, subject_user_id, cast_by_user_id)
    VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid())
    RETURNING id INTO _vote_id;
  ELSIF _prev_option = _option_id THEN
    IF _subject_kind = 'player' THEN
      SELECT cpv.id INTO _vote_id
        FROM public.club_poll_votes cpv
       WHERE cpv.publication_id = _publication_id
         AND cpv.subject_kind = 'player'
         AND cpv.member_id = _member_id;
    ELSE
      SELECT cpv.id INTO _vote_id
        FROM public.club_poll_votes cpv
       WHERE cpv.publication_id = _publication_id
         AND cpv.subject_kind = 'user'
         AND cpv.subject_user_id = _subject_user_id;
    END IF;
    RETURN _vote_id;
  ELSE
    _action := 'change';
    IF _subject_kind = 'player' THEN
      UPDATE public.club_poll_votes cpv
         SET option_id = _option_id,
             cast_by_user_id = auth.uid(),
             updated_at = now()
       WHERE cpv.publication_id = _publication_id
         AND cpv.subject_kind = 'player'
         AND cpv.member_id = _member_id
       RETURNING cpv.id INTO _vote_id;
    ELSE
      UPDATE public.club_poll_votes cpv
         SET option_id = _option_id,
             cast_by_user_id = auth.uid(),
             updated_at = now()
       WHERE cpv.publication_id = _publication_id
         AND cpv.subject_kind = 'user'
         AND cpv.subject_user_id = _subject_user_id
       RETURNING cpv.id INTO _vote_id;
    END IF;
  END IF;

  INSERT INTO audit.club_poll_vote_log(
    publication_id,
    option_id,
    subject_kind,
    member_id,
    subject_user_id,
    cast_by_user_id,
    action
  ) VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid(), _action);

  RETURN _vote_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cast_poll_vote(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(uuid, uuid, text, uuid) TO authenticated, service_role;