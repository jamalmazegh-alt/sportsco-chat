CREATE OR REPLACE FUNCTION public.sync_meeting_attendees_atomic(
  _event_id UUID,
  _actor UUID,
  _audiences JSONB DEFAULT '[]'::jsonb,
  _manual_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
  _confirm_remove UUID[] DEFAULT ARRAY[]::UUID[],
  _dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(
  added_user_ids UUID[],
  removed_user_ids UUID[],
  kept_count INT,
  requires_confirmation_user_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_club_id UUID;
  v_type public.event_type;
  v_now TIMESTAMPTZ := now();
  v_added UUID[];
  v_removed UUID[];
  v_reqconf UUID[];
  v_kept INT := 0;
BEGIN
  IF _event_id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'event_id and actor required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _actor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT t.club_id, e.type
    INTO v_club_id, v_type
  FROM public.events e
  JOIN public.teams t ON t.id = e.team_id
  WHERE e.id = _event_id
  FOR UPDATE OF e;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_type <> 'meeting' THEN
    RAISE EXCEPTION 'not_a_meeting' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_club_staff(_actor, v_club_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  CREATE TEMP TABLE _src (uid UUID, source JSONB) ON COMMIT DROP;

  IF jsonb_typeof(_audiences) = 'array' AND jsonb_array_length(_audiences) > 0 THEN
    INSERT INTO _src (uid, source)
    SELECT r.user_id, sel.value
    FROM jsonb_array_elements(_audiences) AS sel(value)
    CROSS JOIN LATERAL public.resolve_audience_members(v_club_id, jsonb_build_array(sel.value)) r
    WHERE r.user_id IS NOT NULL;
  END IF;

  INSERT INTO _src (uid, source)
  SELECT mu.uid, jsonb_build_object('type', 'manual')
  FROM unnest(coalesce(_manual_user_ids, ARRAY[]::UUID[])) mu(uid)
  WHERE mu.uid IS NOT NULL;

  CREATE TEMP TABLE _desired (uid UUID PRIMARY KEY, sources JSONB, manual BOOLEAN) ON COMMIT DROP;
  INSERT INTO _desired (uid, sources, manual)
  SELECT s.uid,
         jsonb_agg(DISTINCT s.source),
         bool_or(s.source->>'type' = 'manual')
  FROM _src s
  GROUP BY s.uid;

  SELECT array_agg(d.uid) INTO v_added
  FROM _desired d
  LEFT JOIN public.meeting_attendees m
    ON m.event_id = _event_id AND m.user_id = d.uid
  WHERE m.id IS NULL;

  CREATE TEMP TABLE _remcand (uid UUID, has_history BOOLEAN) ON COMMIT DROP;
  INSERT INTO _remcand (uid, has_history)
  SELECT m.user_id,
         (m.status <> 'pending' OR m.responded_at IS NOT NULL OR m.comment IS NOT NULL)
  FROM public.meeting_attendees m
  LEFT JOIN _desired d ON d.uid = m.user_id
  WHERE m.event_id = _event_id AND d.uid IS NULL;

  SELECT array_agg(uid) INTO v_reqconf
  FROM _remcand
  WHERE has_history
    AND NOT (uid = ANY(coalesce(_confirm_remove, ARRAY[]::UUID[])));

  SELECT array_agg(uid) INTO v_removed
  FROM _remcand
  WHERE (NOT has_history)
     OR (uid = ANY(coalesce(_confirm_remove, ARRAY[]::UUID[])));

  SELECT count(*)::int INTO v_kept
  FROM _desired d
  JOIN public.meeting_attendees m
    ON m.event_id = _event_id AND m.user_id = d.uid;

  IF NOT _dry_run THEN
    INSERT INTO public.meeting_attendees
      (event_id, club_id, user_id, member_id, sources, added_manually, invited_at)
    SELECT _event_id, v_club_id, d.uid,
           (SELECT cm.id FROM public.club_members cm
             WHERE cm.club_id = v_club_id AND cm.user_id = d.uid LIMIT 1),
           d.sources, d.manual, v_now
    FROM _desired d
    WHERE d.uid = ANY(coalesce(v_added, ARRAY[]::UUID[]))
    ON CONFLICT (event_id, user_id) DO NOTHING;

    UPDATE public.meeting_attendees m
    SET sources = d.sources,
        added_manually = d.manual,
        member_id = coalesce(
          m.member_id,
          (SELECT cm.id FROM public.club_members cm
            WHERE cm.club_id = v_club_id AND cm.user_id = d.uid LIMIT 1)
        ),
        updated_at = v_now
    FROM _desired d
    WHERE m.event_id = _event_id AND m.user_id = d.uid;

    DELETE FROM public.meeting_attendees m
    WHERE m.event_id = _event_id
      AND m.user_id = ANY(coalesce(v_removed, ARRAY[]::UUID[]));
  END IF;

  RETURN QUERY SELECT
    coalesce(v_added, ARRAY[]::UUID[]),
    coalesce(v_removed, ARRAY[]::UUID[]),
    coalesce(v_kept, 0),
    coalesce(v_reqconf, ARRAY[]::UUID[]);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_meeting_attendees_atomic(UUID, UUID, JSONB, UUID[], UUID[], BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_meeting_attendees_atomic(UUID, UUID, JSONB, UUID[], UUID[], BOOLEAN) TO authenticated, service_role;