
-- club_venues
CREATE TABLE public.club_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  address text NOT NULL CHECK (length(btrim(address)) > 0),
  city text,
  postal_code text,
  country text,
  latitude double precision,
  longitude double precision,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX club_venues_club_id_idx ON public.club_venues(club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_venues TO authenticated;
GRANT ALL ON public.club_venues TO service_role;
ALTER TABLE public.club_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_venues_select_members" ON public.club_venues
  FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));

CREATE POLICY "club_venues_insert_admin" ON public.club_venues
  FOR INSERT TO authenticated
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY "club_venues_update_admin" ON public.club_venues
  FOR UPDATE TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY "club_venues_delete_admin" ON public.club_venues
  FOR DELETE TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE TRIGGER update_club_venues_updated_at
  BEFORE UPDATE ON public.club_venues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- club_facilities
CREATE TABLE public.club_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.club_venues(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  surface_type text,
  sport text,
  is_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX club_facilities_venue_id_idx ON public.club_facilities(venue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_facilities TO authenticated;
GRANT ALL ON public.club_facilities TO service_role;
ALTER TABLE public.club_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_facilities_select_members" ON public.club_facilities
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_venues v
    WHERE v.id = club_facilities.venue_id
      AND public.is_club_member(auth.uid(), v.club_id)
  ));

CREATE POLICY "club_facilities_insert_admin" ON public.club_facilities
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_venues v
    WHERE v.id = club_facilities.venue_id
      AND public.has_club_role(auth.uid(), v.club_id, 'admin'::app_role)
  ));

CREATE POLICY "club_facilities_update_admin" ON public.club_facilities
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_venues v
    WHERE v.id = club_facilities.venue_id
      AND public.has_club_role(auth.uid(), v.club_id, 'admin'::app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_venues v
    WHERE v.id = club_facilities.venue_id
      AND public.has_club_role(auth.uid(), v.club_id, 'admin'::app_role)
  ));

CREATE POLICY "club_facilities_delete_admin" ON public.club_facilities
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_venues v
    WHERE v.id = club_facilities.venue_id
      AND public.has_club_role(auth.uid(), v.club_id, 'admin'::app_role)
  ));

CREATE TRIGGER update_club_facilities_updated_at
  BEFORE UPDATE ON public.club_facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- events FK columns (nullable, additive)
ALTER TABLE public.events
  ADD COLUMN venue_id uuid REFERENCES public.club_venues(id) ON DELETE SET NULL,
  ADD COLUMN facility_id uuid REFERENCES public.club_facilities(id) ON DELETE SET NULL;
