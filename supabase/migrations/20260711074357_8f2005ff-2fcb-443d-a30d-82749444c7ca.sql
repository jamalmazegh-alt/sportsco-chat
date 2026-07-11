
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS logo_scale numeric NOT NULL DEFAULT 1.00;

ALTER TABLE public.sponsors
  DROP CONSTRAINT IF EXISTS sponsors_logo_scale_check;
ALTER TABLE public.sponsors
  ADD CONSTRAINT sponsors_logo_scale_check
  CHECK (logo_scale >= 0.75 AND logo_scale <= 1.30);

DROP FUNCTION IF EXISTS public.get_active_sponsors_for_home(uuid);

CREATE OR REPLACE FUNCTION public.get_active_sponsors_for_home(_club_id uuid)
RETURNS TABLE (id uuid, name text, logo_url text, target_url text, logo_scale numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.logo_url, s.target_url, s.logo_scale
  FROM public.sponsors s
  WHERE s.club_id = _club_id
    AND s.is_active = true
    AND public.is_club_member(auth.uid(), _club_id)
  ORDER BY s.created_at ASC, s.id ASC;
$$;
REVOKE ALL ON FUNCTION public.get_active_sponsors_for_home(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_sponsors_for_home(uuid) TO authenticated;
