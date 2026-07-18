-- =====================================================================
-- LOT 1 — Migration 2 : recompute_event_need_coverage
-- Retourne un TABLE avec (is_fully_covered, did_transition) pour piloter
-- les notifications de transition depuis les server fns.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recompute_event_need_coverage(_event_id UUID)
RETURNS TABLE(is_fully_covered BOOLEAN, did_transition BOOLEAN, open_needs_count INT, missing_seats INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_previous BOOLEAN;
  v_had_row BOOLEAN;
  v_open_count INT;
  v_missing INT;
  v_covered BOOLEAN;
BEGIN
  IF _event_id IS NULL THEN
    RETURN;
  END IF;

  -- Résolution du club via events.team_id -> teams.club_id
  SELECT t.club_id INTO v_club_id
  FROM public.events e
  LEFT JOIN public.teams t ON t.id = e.team_id
  WHERE e.id = _event_id;

  IF v_club_id IS NULL THEN
    RETURN;
  END IF;

  -- Garde d'appelant interne : staff du club ou service_role. Refus silencieux.
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), v_club_id))
  ) THEN
    RETURN;
  END IF;

  -- Compteurs bruts
  SELECT
    count(*) FILTER (WHERE n.status = 'open'),
    coalesce(sum(
      CASE WHEN n.status = 'open'
        THEN GREATEST(n.capacity - (
          SELECT count(*) FROM public.event_need_signups s
          WHERE s.need_id = n.id AND s.status = 'confirmed'
        ), 0)
        ELSE 0
      END
    ), 0)::INT
  INTO v_open_count, v_missing
  FROM public.event_needs n
  WHERE n.event_id = _event_id
    AND n.status IN ('open','closed','cancelled');

  -- Couverture : au moins un besoin open ET tous les sièges sont pourvus
  v_covered := (v_open_count > 0 AND v_missing = 0);

  -- État précédent
  SELECT c.is_fully_covered, true INTO v_previous, v_had_row
  FROM public.event_need_coverage c
  WHERE c.event_id = _event_id;

  IF NOT FOUND THEN
    v_previous := false;
    v_had_row := false;
  END IF;

  INSERT INTO public.event_need_coverage (event_id, club_id, is_fully_covered, open_needs_count, missing_seats, updated_at)
  VALUES (_event_id, v_club_id, v_covered, v_open_count, v_missing, now())
  ON CONFLICT (event_id) DO UPDATE
    SET is_fully_covered = EXCLUDED.is_fully_covered,
        open_needs_count = EXCLUDED.open_needs_count,
        missing_seats    = EXCLUDED.missing_seats,
        updated_at       = now();

  RETURN QUERY SELECT
    v_covered,
    (v_had_row AND v_previous <> v_covered) OR (NOT v_had_row AND v_covered),
    v_open_count,
    v_missing;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_event_need_coverage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_event_need_coverage(UUID) TO authenticated, service_role;