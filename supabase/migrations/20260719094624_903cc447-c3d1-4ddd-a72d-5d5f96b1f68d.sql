-- Correctif apply_to_event_need_atomic : players.is_minor n'existe pas (colonne réelle: birth_date).
-- Utilise le helper canonique public.player_is_minor(_player_id) déjà présent (mig 20260514175700).
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
  v_can BOOLEAN;
  v_capacity INT;
  v_mode TEXT;
  v_club_id UUID;
  v_team_id UUID;
  v_now TIMESTAMPTZ := now();
  v_confirmed_count INT;
  v_is_minor BOOLEAN := false;
  v_new_status TEXT;
  v_signup_id UUID;
  v_member_id UUID;
  v_auto_confirmed BOOLEAN := false;
BEGIN
  IF _need_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.capacity, n.validation_mode, n.club_id, n.team_id
    INTO v_capacity, v_mode, v_club_id, v_team_id
  FROM public.event_needs n
  WHERE n.id = _need_id AND n.status = 'open'
  FOR UPDATE;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'need_not_open' USING ERRCODE = 'check_violation';
  END IF;

  SELECT public.can_apply_to_event_need(_need_id, _user_id) INTO v_can;
  IF NOT v_can THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT cm.id INTO v_member_id
  FROM public.club_members cm
  WHERE cm.club_id = v_club_id AND cm.user_id = _user_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'user_not_in_club' USING ERRCODE = 'check_violation';
  END IF;

  -- Utilise le helper canonique player_is_minor(_player_id) (calcule via birth_date).
  SELECT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.user_id = _user_id
      AND p.club_id = v_club_id
      AND public.player_is_minor(p.id) = true
  ) INTO v_is_minor;

  IF v_mode = 'auto' AND NOT v_is_minor THEN
    SELECT count(*) INTO v_confirmed_count
    FROM public.event_need_signups s
    WHERE s.need_id = _need_id AND s.status = 'confirmed';
    IF v_confirmed_count < v_capacity THEN
      v_new_status := 'confirmed';
      v_auto_confirmed := true;
    ELSE
      v_new_status := 'applied';
    END IF;
  ELSE
    v_new_status := 'applied';
  END IF;

  INSERT INTO public.event_need_signups AS s (
    need_id, member_id, user_id, status, applied_at, confirmed_at, comment
  ) VALUES (
    _need_id, v_member_id, _user_id, v_new_status, v_now,
    CASE WHEN v_new_status = 'confirmed' THEN v_now ELSE NULL END,
    _comment
  )
  ON CONFLICT (need_id, member_id) DO UPDATE
    SET status = EXCLUDED.status,
        applied_at = COALESCE(s.applied_at, EXCLUDED.applied_at),
        confirmed_at = CASE
          WHEN EXCLUDED.status = 'confirmed' THEN COALESCE(s.confirmed_at, EXCLUDED.confirmed_at)
          ELSE s.confirmed_at
        END,
        comment = COALESCE(EXCLUDED.comment, s.comment),
        user_id = EXCLUDED.user_id
  RETURNING s.id INTO v_signup_id;

  RETURN QUERY SELECT v_signup_id, v_new_status, v_auto_confirmed, v_is_minor;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_event_need_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_to_event_need_atomic(UUID, UUID, TEXT) TO authenticated, service_role;