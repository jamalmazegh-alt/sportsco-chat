CREATE OR REPLACE FUNCTION public.publish_event_need_atomic(
  _need_id UUID,
  _actor UUID,
  _audiences JSONB
)
RETURNS TABLE(
  publication_id UUID,
  recipients_count INT,
  recipient_user_ids UUID[],
  was_idempotent_skip BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_status TEXT;
  v_last_pub TIMESTAMPTZ;
  v_pub_id UUID;
  v_rcp_count INT := 0;
  v_now TIMESTAMPTZ := now();
  v_recipient_ids UUID[];
BEGIN
  IF _need_id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'need_id and actor required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _actor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.club_id, n.status, n.last_published_at
    INTO v_club_id, v_status, v_last_pub
  FROM public.event_needs n
  WHERE n.id = _need_id
  FOR UPDATE;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'need_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_club_staff(_actor, v_club_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status NOT IN ('draft','open') THEN
    RAISE EXCEPTION 'need_not_publishable' USING ERRCODE = 'check_violation';
  END IF;

  IF v_last_pub IS NOT NULL AND v_last_pub > (v_now - INTERVAL '15 seconds') THEN
    SELECT p.id INTO v_pub_id
    FROM public.event_need_publications p
    WHERE p.need_id = _need_id
    ORDER BY p.published_at DESC
    LIMIT 1;
    IF v_pub_id IS NOT NULL THEN
      SELECT array_agg(user_id), count(*)::int
        INTO v_recipient_ids, v_rcp_count
      FROM public.event_need_publication_recipients
      WHERE publication_id = v_pub_id;
      RETURN QUERY SELECT v_pub_id, coalesce(v_rcp_count,0), coalesce(v_recipient_ids, ARRAY[]::UUID[]), true, v_status;
      RETURN;
    END IF;
  END IF;

  DELETE FROM public.event_need_audiences WHERE need_id = _need_id;
  IF jsonb_typeof(_audiences) = 'array' AND jsonb_array_length(_audiences) > 0 THEN
    INSERT INTO public.event_need_audiences (
      need_id, audience_type, group_id, team_id, category, created_by
    )
    SELECT
      _need_id,
      (sel->>'type')::text,
      NULLIF(sel->>'group_id','')::uuid,
      NULLIF(sel->>'team_id','')::uuid,
      NULLIF(sel->>'category',''),
      _actor
    FROM jsonb_array_elements(_audiences) AS sel;
  END IF;

  INSERT INTO public.event_need_publications (need_id, published_by, recipients_count)
  VALUES (_need_id, _actor, 0)
  RETURNING id INTO v_pub_id;

  WITH resolved AS (
    SELECT DISTINCT r.user_id
    FROM public.resolve_audience_members(v_club_id, _audiences) r
    WHERE r.user_id IS NOT NULL
  ),
  members AS (
    SELECT cm.id AS member_id, cm.user_id
    FROM public.club_members cm
    JOIN resolved r ON r.user_id = cm.user_id
    WHERE cm.club_id = v_club_id
  ),
  inserted AS (
    INSERT INTO public.event_need_publication_recipients (publication_id, member_id, user_id)
    SELECT v_pub_id, member_id, user_id FROM members
    ON CONFLICT DO NOTHING
    RETURNING user_id
  )
  SELECT array_agg(user_id), count(*)::int
    INTO v_recipient_ids, v_rcp_count
  FROM inserted;

  v_recipient_ids := coalesce(v_recipient_ids, ARRAY[]::UUID[]);
  v_rcp_count := coalesce(v_rcp_count, 0);

  UPDATE public.event_need_publications
     SET recipients_count = v_rcp_count
   WHERE id = v_pub_id;

  UPDATE public.event_needs
     SET status = 'open',
         first_published_at = COALESCE(first_published_at, v_now),
         last_published_at = v_now,
         updated_at = v_now
   WHERE id = _need_id;

  RETURN QUERY SELECT v_pub_id, v_rcp_count, v_recipient_ids, false, 'open'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_event_need_atomic(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_event_need_atomic(UUID, UUID, JSONB) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.decide_signup_atomic(
  _signup_id UUID,
  _actor UUID,
  _decision TEXT
)
RETURNS TABLE(
  signup_id UUID,
  need_id UUID,
  event_id UUID,
  applicant_user_id UUID,
  new_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_need_id UUID;
  v_event_id UUID;
  v_club_id UUID;
  v_capacity INT;
  v_need_status TEXT;
  v_current_status TEXT;
  v_applicant UUID;
  v_confirmed_count INT;
  v_new_status TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF _signup_id IS NULL OR _actor IS NULL OR _decision NOT IN ('confirm','decline') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _actor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.need_id, s.user_id, s.status
    INTO v_need_id, v_applicant, v_current_status
  FROM public.event_need_signups s
  WHERE s.id = _signup_id;

  IF v_need_id IS NULL THEN
    RAISE EXCEPTION 'signup_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT n.club_id, n.event_id, n.capacity, n.status
    INTO v_club_id, v_event_id, v_capacity, v_need_status
  FROM public.event_needs n
  WHERE n.id = v_need_id
  FOR UPDATE;

  IF NOT public.is_club_staff(_actor, v_club_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _decision = 'confirm' THEN
    IF v_need_status <> 'open' THEN
      RAISE EXCEPTION 'need_not_open' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO v_confirmed_count
    FROM public.event_need_signups
    WHERE need_id = v_need_id AND status = 'confirmed' AND id <> _signup_id;
    IF v_confirmed_count >= v_capacity THEN
      RAISE EXCEPTION 'capacity_reached' USING ERRCODE = 'check_violation';
    END IF;
    v_new_status := 'confirmed';
    UPDATE public.event_need_signups
       SET status = 'confirmed',
           confirmed_at = v_now,
           decided_by = _actor,
           declined_at = NULL,
           updated_at = v_now
     WHERE id = _signup_id;
  ELSE
    v_new_status := 'declined';
    UPDATE public.event_need_signups
       SET status = 'declined',
           declined_at = v_now,
           decided_by = _actor,
           confirmed_at = NULL,
           updated_at = v_now
     WHERE id = _signup_id;
  END IF;

  RETURN QUERY SELECT _signup_id, v_need_id, v_event_id, v_applicant, v_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_signup_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_signup_atomic(UUID, UUID, TEXT) TO authenticated, service_role;