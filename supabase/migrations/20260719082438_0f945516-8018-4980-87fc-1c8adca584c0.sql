
-- 1) Elargir le CHECK status pour inclure 'unavailable'
ALTER TABLE public.event_need_signups
  DROP CONSTRAINT IF EXISTS event_need_signups_status_check;
ALTER TABLE public.event_need_signups
  ADD CONSTRAINT event_need_signups_status_check
  CHECK (status IN ('applied','confirmed','withdrawn','declined','unavailable'));

-- 2) Republier / publier : exclure les users ayant un signup 'unavailable'
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
#variable_conflict use_column
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
      SELECT array_agg(r.user_id), count(*)::int
        INTO v_recipient_ids, v_rcp_count
      FROM public.event_need_publication_recipients r
      WHERE r.publication_id = v_pub_id;
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
      -- Exclut les personnes qui se sont déclarées indisponibles pour ce besoin
      AND NOT EXISTS (
        SELECT 1 FROM public.event_need_signups s
        WHERE s.need_id = _need_id
          AND s.user_id = r.user_id
          AND s.status = 'unavailable'
      )
  ),
  members AS (
    SELECT cm.id AS member_id, cm.user_id
    FROM public.club_members cm
    JOIN resolved r ON r.user_id = cm.user_id
    WHERE cm.club_id = v_club_id
  ),
  inserted AS (
    INSERT INTO public.event_need_publication_recipients (publication_id, member_id, user_id)
    SELECT v_pub_id, m.member_id, m.user_id FROM members m
    ON CONFLICT DO NOTHING
    RETURNING user_id
  )
  SELECT array_agg(i.user_id), count(*)::int
    INTO v_recipient_ids, v_rcp_count
  FROM inserted i;

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

-- 3) Déclarer indisponible (owner-only)
CREATE OR REPLACE FUNCTION public.declare_unavailable_atomic(
  _need_id UUID,
  _user_id UUID
)
RETURNS TABLE(signup_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_club_id UUID;
  v_need_status TEXT;
  v_member_id UUID;
  v_signup_id UUID;
  v_current_status TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF _need_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Garde d'appelant interne : uniquement service_role ou soi-même
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.club_id, n.status
    INTO v_club_id, v_need_status
  FROM public.event_needs n
  WHERE n.id = _need_id
  FOR UPDATE;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'need_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_need_status <> 'open' THEN
    RAISE EXCEPTION 'need_not_open' USING ERRCODE = 'check_violation';
  END IF;

  -- Interdit si une candidature active existe (applied/confirmed)
  SELECT s.id, s.status INTO v_signup_id, v_current_status
  FROM public.event_need_signups s
  WHERE s.need_id = _need_id AND s.user_id = _user_id;

  IF v_current_status IN ('applied','confirmed') THEN
    RAISE EXCEPTION 'active_signup_exists' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cm.id INTO v_member_id
  FROM public.club_members cm
  WHERE cm.club_id = v_club_id AND cm.user_id = _user_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'user_not_in_club' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.event_need_signups (
    need_id, member_id, user_id, status, applied_at
  ) VALUES (
    _need_id, v_member_id, _user_id, 'unavailable', v_now
  )
  ON CONFLICT (need_id, member_id) DO UPDATE
    SET status = 'unavailable',
        applied_at = v_now,
        confirmed_at = NULL,
        withdrawn_at = NULL,
        declined_at = NULL,
        comment = NULL,
        updated_at = v_now
  RETURNING id INTO v_signup_id;

  RETURN QUERY SELECT v_signup_id, 'unavailable'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.declare_unavailable_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.declare_unavailable_atomic(UUID, UUID) TO authenticated, service_role;

-- 4) Édition d'un besoin sous verrou avec garde de capacité
CREATE OR REPLACE FUNCTION public.update_event_need_atomic(
  _need_id UUID,
  _actor UUID,
  _label TEXT,
  _description TEXT,
  _capacity INT,
  _validation_mode TEXT,
  _has_description BOOLEAN
)
RETURNS TABLE(
  id UUID,
  event_id UUID,
  club_id UUID,
  status TEXT,
  capacity INT,
  validation_mode TEXT,
  label TEXT,
  role_key TEXT,
  description TEXT,
  capacity_changed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_club_id UUID;
  v_event_id UUID;
  v_status TEXT;
  v_old_capacity INT;
  v_confirmed_count INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF _need_id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _actor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.club_id, n.event_id, n.status, n.capacity
    INTO v_club_id, v_event_id, v_status, v_old_capacity
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
    RAISE EXCEPTION 'need_not_editable' USING ERRCODE = 'check_violation';
  END IF;

  IF _capacity IS NOT NULL AND _capacity < v_old_capacity THEN
    SELECT count(*) INTO v_confirmed_count
    FROM public.event_need_signups s
    WHERE s.need_id = _need_id AND s.status = 'confirmed';
    IF _capacity < v_confirmed_count THEN
      RAISE EXCEPTION 'capacity_below_confirmed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.event_needs n
     SET label = COALESCE(_label, n.label),
         description = CASE WHEN _has_description THEN _description ELSE n.description END,
         capacity = COALESCE(_capacity, n.capacity),
         validation_mode = COALESCE(_validation_mode, n.validation_mode),
         updated_at = v_now
   WHERE n.id = _need_id;

  RETURN QUERY
    SELECT n.id, n.event_id, n.club_id, n.status, n.capacity, n.validation_mode,
           n.label, n.role_key, n.description,
           (_capacity IS NOT NULL AND _capacity <> v_old_capacity) AS capacity_changed
    FROM public.event_needs n
    WHERE n.id = _need_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_event_need_atomic(UUID, UUID, TEXT, TEXT, INT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_event_need_atomic(UUID, UUID, TEXT, TEXT, INT, TEXT, BOOLEAN) TO authenticated, service_role;

-- 5) Suppression stricte d'un besoin brouillon
CREATE OR REPLACE FUNCTION public.delete_event_need_draft(
  _need_id UUID,
  _actor UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_status TEXT;
  v_pub_count INT;
  v_signup_count INT;
BEGIN
  IF _need_id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _actor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.club_id, n.status INTO v_club_id, v_status
  FROM public.event_needs n
  WHERE n.id = _need_id
  FOR UPDATE;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'need_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_club_staff(_actor, v_club_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'need_not_draft' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_pub_count
  FROM public.event_need_publications p WHERE p.need_id = _need_id;
  IF v_pub_count > 0 THEN
    RAISE EXCEPTION 'need_has_publications' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_signup_count
  FROM public.event_need_signups s WHERE s.need_id = _need_id;
  IF v_signup_count > 0 THEN
    RAISE EXCEPTION 'need_has_signups' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.event_needs WHERE id = _need_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_event_need_draft(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_event_need_draft(UUID, UUID) TO authenticated, service_role;
