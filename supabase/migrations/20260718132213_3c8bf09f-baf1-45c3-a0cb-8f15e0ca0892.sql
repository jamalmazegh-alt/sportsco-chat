
-- =====================================================================
-- LOT 1 — Correctif bloquant #3 : récursion 42P17
-- event_needs.recipient_read -> event_need_signups.staff_all -> event_needs
-- Solution : deux helpers SECURITY DEFINER, un de chaque côté du cycle.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper A : user_has_signup_on_need
-- Sert la branche "signup" de event_needs_recipient_read en bypassant
-- la RLS de event_need_signups (qui elle-même référence event_needs).
-- Garde : self / staff / service_role. Refus silencieux.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_signup_on_need(_need_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  IF _need_id IS NULL OR _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT n.club_id INTO v_club_id
  FROM public.event_needs n
  WHERE n.id = _need_id;

  IF v_club_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), v_club_id))
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.event_need_signups s
    WHERE s.need_id = _need_id AND s.user_id = _user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_signup_on_need(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_signup_on_need(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_signup_on_need(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helper B : staff_owns_need_signup
-- Sert la policy staff de event_need_signups en bypassant la RLS de
-- event_needs. Le helper EST le check staff : sa garde n'est donc pas
-- "self-or-staff" (ce serait un oracle) mais "on ne répond que sur
-- soi-même ou service_role". Refus silencieux.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_owns_need_signup(_need_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  IF _need_id IS NULL OR _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Garde : on ne répond QUE sur l'appelant lui-même (ou service_role).
  -- Pas d'oracle "X est-il staff du club de ce besoin ?" pour un X arbitraire.
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
  ) THEN
    RETURN false;
  END IF;

  SELECT n.club_id INTO v_club_id
  FROM public.event_needs n
  WHERE n.id = _need_id;

  IF v_club_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_club_staff(_user_id, v_club_id);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_owns_need_signup(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.staff_owns_need_signup(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_owns_need_signup(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Rebranche event_needs.recipient_read : branche signup via helper A.
-- Le helper "user_is_need_recipient" couvre déjà la branche destinataire.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "event_needs_recipient_read" ON public.event_needs;

CREATE POLICY "event_needs_recipient_read"
  ON public.event_needs FOR SELECT TO authenticated
  USING (
    status <> 'draft'
    AND (
      public.user_has_signup_on_need(event_needs.id, auth.uid())
      OR public.user_is_need_recipient(event_needs.id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- Rebranche event_need_signups.staff_all via helper B.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "event_need_signups_staff_all" ON public.event_need_signups;

CREATE POLICY "event_need_signups_staff_all"
  ON public.event_need_signups FOR ALL TO authenticated
  USING (public.staff_owns_need_signup(event_need_signups.need_id, auth.uid()))
  WITH CHECK (public.staff_owns_need_signup(event_need_signups.need_id, auth.uid()));
