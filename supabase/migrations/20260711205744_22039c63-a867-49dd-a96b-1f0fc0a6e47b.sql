
-- =========================================================================
-- PHASE 1 — STAGES & INSCRIPTIONS
-- Schéma complet (figé), y compris les tables des Phases 2/3.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. clubs.slug — public URL identifier
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_reserved_club_slug(_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(_slug) = ANY (ARRAY[
    'api','admin','superadmin','auth','login','logout','register','signup',
    'stages','support','settings','profile','profiles','app','www','public',
    'assets','static','sitemap','robots','favicon','offline','mcp','lovable',
    'email','emails','webhook','webhooks','notifications','tournaments','tournament',
    'clubs','club','players','player','teams','team','events','event','payments',
    'pricing','features','faq','contact','demo','onboarding','r','p','t','en','fr',
    'de','es','it','nl','pt','forgot-password','reset-password'
  ]);
$$;

-- Slugify without extension dependency (accent stripping via translate).
CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    trim(both '-' FROM
      regexp_replace(
        regexp_replace(
          lower(translate(
            coalesce(_input, ''),
            'àáâãäåāăąçćčďđèéêëēĕėęěìíîïĩīĭįłñńňòóôõöōŏőøřśšşťţùúûüũūŭůűųýÿžźż',
            'aaaaaaaaacccddeeeeeeeeeiiiiiiiilnnnooooooooorssstttuuuuuuuuuuyyzzz'
          )),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-+', '-', 'g'
      )
    );
$$;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS slug text;

DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  n int;
BEGIN
  FOR r IN SELECT id, name FROM public.clubs WHERE slug IS NULL LOOP
    base_slug := nullif(public.slugify(r.name), '');
    IF base_slug IS NULL OR public.is_reserved_club_slug(base_slug) THEN
      base_slug := 'club-' || substr(replace(r.id::text,'-',''), 1, 8);
    END IF;
    candidate := base_slug;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.clubs WHERE slug = candidate) LOOP
      n := n + 1;
      candidate := base_slug || '-' || n;
    END LOOP;
    UPDATE public.clubs SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.clubs
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clubs_slug_key ON public.clubs (slug);

CREATE OR REPLACE FUNCTION public.clubs_validate_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NULL OR length(trim(NEW.slug)) = 0 THEN
    RAISE EXCEPTION 'Club slug is required' USING ERRCODE = '23514';
  END IF;
  IF NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid club slug format: %', NEW.slug USING ERRCODE = '23514';
  END IF;
  IF public.is_reserved_club_slug(NEW.slug) THEN
    RAISE EXCEPTION 'Reserved club slug: %', NEW.slug USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.slug IS NOT NULL AND OLD.slug IS DISTINCT FROM NEW.slug THEN
    RAISE EXCEPTION 'Club slug is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clubs_validate_slug ON public.clubs;
CREATE TRIGGER trg_clubs_validate_slug
BEFORE INSERT OR UPDATE OF slug ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.clubs_validate_slug();

-- -------------------------------------------------------------------------
-- 2. updated_at helper
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- 3. club_camps
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  cover_image_url text,
  venue_id uuid REFERENCES public.club_venues(id) ON DELETE SET NULL,
  facility_id uuid REFERENCES public.club_facilities(id) ON DELETE SET NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  price numeric,
  currency text NOT NULL DEFAULT 'EUR',
  capacity integer NOT NULL CHECK (capacity > 0),
  registration_deadline timestamptz,
  payment_instructions text,
  document_retention_months integer NOT NULL DEFAULT 6 CHECK (document_retention_months >= 1),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','closed','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_camps_slug_per_club_unique UNIQUE (club_id, slug),
  CONSTRAINT club_camps_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_club_camps_club_id ON public.club_camps(club_id);
CREATE INDEX IF NOT EXISTS idx_club_camps_status ON public.club_camps(status);
CREATE INDEX IF NOT EXISTS idx_club_camps_start_date ON public.club_camps(start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_camps TO authenticated;
GRANT SELECT ON public.club_camps TO anon;
GRANT ALL ON public.club_camps TO service_role;

ALTER TABLE public.club_camps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published camps"
ON public.club_camps FOR SELECT TO anon, authenticated
USING (status = 'published');

CREATE POLICY "Club roles can view all camps of their club"
ON public.club_camps FOR SELECT TO authenticated
USING (
  public.has_club_role_text(auth.uid(), club_id, 'admin')
  OR public.has_club_role_text(auth.uid(), club_id, 'dirigeant')
  OR public.has_club_role_text(auth.uid(), club_id, 'coach')
);

CREATE POLICY "Club roles can insert camps"
ON public.club_camps FOR INSERT TO authenticated
WITH CHECK (
  public.has_club_role_text(auth.uid(), club_id, 'admin')
  OR public.has_club_role_text(auth.uid(), club_id, 'dirigeant')
  OR public.has_club_role_text(auth.uid(), club_id, 'coach')
);

CREATE POLICY "Club roles can update camps"
ON public.club_camps FOR UPDATE TO authenticated
USING (
  public.has_club_role_text(auth.uid(), club_id, 'admin')
  OR public.has_club_role_text(auth.uid(), club_id, 'dirigeant')
  OR public.has_club_role_text(auth.uid(), club_id, 'coach')
);

CREATE POLICY "Club roles can delete camps"
ON public.club_camps FOR DELETE TO authenticated
USING (
  public.has_club_role_text(auth.uid(), club_id, 'admin')
  OR public.has_club_role_text(auth.uid(), club_id, 'dirigeant')
);

CREATE TRIGGER trg_club_camps_updated_at
BEFORE UPDATE ON public.club_camps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reusable predicates for child tables
CREATE OR REPLACE FUNCTION public.club_camp_is_published(_camp_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_camps
    WHERE id = _camp_id AND status = 'published'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_club_camp(_camp_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_camps c
    WHERE c.id = _camp_id
      AND (
        public.has_club_role_text(_user_id, c.club_id, 'admin')
        OR public.has_club_role_text(_user_id, c.club_id, 'dirigeant')
        OR public.has_club_role_text(_user_id, c.club_id, 'coach')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.club_camp_is_published(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_camp_is_published(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_club_camp(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_club_camp(uuid, uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 4. club_camp_age_groups
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camp_age_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES public.club_camps(id) ON DELETE CASCADE,
  label text NOT NULL,
  birth_year_min integer,
  birth_year_max integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT age_group_years_check CHECK (
    birth_year_min IS NULL OR birth_year_max IS NULL OR birth_year_min <= birth_year_max
  )
);
CREATE INDEX IF NOT EXISTS idx_camp_age_groups_camp_id ON public.club_camp_age_groups(camp_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_camp_age_groups TO authenticated;
GRANT SELECT ON public.club_camp_age_groups TO anon;
GRANT ALL ON public.club_camp_age_groups TO service_role;

ALTER TABLE public.club_camp_age_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read age groups of published camps"
ON public.club_camp_age_groups FOR SELECT TO anon, authenticated
USING (public.club_camp_is_published(camp_id));

CREATE POLICY "Club roles read age groups"
ON public.club_camp_age_groups FOR SELECT TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()));

CREATE POLICY "Club roles write age groups"
ON public.club_camp_age_groups FOR ALL TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()))
WITH CHECK (public.can_manage_club_camp(camp_id, auth.uid()));

-- -------------------------------------------------------------------------
-- 5. club_camp_program_items
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camp_program_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES public.club_camps(id) ON DELETE CASCADE,
  starts_at timestamptz,
  ends_at timestamptz,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camp_program_items_camp_id ON public.club_camp_program_items(camp_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_camp_program_items TO authenticated;
GRANT SELECT ON public.club_camp_program_items TO anon;
GRANT ALL ON public.club_camp_program_items TO service_role;

ALTER TABLE public.club_camp_program_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read program of published camps"
ON public.club_camp_program_items FOR SELECT TO anon, authenticated
USING (public.club_camp_is_published(camp_id));

CREATE POLICY "Club roles read program"
ON public.club_camp_program_items FOR SELECT TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()));

CREATE POLICY "Club roles write program"
ON public.club_camp_program_items FOR ALL TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()))
WITH CHECK (public.can_manage_club_camp(camp_id, auth.uid()));

-- -------------------------------------------------------------------------
-- 6. club_camp_documents (public club-provided docs)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camp_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES public.club_camps(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text NOT NULL,
  document_type text
    CHECK (document_type IS NULL OR document_type IN ('flyer','program','rules','form','other')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camp_documents_camp_id ON public.club_camp_documents(camp_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_camp_documents TO authenticated;
GRANT SELECT ON public.club_camp_documents TO anon;
GRANT ALL ON public.club_camp_documents TO service_role;

ALTER TABLE public.club_camp_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read documents of published camps"
ON public.club_camp_documents FOR SELECT TO anon, authenticated
USING (public.club_camp_is_published(camp_id));

CREATE POLICY "Club roles read documents"
ON public.club_camp_documents FOR SELECT TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()));

CREATE POLICY "Club roles write documents"
ON public.club_camp_documents FOR ALL TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()))
WITH CHECK (public.can_manage_club_camp(camp_id, auth.uid()));

-- -------------------------------------------------------------------------
-- 7. club_camp_required_documents (docs requested from families)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camp_required_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES public.club_camps(id) ON DELETE CASCADE,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  document_type text
    CHECK (document_type IS NULL OR document_type IN ('medical','license','authorization','health_form','insurance','other')),
  is_sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camp_required_docs_camp_id ON public.club_camp_required_documents(camp_id);

CREATE OR REPLACE FUNCTION public.club_camp_required_docs_auto_sensitive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.document_type IN ('medical','health_form') THEN
    NEW.is_sensitive := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_camp_required_docs_auto_sensitive
BEFORE INSERT OR UPDATE ON public.club_camp_required_documents
FOR EACH ROW EXECUTE FUNCTION public.club_camp_required_docs_auto_sensitive();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_camp_required_documents TO authenticated;
GRANT SELECT ON public.club_camp_required_documents TO anon;
GRANT ALL ON public.club_camp_required_documents TO service_role;

ALTER TABLE public.club_camp_required_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read required docs of published camps"
ON public.club_camp_required_documents FOR SELECT TO anon, authenticated
USING (public.club_camp_is_published(camp_id));

CREATE POLICY "Club roles read required docs"
ON public.club_camp_required_documents FOR SELECT TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()));

