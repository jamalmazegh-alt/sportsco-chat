-- 1) Tournament team players: restrict SELECT to tournament managers/co-organizers
-- (birth_date and license_number were readable by any authenticated viewer of public tournaments).
DROP POLICY IF EXISTS ttp_select ON public.tournament_team_players;
CREATE POLICY ttp_select ON public.tournament_team_players
  FOR SELECT
  TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id));

-- 2) Tournament documents bucket: drop broad public listing policy.
-- Files remain accessible via direct CDN public URLs (bucket is public); only
-- bucket-listing is removed, which the app does not use.
DROP POLICY IF EXISTS tournament_documents_public_read ON storage.objects;

-- 3) Tournament registrations: allow the submitting contact to view their own
-- registration (manager_all already covers managers).
DROP POLICY IF EXISTS tournament_registrations_contact_self_select ON public.tournament_registrations;
CREATE POLICY tournament_registrations_contact_self_select ON public.tournament_registrations
  FOR SELECT
  TO authenticated
  USING (
    contact_email IS NOT NULL
    AND lower(contact_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );