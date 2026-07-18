DROP TRIGGER IF EXISTS sync_club_member_roles_trg ON public.club_members;
CREATE TRIGGER sync_club_member_roles_trg
  BEFORE INSERT ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_club_member_roles();

-- Repair Drogba row and any other row where roles contains extra roles
-- that were re-appended by the old trigger. Re-run the sync from roles[]
-- as source of truth by touching each row.
UPDATE public.club_members SET roles = roles WHERE true;