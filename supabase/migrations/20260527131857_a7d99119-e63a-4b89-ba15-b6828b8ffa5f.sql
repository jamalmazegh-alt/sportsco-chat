
-- RPC: convert a personal (free organizer) club into a real club
CREATE OR REPLACE FUNCTION public.convert_personal_club_to_real(_club_id uuid, _new_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_personal boolean;
  v_name text;
BEGIN
  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'club_id required';
  END IF;

  -- Must be admin of that club
  IF NOT public.has_club_role(auth.uid(), _club_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT is_personal, name INTO v_is_personal, v_name
  FROM public.clubs WHERE id = _club_id;

  IF v_is_personal IS NULL THEN
    RAISE EXCEPTION 'club not found';
  END IF;
  IF v_is_personal = false THEN
    RETURN _club_id; -- already a real club, no-op
  END IF;

  UPDATE public.clubs
  SET is_personal = false,
      name = COALESCE(NULLIF(trim(_new_name), ''), v_name)
  WHERE id = _club_id;

  RETURN _club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_personal_club_to_real(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.convert_personal_club_to_real(uuid, text) TO authenticated;
