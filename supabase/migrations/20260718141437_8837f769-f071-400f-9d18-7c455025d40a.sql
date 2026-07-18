CREATE OR REPLACE FUNCTION public.apply_to_event_need_atomic(
  _need_id UUID,
  _user_id UUID,
  _comment TEXT DEFAULT NULL
)
RETURNS TABLE(
  signup_id UUID,
  status TEXT,
  auto_confirmed BOOLEAN,
  is_minor BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_club_id UUID;
  v_status TEXT;
  v_capacity INT;
  v_mode TEXT;
  v_confirmed_count INT;
  v_member_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_birth DATE;
  v_is_minor BOOLEAN := false;
  v_new_status TEXT;
  v_signup_id UUID;
BEGIN
  IF _need_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'need_id and user_id required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.club_id, n.status, n.capacity, n.validation_mode
    INTO v_club_id, v_status, v_capacity, v_mode
  FROM public.event_needs n
  WHERE n.id = _need_id
  FOR UPDATE;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'need_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'need_not_open' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.can_apply_to_event_need(_need_id, _user_id) THEN
    RAISE EXCEPTION 'not_eligible' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT cm.id INTO v_member_id
  FROM public.club_members cm
  WHERE cm.club_id = v_club_id AND cm.user_id = _user_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'not_club_member' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.birth_date INTO v_birth FROM public.profiles p WHERE p.id = _user_id;
  IF v_birth IS NOT NULL THEN
    v_is_minor := (v_birth > (CURRENT_DATE - INTERVAL '18 years'));
  END IF;

  SELECT s.id, s.status INTO v_existing_id, v_existing_status
  FROM public.event_need_signups s
  WHERE s.need_id = _need_id AND s.member_id = v_member_id;

  IF v_mode = 'auto' AND NOT v_is_minor THEN
    SELECT count(*) INTO v_confirmed_count
    FROM public.event_need_signups s
    WHERE s.need_id = _need_id AND s.status = 'confirmed';
    IF v_confirmed_count < v_capacity THEN
      v_new_status := 'confirmed';
    ELSE
      v_new_status := 'applied';
    END IF;
  ELSE
    v_new_status := 'applied';
  END IF;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.event_need_signups (
      need_id, member_id, user_id, status, comment, confirmed_at
    ) VALUES (
      _need_id, v_member_id, _user_id, v_new_status, _comment,
      CASE WHEN v_new_status = 'confirmed' THEN now() ELSE NULL END
    ) RETURNING id INTO v_signup_id;
  ELSE
    UPDATE public.event_need_signups
       SET status = v_new_status,
           comment = COALESCE(_comment, comment),
           applied_at = now(),
           confirmed_at = CASE WHEN v_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
           withdrawn_at = NULL,
           declined_at = NULL,
           updated_at = now()
     WHERE id = v_existing_id
     RETURNING id INTO v_signup_id;
  END IF;

  RETURN QUERY SELECT v_signup_id, v_new_status, (v_new_status = 'confirmed'), v_is_minor;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_event_need_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_to_event_need_atomic(UUID, UUID, TEXT) TO authenticated, service_role;