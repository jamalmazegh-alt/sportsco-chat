-- =====================================================================
-- LOT 1 — Correctifs pré-server-fns
-- 1) Helper visibilité destinataire + policy corrigée
-- 2) Contraintes par type sur event_need_audiences
-- 3) Message explicite du trigger event↔club
-- Note : les types 'club_admins' et 'club_tournament_managers' sont déjà
--        pris en charge par resolve_audience_members depuis la migration
--        20260718112716 — pas de correction nécessaire ici.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. user_is_need_recipient — SECURITY DEFINER avec garde interne.
--    Motif : la sous-requête d'une policy s'évalue avec les droits du
--    lecteur ; or event_need_publication_recipients est staff-only.
--    Un membre destinataire lisait donc 0 ligne et ne voyait jamais
--    aucun besoin. Ce helper bypass la RLS via SECURITY DEFINER, avec
--    la garde interne (self/staff/service_role) et un refus silencieux.
--    Distinct de can_apply_to_event_need : ce dernier exige status='open'
--    (candidature), la visibilité doit couvrir aussi les besoins fermés
--    et annulés pour l'écran « Mes coups de main ».
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_need_recipient(_need_id UUID, _user_id UUID)
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

  -- Garde d'appelant : soi-même, staff du club, ou service_role.
  -- Refus SILENCIEUX (false, pas exception) pour éviter tout oracle.
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), v_club_id))
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.event_need_publication_recipients r
    JOIN public.event_need_publications p ON p.id = r.publication_id
    WHERE p.need_id = _need_id AND r.user_id = _user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_is_need_recipient(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_need_recipient(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_is_need_recipient(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Policy corrigée : lecture destinataire via le helper SECURITY DEFINER.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "event_needs_recipient_read" ON public.event_needs;

CREATE POLICY "event_needs_recipient_read"
  ON public.event_needs FOR SELECT TO authenticated
  USING (
    status <> 'draft'
    AND (
      EXISTS (
        SELECT 1 FROM public.event_need_signups s
        WHERE s.need_id = event_needs.id AND s.user_id = auth.uid()
      )
      OR public.user_is_need_recipient(event_needs.id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 2. Contraintes par type sur event_need_audiences.
--    Miroir de club_group_rules_params_chk : un type qui n'attend pas
--    de paramètre ne doit pas en porter, et les types qui en attendent
--    doivent le renseigner. Empêche une audience résolue à 0 en silence.
-- ---------------------------------------------------------------------
ALTER TABLE public.event_need_audiences
  DROP CONSTRAINT IF EXISTS event_need_audiences_params_chk;

ALTER TABLE public.event_need_audiences
  ADD CONSTRAINT event_need_audiences_params_chk CHECK (
    -- club_group : group_id requis, autres NULL
    (audience_type = 'club_group'
      AND group_id IS NOT NULL AND team_id IS NULL AND category IS NULL)
    -- team_* : team_id requis, autres NULL
    OR (audience_type IN ('team_players','team_parents','team_educators')
      AND team_id IS NOT NULL AND group_id IS NULL AND category IS NULL)
    -- category_educators : category requise, autres NULL
    OR (audience_type = 'category_educators'
      AND category IS NOT NULL AND team_id IS NULL AND group_id IS NULL)
    -- club_* / convoked_* : aucun paramètre
    OR (audience_type IN (
          'club_educators','club_staff','club_admins',
          'club_tournament_managers','club_members',
          'convoked_players','convoked_parents')
      AND group_id IS NULL AND team_id IS NULL AND category IS NULL)
  );

-- ---------------------------------------------------------------------
-- 3. Trigger event↔club : message explicite + décision documentée.
--    Décision produit : un besoin nécessite un événement rattaché à une
--    équipe (donc à un club), car events n'a pas de club_id direct.
--    Les événements sans équipe (réunion club, AG) ne peuvent porter
--    aucun besoin — c'est un choix, pas un bug.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_needs_check_event_club()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_club_id UUID;
BEGIN
  SELECT e.team_id INTO v_team_id
  FROM public.events e
  WHERE e.id = NEW.event_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'event_needs require a team-linked event (event % has no team; club-level events cannot carry needs)',
      NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.club_id INTO v_club_id
  FROM public.teams t
  WHERE t.id = v_team_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'event_needs: team % has no club_id', v_team_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_club_id <> NEW.club_id THEN
    RAISE EXCEPTION 'event_needs.club_id mismatch (event=%, team_club=%, provided=%)',
      NEW.event_id, v_club_id, NEW.club_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.event_needs_check_event_club() IS
  'Enforces that event_needs are attached to a team-linked event. Club-level events (no team_id) cannot carry needs — deliberate product decision.';
