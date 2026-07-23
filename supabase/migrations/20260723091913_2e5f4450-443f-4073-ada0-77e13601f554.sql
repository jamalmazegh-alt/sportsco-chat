
ALTER TABLE public.meeting_attendees
  ADD COLUMN IF NOT EXISTS response_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS meeting_attendees_response_token_key
  ON public.meeting_attendees(response_token);

CREATE OR REPLACE FUNCTION public.get_meeting_response_by_token(_token uuid)
RETURNS TABLE(event_id uuid, meeting_title text, starts_at timestamptz, location text, status public.attendance_status, responded_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ma.event_id, e.title, e.starts_at, e.location, ma.status, ma.responded_at
  FROM public.meeting_attendees ma
  JOIN public.events e ON e.id = ma.event_id
  WHERE ma.response_token = _token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.respond_meeting_via_token(_token uuid, _status public.attendance_status)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF _status NOT IN ('present','absent','uncertain') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.meeting_attendees
    SET status = _status, responded_at = now(), updated_at = now()
    WHERE response_token = _token
    RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_meeting_response_by_token(uuid) FROM public;
REVOKE ALL ON FUNCTION public.respond_meeting_via_token(uuid, public.attendance_status) FROM public;
GRANT EXECUTE ON FUNCTION public.get_meeting_response_by_token(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_meeting_via_token(uuid, public.attendance_status) TO anon, authenticated, service_role;
