-- LOT 3 Phase 1 : équipe technique interne par club (héberge les réunions).
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS teams_one_internal_per_club
  ON public.teams(club_id) WHERE is_internal;

CREATE OR REPLACE FUNCTION public.get_or_create_internal_team(_club_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'club_id required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR public.is_club_staff(auth.uid(), _club_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_id FROM public.teams
   WHERE club_id = _club_id AND is_internal LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.teams (club_id, name, is_internal)
  VALUES (_club_id, 'Réunions internes', true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.teams
     WHERE club_id = _club_id AND is_internal LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_internal_team(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_internal_team(UUID) TO authenticated, service_role;
