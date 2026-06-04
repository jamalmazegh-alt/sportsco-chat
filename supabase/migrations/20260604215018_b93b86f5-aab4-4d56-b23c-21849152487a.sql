-- Backfill: ensure `roles` array contains the legacy `role` column for all club_members
UPDATE public.club_members
SET roles = ARRAY[role::text]
WHERE role IS NOT NULL
  AND (roles IS NULL OR cardinality(roles) = 0 OR NOT (role::text = ANY(roles)));

-- Trigger to keep roles in sync on insert/update
CREATE OR REPLACE FUNCTION public.sync_club_member_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS NOT NULL THEN
    IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
      NEW.roles := ARRAY[NEW.role::text];
    ELSIF NOT (NEW.role::text = ANY(NEW.roles)) THEN
      NEW.roles := array_append(NEW.roles, NEW.role::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_club_member_roles_trg ON public.club_members;
CREATE TRIGGER sync_club_member_roles_trg
BEFORE INSERT OR UPDATE ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.sync_club_member_roles();