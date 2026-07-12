-- Compteurs de capacité d'un stage (socle : approved + under_review non expiré = places prises).
CREATE OR REPLACE FUNCTION public.get_camp_registration_stats(_camp_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity int;
  v_approved int;
  v_reserved int;
  v_pending int;
  v_waitlist int;
  v_expired int;
BEGIN
  SELECT capacity INTO v_capacity FROM public.club_camps WHERE id = _camp_id;
  IF v_capacity IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*) FILTER (WHERE registration_status = 'approved'),
    count(*) FILTER (WHERE registration_status = 'under_review'
                     AND (reserved_until IS NULL OR reserved_until > now())),
    count(*) FILTER (WHERE registration_status = 'pending'),
    count(*) FILTER (WHERE registration_status = 'waitlist'),
    count(*) FILTER (WHERE registration_status = 'under_review'
                     AND reserved_until IS NOT NULL AND reserved_until <= now())
  INTO v_approved, v_reserved, v_pending, v_waitlist, v_expired
  FROM public.club_camp_registrations
  WHERE camp_id = _camp_id;

  RETURN jsonb_build_object(
    'capacity', v_capacity,
    'approved', COALESCE(v_approved, 0),
    'reserved', COALESCE(v_reserved, 0),
    'pending', COALESCE(v_pending, 0),
    'waitlist', COALESCE(v_waitlist, 0),
    'expired_reservations', COALESCE(v_expired, 0),
    'remaining', GREATEST(v_capacity - COALESCE(v_approved, 0) - COALESCE(v_reserved, 0), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_camp_registration_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_camp_registration_stats(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_club_camp_registrations_camp_status
  ON public.club_camp_registrations (camp_id, registration_status);