CREATE POLICY "Club roles write required docs"
ON public.club_camp_required_documents FOR ALL TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()))
WITH CHECK (public.can_manage_club_camp(camp_id, auth.uid()));

-- -------------------------------------------------------------------------
-- 8. club_camp_registrations (used in Phase 2/3)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camp_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES public.club_camps(id) ON DELETE RESTRICT,
  access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_first_name text NOT NULL,
  participant_last_name text NOT NULL,
  birth_date date NOT NULL,
  gender text,
  club_name text,
  guardian_first_name text NOT NULL,
  guardian_last_name text NOT NULL,
  guardian_email text NOT NULL,
  guardian_phone text,
  notes text,
  registration_status text NOT NULL DEFAULT 'pending'
    CHECK (registration_status IN ('pending','under_review','approved','waitlist','rejected','cancelled')),
  rejection_reason text,
  reserved_until timestamptz,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('not_required','pending','declared','paid','partial','refunded')),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camp_regs_camp_id ON public.club_camp_registrations(camp_id);
CREATE INDEX IF NOT EXISTS idx_camp_regs_status ON public.club_camp_registrations(registration_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_camp_regs_access_token ON public.club_camp_registrations(access_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_camp_regs_participant_uniq
ON public.club_camp_registrations(camp_id, lower(participant_first_name), lower(participant_last_name), birth_date)
WHERE registration_status <> 'cancelled';

-- No anon access at all. Writes go through server-only path (service role).
GRANT SELECT, UPDATE ON public.club_camp_registrations TO authenticated;
GRANT ALL ON public.club_camp_registrations TO service_role;

ALTER TABLE public.club_camp_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club roles read registrations"
ON public.club_camp_registrations FOR SELECT TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()));

