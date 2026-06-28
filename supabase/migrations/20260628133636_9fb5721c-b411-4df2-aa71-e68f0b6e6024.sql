-- Fix: tournament_registrations_self_read referenced auth.users directly,
-- which the `authenticated` role cannot SELECT, causing
-- "permission denied for table users" on any SELECT, including for managers.
-- Use auth.jwt() to read the current user's email instead.
DROP POLICY IF EXISTS tournament_registrations_self_read ON public.tournament_registrations;

CREATE POLICY tournament_registrations_self_read
  ON public.tournament_registrations
  FOR SELECT
  TO authenticated
  USING (
    contact_email IS NOT NULL
    AND lower(contact_email) = lower(coalesce(
      (auth.jwt() ->> 'email'),
      ''
    ))
  );
