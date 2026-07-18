-- =====================================================================
-- LOT 1 — Besoins événementiels « Coups de main »
-- Phase A / Migration 1 : schéma + RLS + garde interne.
-- =====================================================================

-- 1. event_needs -------------------------------------------------------
CREATE TABLE public.event_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  role_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  capacity INT NOT NULL CHECK (capacity >= 1),
  validation_mode TEXT NOT NULL CHECK (validation_mode IN ('auto','manual')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_published_at TIMESTAMPTZ,
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_needs_event ON public.event_needs(event_id);
CREATE INDEX idx_event_needs_club ON public.event_needs(club_id);
CREATE INDEX idx_event_needs_status ON public.event_needs(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_needs TO authenticated;
GRANT ALL ON public.event_needs TO service_role;
ALTER TABLE public.event_needs ENABLE ROW LEVEL SECURITY;

-- 2. event_need_audiences ---------------------------------------------
CREATE TABLE public.event_need_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES public.event_needs(id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL CHECK (audience_type IN (
    'team_players','team_parents','team_educators',
    'category_educators','club_educators','club_staff',
    'club_admins','club_tournament_managers','club_members',
    'convoked_players','convoked_parents','club_group'
  )),
  group_id UUID REFERENCES public.club_groups(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  category TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_need_audiences_need ON public.event_need_audiences(need_id);
CREATE INDEX idx_event_need_audiences_group ON public.event_need_audiences(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_need_audiences TO authenticated;
GRANT ALL ON public.event_need_audiences TO service_role;
ALTER TABLE public.event_need_audiences ENABLE ROW LEVEL SECURITY;

-- 3. event_need_audience_members --------------------------------------
CREATE TABLE public.event_need_audience_members (
  need_id UUID NOT NULL REFERENCES public.event_needs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (need_id, member_id)
);
CREATE INDEX idx_event_need_audience_members_member ON public.event_need_audience_members(member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_need_audience_members TO authenticated;
GRANT ALL ON public.event_need_audience_members TO service_role;
ALTER TABLE public.event_need_audience_members ENABLE ROW LEVEL SECURITY;

-- 4. event_need_publications ------------------------------------------
CREATE TABLE public.event_need_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES public.event_needs(id) ON DELETE CASCADE,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients_count INT NOT NULL DEFAULT 0 CHECK (recipients_count >= 0)
);
CREATE INDEX idx_event_need_publications_need ON public.event_need_publications(need_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_need_publications TO authenticated;
GRANT ALL ON public.event_need_publications TO service_role;
ALTER TABLE public.event_need_publications ENABLE ROW LEVEL SECURITY;

-- 5. event_need_publication_recipients --------------------------------
CREATE TABLE public.event_need_publication_recipients (
  publication_id UUID NOT NULL REFERENCES public.event_need_publications(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (publication_id, member_id)
);
CREATE INDEX idx_event_need_pub_recipients_member ON public.event_need_publication_recipients(member_id);
CREATE INDEX idx_event_need_pub_recipients_user ON public.event_need_publication_recipients(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_need_publication_recipients TO authenticated;
GRANT ALL ON public.event_need_publication_recipients TO service_role;
ALTER TABLE public.event_need_publication_recipients ENABLE ROW LEVEL SECURITY;

-- 6. event_need_signups -----------------------------------------------
CREATE TABLE public.event_need_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES public.event_needs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','confirmed','withdrawn','declined')),
  comment TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (need_id, member_id)
);
CREATE INDEX idx_event_need_signups_need ON public.event_need_signups(need_id);
CREATE INDEX idx_event_need_signups_member ON public.event_need_signups(member_id);
CREATE INDEX idx_event_need_signups_user ON public.event_need_signups(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_need_signups TO authenticated;
GRANT ALL ON public.event_need_signups TO service_role;
ALTER TABLE public.event_need_signups ENABLE ROW LEVEL SECURITY;

-- 7. event_need_coverage ----------------------------------------------
CREATE TABLE public.event_need_coverage (
  event_id UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  is_fully_covered BOOLEAN NOT NULL DEFAULT false,
  open_needs_count INT NOT NULL DEFAULT 0 CHECK (open_needs_count >= 0),
  missing_seats INT NOT NULL DEFAULT 0 CHECK (missing_seats >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_need_coverage_club ON public.event_need_coverage(club_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_need_coverage TO authenticated;
GRANT ALL ON public.event_need_coverage TO service_role;
ALTER TABLE public.event_need_coverage ENABLE ROW LEVEL SECURITY;

-- 8. Triggers updated_at ----------------------------------------------
CREATE TRIGGER trg_event_needs_updated_at
  BEFORE UPDATE ON public.event_needs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_event_need_audiences_updated_at
  BEFORE UPDATE ON public.event_need_audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_event_need_signups_updated_at
  BEFORE UPDATE ON public.event_need_signups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_event_need_coverage_updated_at
  BEFORE UPDATE ON public.event_need_coverage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Trigger de cohérence event↔club sur event_needs -----------------
-- (events n'a pas de colonne club_id ; on remonte via events.team_id -> teams.club_id)
CREATE OR REPLACE FUNCTION public.event_needs_check_event_club()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  SELECT t.club_id INTO v_club_id
  FROM public.events e
  LEFT JOIN public.teams t ON t.id = e.team_id
  WHERE e.id = NEW.event_id;

  IF v_club_id IS NULL OR v_club_id <> NEW.club_id THEN
    RAISE EXCEPTION 'event_needs.club_id mismatch with events.team.club_id (event=%, expected=%, got=%)',
      NEW.event_id, v_club_id, NEW.club_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_event_needs_check_club
  BEFORE INSERT OR UPDATE OF event_id, club_id ON public.event_needs
  FOR EACH ROW EXECUTE FUNCTION public.event_needs_check_event_club();

-- 10. can_apply_to_event_need — SECURITY DEFINER + garde interne -----
CREATE OR REPLACE FUNCTION public.can_apply_to_event_need(_need_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_status TEXT;
BEGIN
  IF _need_id IS NULL OR _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT n.club_id, n.status INTO v_club_id, v_status
  FROM public.event_needs n
  WHERE n.id = _need_id;

  IF v_club_id IS NULL THEN
    RETURN false;
  END IF;

  -- Garde d'appelant : soi-même, staff du club, ou service_role. Refus silencieux.
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id)
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), v_club_id))
  ) THEN
    RETURN false;
  END IF;

  IF v_status <> 'open' THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), v_club_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.event_need_signups s
    WHERE s.need_id = _need_id AND s.user_id = _user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.event_need_publication_recipients r
    JOIN public.event_need_publications p ON p.id = r.publication_id
    WHERE p.need_id = _need_id AND r.user_id = _user_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_apply_to_event_need(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_apply_to_event_need(UUID, UUID) TO authenticated, service_role;

-- 11. RLS Policies ----------------------------------------------------

-- event_needs
CREATE POLICY "event_needs_staff_all"
  ON public.event_needs FOR ALL TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id))
  WITH CHECK (public.is_club_staff(auth.uid(), club_id));

CREATE POLICY "event_needs_recipient_read"
  ON public.event_needs FOR SELECT TO authenticated
  USING (
    status <> 'draft'
    AND (
      EXISTS (
        SELECT 1 FROM public.event_need_signups s
        WHERE s.need_id = event_needs.id AND s.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.event_need_publication_recipients r
        JOIN public.event_need_publications p ON p.id = r.publication_id
        WHERE p.need_id = event_needs.id AND r.user_id = auth.uid()
      )
    )
  );

-- event_need_audiences : staff-only
CREATE POLICY "event_need_audiences_staff_all"
  ON public.event_need_audiences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_audiences.need_id AND public.is_club_staff(auth.uid(), n.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_audiences.need_id AND public.is_club_staff(auth.uid(), n.club_id)));

-- event_need_audience_members : staff-only
CREATE POLICY "event_need_audience_members_staff_all"
  ON public.event_need_audience_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_audience_members.need_id AND public.is_club_staff(auth.uid(), n.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_audience_members.need_id AND public.is_club_staff(auth.uid(), n.club_id)));

-- event_need_publications : staff-only
CREATE POLICY "event_need_publications_staff_all"
  ON public.event_need_publications FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_publications.need_id AND public.is_club_staff(auth.uid(), n.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_publications.need_id AND public.is_club_staff(auth.uid(), n.club_id)));

-- event_need_publication_recipients : staff-only
CREATE POLICY "event_need_publication_recipients_staff_all"
  ON public.event_need_publication_recipients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_need_publications p JOIN public.event_needs n ON n.id = p.need_id WHERE p.id = event_need_publication_recipients.publication_id AND public.is_club_staff(auth.uid(), n.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_need_publications p JOIN public.event_needs n ON n.id = p.need_id WHERE p.id = event_need_publication_recipients.publication_id AND public.is_club_staff(auth.uid(), n.club_id)));

-- event_need_signups : owner + staff
CREATE POLICY "event_need_signups_owner_read"
  ON public.event_need_signups FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "event_need_signups_owner_insert"
  ON public.event_need_signups FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_apply_to_event_need(need_id, auth.uid()));

CREATE POLICY "event_need_signups_owner_update"
  ON public.event_need_signups FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "event_need_signups_staff_all"
  ON public.event_need_signups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_signups.need_id AND public.is_club_staff(auth.uid(), n.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_needs n WHERE n.id = event_need_signups.need_id AND public.is_club_staff(auth.uid(), n.club_id)));

-- event_need_coverage : staff read/write
CREATE POLICY "event_need_coverage_staff_all"
  ON public.event_need_coverage FOR ALL TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id))
  WITH CHECK (public.is_club_staff(auth.uid(), club_id));