-- 1) Token column
ALTER TABLE public.convocations
  ADD COLUMN IF NOT EXISTS response_token text UNIQUE;

-- Backfill existing rows with random tokens
UPDATE public.convocations
SET response_token = encode(gen_random_bytes(24), 'hex')
WHERE response_token IS NULL;

-- Default for future rows
ALTER TABLE public.convocations
  ALTER COLUMN response_token SET DEFAULT encode(gen_random_bytes(24), 'hex');

ALTER TABLE public.convocations
  ALTER COLUMN response_token SET NOT NULL;

-- 2) Public RPC: read convocation by token (no auth required)
CREATE OR REPLACE FUNCTION public.get_convocation_by_token(_token text)
RETURNS TABLE (
  convocation_id uuid,
  status public.attendance_status,
  comment text,
  responded_at timestamptz,
  event_id uuid,
  event_title text,
  event_type text,
  event_starts_at timestamptz,
  event_location text,
  event_opponent text,
  player_first_name text,
  player_last_name text,
  team_name text,
  club_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.status,
    c.comment,
    c.responded_at,
    e.id,
    e.title,
    e.type::text,
    e.starts_at,
    e.location,
    e.opponent,
    p.first_name,
    p.last_name,
    t.name,
    cl.name
  FROM public.convocations c
  JOIN public.events e ON e.id = c.event_id
  JOIN public.teams t ON t.id = e.team_id
  JOIN public.clubs cl ON cl.id = t.club_id
  JOIN public.players p ON p.id = c.player_id
  WHERE c.response_token = _token
  LIMIT 1;
$$;

-- 3) Public RPC: respond by token (no auth required)
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
BEGIN
  SELECT * INTO v_conv FROM public.convocations WHERE response_token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  -- Refuse if responses are locked at the event level
  SELECT * INTO v_event FROM public.events WHERE id = v_conv.event_id;
  IF v_event.responses_locked THEN
    RAISE EXCEPTION 'Responses are locked';
  END IF;

  UPDATE public.convocations
  SET status = _status,
      comment = NULLIF(_comment, ''),
      responded_at = now()
  WHERE id = v_conv.id;

  -- Notify coaches in-app for non-positive responses
  IF _status IN ('absent', 'uncertain') THEN
    SELECT * INTO v_player FROM public.players WHERE id = v_conv.player_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT DISTINCT tm.user_id,
                    'convocation_response',
                    v_event.title,
                    coalesce(v_player.first_name, '') || ' ' || coalesce(v_player.last_name, '') || ' — ' || _status::text,
                    '/events/' || v_event.id::text
    FROM public.team_members tm
    WHERE tm.team_id = v_event.team_id
      AND tm.role IN ('coach', 'admin')
      AND tm.user_id IS NOT NULL;
  END IF;

  RETURN v_conv.id;
END;
$$;

-- Grant execute to anon + authenticated
GRANT EXECUTE ON FUNCTION public.get_convocation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_via_token(text, public.attendance_status, text) TO anon, authenticated;