CREATE OR REPLACE FUNCTION public.respond_via_token(
  _token text,
  _status public.attendance_status,
  _comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.convocations%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_status_label text;
  v_is_change boolean;
BEGIN
  SELECT * INTO v_conv FROM public.convocations WHERE response_token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_conv.event_id;
  IF v_event.responses_locked THEN
    RAISE EXCEPTION 'Responses are locked';
  END IF;

  v_is_change := (v_conv.status IS DISTINCT FROM 'pending'::public.attendance_status)
                 AND v_conv.responded_at IS NOT NULL;

  UPDATE public.convocations
  SET status = _status,
      comment = NULLIF(_comment, ''),
      responded_at = now()
  WHERE id = v_conv.id;

  v_status_label := CASE _status
    WHEN 'present' THEN 'présent'
    WHEN 'absent' THEN 'absent'
    WHEN 'uncertain' THEN 'incertain'
    WHEN 'pending' THEN 'en attente'
    ELSE _status::text
  END;

  IF _status IN ('absent', 'uncertain') THEN
    SELECT * INTO v_player FROM public.players WHERE id = v_conv.player_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT DISTINCT tm.user_id,
                    'convocation_response',
                    v_event.title,
                    coalesce(v_player.first_name, '') || ' ' || coalesce(v_player.last_name, '')
                      || ' — ' || v_status_label
                      || CASE WHEN v_is_change THEN ' (réponse modifiée)' ELSE '' END,
                    '/events/' || v_event.id::text
    FROM public.team_members tm
    WHERE tm.team_id = v_event.team_id
      AND tm.role IN ('coach', 'admin')
      AND tm.user_id IS NOT NULL;
  END IF;

  RETURN v_conv.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_via_token(text, public.attendance_status, text) TO anon, authenticated;