CREATE POLICY "Club roles update registrations"
ON public.club_camp_registrations FOR UPDATE TO authenticated
USING (public.can_manage_club_camp(camp_id, auth.uid()))
WITH CHECK (public.can_manage_club_camp(camp_id, auth.uid()));

CREATE TRIGGER trg_camp_regs_updated_at
BEFORE UPDATE ON public.club_camp_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- 9. club_camp_registration_documents (private files)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_camp_registration_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.club_camp_registrations(id) ON DELETE CASCADE,
  required_document_id uuid NOT NULL REFERENCES public.club_camp_required_documents(id) ON DELETE RESTRICT,
  file_path text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','rejected')),
  rejection_reason text
);
CREATE INDEX IF NOT EXISTS idx_camp_reg_docs_registration_id ON public.club_camp_registration_documents(registration_id);
CREATE INDEX IF NOT EXISTS idx_camp_reg_docs_required_id ON public.club_camp_registration_documents(required_document_id);

GRANT SELECT, UPDATE ON public.club_camp_registration_documents TO authenticated;
GRANT ALL ON public.club_camp_registration_documents TO service_role;

ALTER TABLE public.club_camp_registration_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club roles read registration docs"
ON public.club_camp_registration_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_camp_registrations r
    WHERE r.id = registration_id
      AND public.can_manage_club_camp(r.camp_id, auth.uid())
  )
);

CREATE POLICY "Club roles update registration docs review"
ON public.club_camp_registration_documents FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_camp_registrations r
    WHERE r.id = registration_id
      AND public.can_manage_club_camp(r.camp_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_camp_registrations r
    WHERE r.id = registration_id
      AND public.can_manage_club_camp(r.camp_id, auth.uid())
  )
);
