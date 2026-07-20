
-- =========================================================================
-- Publications Phase B fixes: shared resolver core + preview RPC +
-- eligible-vote-subjects RPC.
-- =========================================================================

-- 1. Internal shared resolver: computes the audience from an ad-hoc JSONB list
--    of audience items + a UUID[] of manual member ids. Used by both
--    resolve_publication_audience (real) and preview_publication_audience.
--    NOT security-definer: caller is responsible for authorization.
DROP FUNCTION IF EXISTS public._resolve_audience_subjects(UUID, JSONB, UUID[]);
CREATE OR REPLACE FUNCTION public._resolve_audience_subjects(
  _club_id UUID,
  _audiences JSONB,
  _manual_member_ids UUID[]
)
RETURNS TABLE(subject_kind TEXT, member_id UUID, subject_user_id UUID)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH aud AS (
    SELECT
      (elem->>'audience_type')::TEXT           AS audience_type,
      NULLIF(elem->>'team_id','')::UUID        AS team_id,
      NULLIF(elem->>'season_id','')::UUID      AS season_id,
      NULLIF(elem->>'category_label','')::TEXT AS category_label,
      NULLIF(elem->>'event_id','')::UUID       AS event_id,
      NULLIF(elem->>'group_id','')::UUID       AS group_id
    FROM jsonb_array_elements(COALESCE(_audiences, '[]'::jsonb)) elem
  ),
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
    SELECT DISTINCT p.id
      FROM aud a
      JOIN unnest(COALESCE(_manual_member_ids, ARRAY[]::UUID[])) AS mm(member_id) ON TRUE
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
REVOKE ALL ON FUNCTION public._resolve_audience_subjects(UUID, JSONB, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._resolve_audience_subjects(UUID, JSONB, UUID[]) TO authenticated, service_role;

-- 2. resolve_publication_audience refactored to delegate to the shared core.
DROP FUNCTION IF EXISTS public.resolve_publication_audience(UUID);
CREATE OR REPLACE FUNCTION public.resolve_publication_audience(_publication_id UUID)
RETURNS TABLE(subject_kind TEXT, member_id UUID, subject_user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _club_id UUID;
  _audiences JSONB;
  _manual UUID[];
BEGIN
  SELECT club_id INTO _club_id FROM public.club_publications WHERE id = _publication_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'audience_type',   audience_type,
      'team_id',         team_id,
      'season_id',       season_id,
      'category_label',  category_label,
      'event_id',        event_id,
      'group_id',        group_id
    )), '[]'::jsonb)
    INTO _audiences
    FROM public.club_publication_audiences
   WHERE publication_id = _publication_id;

  SELECT COALESCE(array_agg(member_id), ARRAY[]::UUID[])
    INTO _manual
    FROM public.club_publication_manual_members
   WHERE publication_id = _publication_id;

  RETURN QUERY
  SELECT r.subject_kind, r.member_id, r.subject_user_id
    FROM public._resolve_audience_subjects(_club_id, _audiences, _manual) r;
END $$;
REVOKE ALL ON FUNCTION public.resolve_publication_audience(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_publication_audience(UUID) TO authenticated, service_role;

-- 3. preview_publication_audience — staff-only, ad-hoc audiences
DROP FUNCTION IF EXISTS public.preview_publication_audience(UUID, UUID, JSONB, UUID[]);
CREATE OR REPLACE FUNCTION public.preview_publication_audience(
  _club_id UUID,
  _event_id UUID,
  _audiences JSONB,
  _manual_member_ids UUID[]
)
RETURNS TABLE("count" INT, player_count INT, user_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH resolved AS (
    SELECT DISTINCT r.subject_kind, r.member_id, r.subject_user_id
      FROM public._resolve_audience_subjects(_club_id, _audiences, _manual_member_ids) r
  )
  SELECT count(*)::INT,
         count(*) FILTER (WHERE subject_kind = 'player')::INT,
         count(*) FILTER (WHERE subject_kind = 'user')::INT
    FROM resolved;
END $$;
REVOKE ALL ON FUNCTION public.preview_publication_audience(UUID, UUID, JSONB, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_publication_audience(UUID, UUID, JSONB, UUID[]) TO authenticated, service_role;

-- 4. get_eligible_vote_subjects — subjects the caller can vote on
DROP FUNCTION IF EXISTS public.get_eligible_vote_subjects(UUID);
CREATE OR REPLACE FUNCTION public.get_eligible_vote_subjects(_publication_id UUID)
RETURNS TABLE(subject_kind TEXT, subject_id UUID, relation TEXT, label TEXT, current_option_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  -- (a) subject 'user' = self
  SELECT 'user'::TEXT, _uid, 'self'::TEXT, NULL::TEXT,
    (SELECT v.option_id FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'user'
        AND v.subject_user_id = _uid
      LIMIT 1)
  FROM public.club_publication_recipients r
  WHERE r.publication_id = _publication_id
    AND r.subject_kind = 'user'
    AND r.subject_user_id = _uid
  UNION ALL
  -- (b) subject 'player' = viewer IS the player
  SELECT 'player'::TEXT, p.id, 'self'::TEXT, (p.first_name || ' ' || p.last_name),
    (SELECT v.option_id FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'player'
        AND v.member_id = p.id
      LIMIT 1)
  FROM public.club_publication_recipients r
  JOIN public.players p ON p.id = r.member_id
  WHERE r.publication_id = _publication_id
    AND r.subject_kind = 'player'
    AND p.user_id = _uid
  UNION ALL
  -- (c) subject 'player' = viewer is authorized guardian (can_respond)
  SELECT 'player'::TEXT, p.id, 'guardian'::TEXT, (p.first_name || ' ' || p.last_name),
    (SELECT v.option_id FROM public.club_poll_votes v
      WHERE v.publication_id = _publication_id
        AND v.subject_kind = 'player'
        AND v.member_id = p.id
      LIMIT 1)
  FROM public.club_publication_recipients r
  JOIN public.players p ON p.id = r.member_id
  JOIN public.player_parents pp
    ON pp.player_id = p.id
   AND pp.parent_user_id = _uid
   AND pp.can_respond = TRUE
  WHERE r.publication_id = _publication_id
    AND r.subject_kind = 'player'
    AND (p.user_id IS DISTINCT FROM _uid);  -- avoid duplicate self/guardian
END $$;
REVOKE ALL ON FUNCTION public.get_eligible_vote_subjects(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eligible_vote_subjects(UUID) TO authenticated, service_role;
