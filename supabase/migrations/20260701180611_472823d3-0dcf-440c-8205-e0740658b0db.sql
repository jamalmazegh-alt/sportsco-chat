
CREATE TABLE public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  logo_url text,
  target_url text NOT NULL CHECK (target_url ~* '^https?://'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sponsors_club_id_idx ON public.sponsors(club_id);
CREATE INDEX sponsors_club_active_idx ON public.sponsors(club_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO authenticated;
GRANT ALL ON public.sponsors TO service_role;

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsors_admin_select" ON public.sponsors
  FOR SELECT TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY "sponsors_admin_insert" ON public.sponsors
  FOR INSERT TO authenticated
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY "sponsors_admin_update" ON public.sponsors
  FOR UPDATE TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY "sponsors_admin_delete" ON public.sponsors
  FOR DELETE TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE TRIGGER update_sponsors_updated_at
  BEFORE UPDATE ON public.sponsors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sponsor_stats_daily (
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  day date NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (sponsor_id, day)
);
CREATE INDEX sponsor_stats_daily_club_day_idx ON public.sponsor_stats_daily(club_id, day);

GRANT SELECT ON public.sponsor_stats_daily TO authenticated;
GRANT ALL ON public.sponsor_stats_daily TO service_role;

ALTER TABLE public.sponsor_stats_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsor_stats_admin_select" ON public.sponsor_stats_daily
  FOR SELECT TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_active_sponsors_for_home(_club_id uuid)
RETURNS TABLE (id uuid, name text, logo_url text, target_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.logo_url, s.target_url
  FROM public.sponsors s
  WHERE s.club_id = _club_id
    AND s.is_active = true
    AND public.is_club_member(auth.uid(), _club_id)
  ORDER BY s.created_at ASC, s.id ASC;
$$;
REVOKE ALL ON FUNCTION public.get_active_sponsors_for_home(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_sponsors_for_home(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_sponsor_impression(p_sponsor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT club_id INTO v_club_id
  FROM public.sponsors
  WHERE id = p_sponsor_id AND is_active = true;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'sponsor_not_found_or_inactive' USING ERRCODE = '42704';
  END IF;

  IF NOT public.is_club_member(auth.uid(), v_club_id) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sponsor_stats_daily (sponsor_id, club_id, day, impressions, clicks)
  VALUES (p_sponsor_id, v_club_id, CURRENT_DATE, 1, 0)
  ON CONFLICT (sponsor_id, day)
  DO UPDATE SET impressions = public.sponsor_stats_daily.impressions + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.record_sponsor_impression(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sponsor_impression(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_sponsor_click(p_sponsor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT club_id INTO v_club_id
  FROM public.sponsors
  WHERE id = p_sponsor_id AND is_active = true;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'sponsor_not_found_or_inactive' USING ERRCODE = '42704';
  END IF;

  IF NOT public.is_club_member(auth.uid(), v_club_id) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sponsor_stats_daily (sponsor_id, club_id, day, impressions, clicks)
  VALUES (p_sponsor_id, v_club_id, CURRENT_DATE, 0, 1)
  ON CONFLICT (sponsor_id, day)
  DO UPDATE SET clicks = public.sponsor_stats_daily.clicks + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.record_sponsor_click(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sponsor_click(uuid) TO authenticated;

CREATE POLICY "sponsor_logos_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sponsor-logos'
    AND public.has_club_role(auth.uid(), NULLIF(split_part(name, '/', 2), '')::uuid, 'admin'::app_role)
  );

CREATE POLICY "sponsor_logos_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sponsor-logos'
    AND public.has_club_role(auth.uid(), NULLIF(split_part(name, '/', 2), '')::uuid, 'admin'::app_role)
  );

CREATE POLICY "sponsor_logos_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'sponsor-logos'
    AND public.has_club_role(auth.uid(), NULLIF(split_part(name, '/', 2), '')::uuid, 'admin'::app_role)
  );
