-- 1. app_flags: restrict to authenticated only
DROP POLICY IF EXISTS "app_flags readable by everyone" ON public.app_flags;
CREATE POLICY "app_flags readable by authenticated"
ON public.app_flags FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.app_flags FROM anon;

-- 2. club_camp_required_documents: hide sensitive rows from public policy
DROP POLICY IF EXISTS "Public read required docs of published camps" ON public.club_camp_required_documents;
CREATE POLICY "Public read non sensitive required docs of published camps"
ON public.club_camp_required_documents FOR SELECT TO anon, authenticated
USING (club_camp_is_published(camp_id) AND COALESCE(is_sensitive, false) = false);

-- 3. event_staff_assignments: scope the broad reader policy to real event access
DROP POLICY IF EXISTS "event_staff_assignments_select_event_readers" ON public.event_staff_assignments;
CREATE POLICY "event_staff_assignments_select_event_readers"
ON public.event_staff_assignments FOR SELECT TO authenticated
USING (can_access_event(auth.uid(), event_id));