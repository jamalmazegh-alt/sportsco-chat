
-- ============================================================================
-- Phase A v2 — polymorphic subject (player | user) for recipients & poll votes
-- Bucket creation handled separately via storage tool.
-- ============================================================================

-- 1. club_publication_recipients ---------------------------------------------
ALTER TABLE public.club_publication_recipients
  ADD COLUMN IF NOT EXISTS subject_kind TEXT NOT NULL DEFAULT 'player'
    CHECK (subject_kind IN ('player','user')),
  ADD COLUMN IF NOT EXISTS subject_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.club_publication_recipients ALTER COLUMN member_id DROP NOT NULL;

DO $$
DECLARE _c TEXT;
BEGIN
  SELECT conname INTO _c FROM pg_constraint
   WHERE conrelid = 'public.club_publication_recipients'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(publication_id, member_id)%';
  IF _c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.club_publication_recipients DROP CONSTRAINT %I', _c);
  END IF;
END $$;

ALTER TABLE public.club_publication_recipients
  DROP CONSTRAINT IF EXISTS recipients_subject_chk,
  ADD  CONSTRAINT recipients_subject_chk CHECK (
    (subject_kind='player' AND member_id IS NOT NULL AND subject_user_id IS NULL) OR
    (subject_kind='user'   AND subject_user_id IS NOT NULL AND member_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipients_subject
  ON public.club_publication_recipients(
    publication_id, subject_kind,
    COALESCE(member_id,       '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS idx_pub_recipients_user
  ON public.club_publication_recipients(subject_user_id)
  WHERE subject_user_id IS NOT NULL;

-- 2. club_poll_votes ---------------------------------------------------------
ALTER TABLE public.club_poll_votes
  ADD COLUMN IF NOT EXISTS subject_kind TEXT NOT NULL DEFAULT 'player'
    CHECK (subject_kind IN ('player','user')),
  ADD COLUMN IF NOT EXISTS subject_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.club_poll_votes ALTER COLUMN member_id DROP NOT NULL;

DO $$
DECLARE _c TEXT;
BEGIN
  SELECT conname INTO _c FROM pg_constraint
   WHERE conrelid = 'public.club_poll_votes'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(publication_id, member_id)%';
  IF _c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.club_poll_votes DROP CONSTRAINT %I', _c);
  END IF;
END $$;

ALTER TABLE public.club_poll_votes
  DROP CONSTRAINT IF EXISTS poll_vote_subject_chk,
  ADD  CONSTRAINT poll_vote_subject_chk CHECK (
    (subject_kind='player' AND member_id IS NOT NULL AND subject_user_id IS NULL) OR
    (subject_kind='user'   AND subject_user_id IS NOT NULL AND member_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_vote_subject
  ON public.club_poll_votes(
    publication_id, subject_kind,
    COALESCE(member_id,       '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS idx_poll_votes_user
  ON public.club_poll_votes(subject_user_id)
  WHERE subject_user_id IS NOT NULL;

-- 3. audit.club_poll_vote_log ------------------------------------------------
ALTER TABLE audit.club_poll_vote_log
  ADD COLUMN IF NOT EXISTS subject_kind TEXT NOT NULL DEFAULT 'player'
    CHECK (subject_kind IN ('player','user')),
  ADD COLUMN IF NOT EXISTS subject_user_id UUID;
ALTER TABLE audit.club_poll_vote_log ALTER COLUMN member_id DROP NOT NULL;

-- 4. resolve_publication_audience — polymorphic ------------------------------
DROP FUNCTION IF EXISTS public.resolve_publication_audience(UUID);
CREATE OR REPLACE FUNCTION public.resolve_publication_audience(_publication_id UUID)
RETURNS TABLE(subject_kind TEXT, member_id UUID, subject_user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _club_id UUID;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_publications WHERE id = _publication_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  WITH aud AS (SELECT * FROM public.club_publication_audiences WHERE publication_id = _publication_id),
  players_ AS (
    SELECT DISTINCT p.id AS pid
      FROM aud a
      JOIN public.team_members tm ON tm.team_id = a.team_id
      JOIN public.players p ON p.id = tm.player_id
     WHERE a.audience_type = 'joueurs_equipe'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id
      FROM aud a
      JOIN public.seasons s   ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.players p ON p.id = ps.player_id
     WHERE a.audience_type = 'joueurs_categorie' AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id
      FROM aud a
      JOIN public.convocations c ON c.event_id = a.event_id
      JOIN public.players p ON p.id = c.player_id
     WHERE a.audience_type = 'joueurs_convoques'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT mm.member_id
      FROM aud a
      JOIN public.club_publication_manual_members mm ON mm.publication_id = _publication_id
      JOIN public.players p ON p.id = mm.member_id
     WHERE a.audience_type = 'selection_manuelle'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
  ),
  users_ AS (
    SELECT DISTINCT pp.parent_user_id AS uid
      FROM aud a
      JOIN public.team_members tm ON tm.team_id = a.team_id
      JOIN public.players p ON p.id = tm.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_equipe'
    UNION
    SELECT DISTINCT pp.parent_user_id
      FROM aud a
      JOIN public.seasons s   ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.players p ON p.id = ps.player_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_categorie'
    UNION
    SELECT DISTINCT pp.parent_user_id
      FROM aud a
      JOIN public.convocations c ON c.event_id = a.event_id
      JOIN public.players p ON p.id = c.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_convoques'
    UNION
    SELECT DISTINCT cm.user_id
      FROM aud a
      JOIN public.club_members cm ON cm.club_id = _club_id
     WHERE a.audience_type = 'educateurs'
       AND public.has_club_role_any(cm.user_id, _club_id, ARRAY['coach','assistant_coach'])
    UNION
    SELECT DISTINCT cm.user_id
      FROM aud a
      JOIN public.club_members cm ON cm.club_id = _club_id
     WHERE a.audience_type = 'dirigeants'
       AND public.has_club_role_any(cm.user_id, _club_id, ARRAY['admin','dirigeant'])
    UNION
    SELECT DISTINCT cm.user_id
      FROM aud a
      JOIN public.club_group_members cgm ON cgm.group_id = a.group_id
      JOIN public.club_members cm ON cm.id = cgm.member_id AND cm.club_id = _club_id
     WHERE a.audience_type = 'groupe_personnalise' AND cm.user_id IS NOT NULL
  )
  SELECT 'player'::TEXT, pid, NULL::UUID FROM players_
  UNION ALL
  SELECT 'user'::TEXT, NULL::UUID, uid FROM users_ WHERE uid IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.resolve_publication_audience(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_publication_audience(UUID) TO authenticated, service_role;

-- 5. publish_publication_atomic ----------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_publication_atomic(
  _publication_id UUID,
  _kind publication_dispatch_kind,
  _dispatch_id UUID DEFAULT NULL
)
RETURNS TABLE(dispatch_row_id UUID, recipients_count INT, new_recipient_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _club_id UUID;
  _pub_type publication_type;
  _dispatch_row UUID;
  _resolved_count INT;
  _delta_count INT;
  _final_dispatch UUID := COALESCE(_dispatch_id, gen_random_uuid());
BEGIN
  SELECT club_id, publication_type INTO _club_id, _pub_type
    FROM public.club_publications WHERE id = _publication_id AND deleted_at IS NULL;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'publication_not_found_or_deleted'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _pub_type = 'poll'
     AND (SELECT count(*) FROM public.club_poll_options WHERE publication_id = _publication_id) < 2 THEN
    RAISE EXCEPTION 'poll_requires_two_options';
  END IF;

  CREATE TEMP TABLE _resolved(subject_kind TEXT, member_id UUID, subject_user_id UUID) ON COMMIT DROP;
  INSERT INTO _resolved(subject_kind, member_id, subject_user_id)
    SELECT r.subject_kind, r.member_id, r.subject_user_id
      FROM public.resolve_publication_audience(_publication_id) r;
  SELECT count(*) INTO _resolved_count FROM _resolved;

  INSERT INTO public.club_publication_dispatches(publication_id, dispatch_id, kind, created_by, recipients_count)
    VALUES(_publication_id, _final_dispatch, _kind, auth.uid(), 0)
    RETURNING id INTO _dispatch_row;

  WITH inserted AS (
    INSERT INTO public.club_publication_recipients(
      publication_id, subject_kind, member_id, subject_user_id, first_dispatch_id
    )
    SELECT _publication_id, r.subject_kind, r.member_id, r.subject_user_id, _dispatch_row
      FROM _resolved r
     WHERE NOT EXISTS (
       SELECT 1 FROM public.club_publication_recipients rr
        WHERE rr.publication_id = _publication_id
          AND rr.subject_kind   = r.subject_kind
          AND COALESCE(rr.member_id,       '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(r.member_id,        '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(rr.subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(r.subject_user_id,  '00000000-0000-0000-0000-000000000000'::uuid)
     )
    RETURNING id
  )
  SELECT count(*) INTO _delta_count FROM inserted;

  UPDATE public.club_publication_dispatches
     SET recipients_count = CASE WHEN _kind = 'audience_refresh' THEN _delta_count ELSE _resolved_count END
   WHERE id = _dispatch_row;

  RETURN QUERY SELECT _dispatch_row, _resolved_count, _delta_count;
END $$;
REVOKE ALL ON FUNCTION public.publish_publication_atomic(UUID, publication_dispatch_kind, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_publication_atomic(UUID, publication_dispatch_kind, UUID) TO authenticated, service_role;

-- 6. cast_poll_vote — new signature ------------------------------------------
DROP FUNCTION IF EXISTS public.cast_poll_vote(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  _publication_id UUID,
  _option_id UUID,
  _subject_kind TEXT,
  _subject_id UUID
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, audit AS $$
DECLARE
  _pub RECORD; _opt_pub UUID; _authorized BOOLEAN;
  _vote_id UUID; _prev_option UUID; _action poll_vote_action;
  _member_id UUID; _subject_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _subject_kind NOT IN ('player','user') THEN RAISE EXCEPTION 'invalid_subject_kind'; END IF;

  SELECT id, club_id, publication_type, closed_at, closes_at, deleted_at
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

  IF _subject_kind = 'player' THEN
    SELECT option_id INTO _prev_option FROM public.club_poll_votes
      WHERE publication_id = _publication_id AND subject_kind = 'player' AND member_id = _member_id;
  ELSE
    SELECT option_id INTO _prev_option FROM public.club_poll_votes
      WHERE publication_id = _publication_id AND subject_kind = 'user' AND subject_user_id = _subject_user_id;
  END IF;

  IF _prev_option IS NULL THEN
    _action := 'vote';
    INSERT INTO public.club_poll_votes(publication_id, option_id, subject_kind, member_id, subject_user_id, cast_by_user_id)
      VALUES(_publication_id, _option_id, _subject_kind, _member_id, _subject_user_id, auth.uid())
      RETURNING id INTO _vote_id;
  ELSIF _prev_option = _option_id THEN
    IF _subject_kind = 'player' THEN
      SELECT id INTO _vote_id FROM public.club_poll_votes
        WHERE publication_id = _publication_id AND subject_kind = 'player' AND member_id = _member_id;
    ELSE
      SELECT id INTO _vote_id FROM public.club_poll_votes
        WHERE publication_id = _publication_id AND subject_kind = 'user' AND subject_user_id = _subject_user_id;
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
END $$;
REVOKE ALL ON FUNCTION public.cast_poll_vote(UUID, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(UUID, UUID, TEXT, UUID) TO authenticated;

-- 7. get_poll_results — server-side threshold masking ------------------------
CREATE OR REPLACE FUNCTION public.get_poll_results(_publication_id UUID)
RETURNS TABLE(option_id UUID, label TEXT, sort_order INT, vote_count INT,
              total_voters INT, below_threshold BOOLEAN, is_anonymous BOOLEAN, is_closed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT count(*)::INT INTO _total FROM public.club_poll_votes v WHERE v.publication_id = _publication_id;
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
END $$;
REVOKE ALL ON FUNCTION public.get_poll_results(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll_results(UUID) TO authenticated, service_role;

-- 8. RLS updates -------------------------------------------------------------
DROP POLICY IF EXISTS poll_votes_own_read ON public.club_poll_votes;
CREATE POLICY poll_votes_own_read ON public.club_poll_votes
  FOR SELECT TO authenticated
  USING (
    (subject_kind = 'user' AND subject_user_id = auth.uid())
    OR (subject_kind = 'player' AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = member_id
        AND (p.user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.player_parents pp
                          WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    ))
  );

DROP POLICY IF EXISTS pub_recipients_self_read ON public.club_publication_recipients;
CREATE POLICY pub_recipients_self_read ON public.club_publication_recipients
  FOR SELECT TO authenticated
  USING (
    (subject_kind = 'user' AND subject_user_id = auth.uid())
    OR (subject_kind = 'player' AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = member_id
        AND (p.user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.player_parents pp
                          WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    ))
  );

DROP POLICY IF EXISTS publications_recipient_read ON public.club_publications;
CREATE POLICY publications_recipient_read ON public.club_publications
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      WHERE r.publication_id = club_publications.id
        AND (
          (r.subject_kind = 'user' AND r.subject_user_id = auth.uid())
          OR (r.subject_kind = 'player' AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = r.member_id
              AND (p.user_id = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.player_parents pp
                                WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
          ))
        )
    )
  );

DROP POLICY IF EXISTS pub_docs_recipient_read ON public.club_publication_documents;
CREATE POLICY pub_docs_recipient_read ON public.club_publication_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      WHERE r.publication_id = club_publication_documents.publication_id
        AND (
          (r.subject_kind = 'user' AND r.subject_user_id = auth.uid())
          OR (r.subject_kind = 'player' AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = r.member_id
              AND (p.user_id = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.player_parents pp
                                WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
          ))
        )
    )
  );

DROP POLICY IF EXISTS pub_media_recipient_read ON public.club_publication_media;
CREATE POLICY pub_media_recipient_read ON public.club_publication_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      WHERE r.publication_id = club_publication_media.publication_id
        AND (
          (r.subject_kind = 'user' AND r.subject_user_id = auth.uid())
          OR (r.subject_kind = 'player' AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = r.member_id
              AND (p.user_id = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.player_parents pp
                                WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
          ))
        )
    )
  );

DROP POLICY IF EXISTS poll_options_recipient_read ON public.club_poll_options;
CREATE POLICY poll_options_recipient_read ON public.club_poll_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      WHERE r.publication_id = club_poll_options.publication_id
        AND (
          (r.subject_kind = 'user' AND r.subject_user_id = auth.uid())
          OR (r.subject_kind = 'player' AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = r.member_id
              AND (p.user_id = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.player_parents pp
                                WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
          ))
        )
    )
  );

DROP POLICY IF EXISTS publication_media_recipient_read ON storage.objects;
CREATE POLICY publication_media_recipient_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'publication-media'
    AND EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      WHERE r.publication_id::text = split_part(name, '/', 2)
        AND (
          (r.subject_kind = 'user' AND r.subject_user_id = auth.uid())
          OR (r.subject_kind = 'player' AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = r.member_id
              AND (p.user_id = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.player_parents pp
                                WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
          ))
        )
    )
  );
