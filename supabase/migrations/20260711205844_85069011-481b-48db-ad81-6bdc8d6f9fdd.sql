
CREATE OR REPLACE FUNCTION public.clubs_autofill_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base_slug text;
  candidate text;
  n int := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    RETURN NEW;
  END IF;

  base_slug := nullif(public.slugify(NEW.name), '');
  IF base_slug IS NULL OR public.is_reserved_club_slug(base_slug) THEN
    base_slug := 'club-' || substr(replace(coalesce(NEW.id, gen_random_uuid())::text,'-',''), 1, 8);
  END IF;

  candidate := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.clubs WHERE slug = candidate) LOOP
    n := n + 1;
    candidate := base_slug || '-' || n;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

-- Runs BEFORE the validate_slug trigger (alphabetical order on same event)
DROP TRIGGER IF EXISTS trg_clubs_autofill_slug ON public.clubs;
CREATE TRIGGER trg_clubs_autofill_slug
BEFORE INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.clubs_autofill_slug();
