-- Fix remaining publication RPC PL/pgSQL OUT-column collisions (42702)
-- and re-assert the club_publications ↔ recipients RLS recursion break (42P17).
--
-- Context (RLS suite, 2026-07-21):
--   - 20260721062049 / 20260721063427 fixed _resolve_audience_subjects (sql),
--     publish_publication_atomic, and publications_recipient_read via
--     viewer_is_publication_recipient.
--   - resolve_publication_audience + get_eligible_vote_subjects were left on the
--     20260720084225 bodies and still raise:
--       42702 column reference "member_id" / "subject_kind" is ambiguous
--     because RETURNS TABLE(...) OUT vars collide with SQL column names.
--   - cast_poll_vote "forbidden" and empty recipient assertions cascade from
--     failed publish / resolve.

-- ---------------------------------------------------------------------------
-- 1) resolve_publication_audience — qualify member_id + use_column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_publication_audience(_publication_id uuid)
RETURNS TABLE(subject_kind text, member_id uuid, subject_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _club_id uuid;
  _audiences jsonb;
  _manual uuid[];
BEGIN
  SELECT cp.club_id INTO _club_id
    FROM public.club_publications cp
   WHERE cp.id = _publication_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'audience_type',   cpa.audience_type,
      'team_id',         cpa.team_id,
      'season_id',       cpa.season_id,
      'category_label',  cpa.category_label,
      'event_id',        cpa.event_id,
      'group_id',        cpa.group_id
    )), '[]'::jsonb)
    INTO _audiences
    FROM public.club_publication_audiences cpa
   WHERE cpa.publication_id = _publication_id;

  SELECT COALESCE(array_agg(cpmm.member_id), ARRAY[]::uuid[])
    INTO _manual
    FROM public.club_publication_manual_members cpmm
   WHERE cpmm.publication_id = _publication_id;

  RETURN QUERY
  SELECT ras.subject_kind, ras.member_id, ras.subject_user_id
    FROM public._resolve_audience_subjects(_club_id, _audiences, _manual) ras;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_publication_audience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_publication_audience(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) preview_publication_audience — qualify CTE columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_publication_audience(
  _club_id uuid,
  _event_id uuid,
  _audiences jsonb,
  _manual_member_ids uuid[]
)
RETURNS TABLE("count" int, player_count int, user_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH resolved AS (
    SELECT DISTINCT ras.subject_kind, ras.member_id, ras.subject_user_id
      FROM public._resolve_audience_subjects(_club_id, _audiences, _manual_member_ids) ras
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE resolved.subject_kind = 'player')::int,
         count(*) FILTER (WHERE resolved.subject_kind = 'user')::int
    FROM resolved;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_publication_audience(uuid, uuid, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_publication_audience(uuid, uuid, jsonb, uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) get_eligible_vote_subjects — subject_kind OUT vs column collision
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_eligible_vote_subjects(_publication_id uuid)
RETURNS TABLE(subject_kind text, subject_id uuid, relation text, label text, current_option_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  -- (a) subject 'user' = self
  SELECT 'user'::text, _uid, 'self'::text, NULL::text,
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
  SELECT 'player'::text, p.id, 'self'::text, (p.first_name || ' ' || p.last_name),
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
  SELECT 'player'::text, p.id, 'guardian'::text, (p.first_name || ' ' || p.last_name),
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
    AND (p.user_id IS DISTINCT FROM _uid);
END;
$$;
REVOKE ALL ON FUNCTION public.get_eligible_vote_subjects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eligible_vote_subjects(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Re-assert 42P17 break (idempotent) — SECURITY DEFINER helper + policy
-- ---------------------------------------------------------------------------
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
