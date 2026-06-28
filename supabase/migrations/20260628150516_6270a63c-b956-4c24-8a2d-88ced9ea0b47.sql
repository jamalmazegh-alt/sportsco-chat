
-- 1) clubs: hide Stripe Connect fields from non-admin authenticated members.
-- Server functions read these via supabaseAdmin (service role) so the app keeps working.
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_created_at)
  ON public.clubs FROM authenticated;
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_created_at)
  ON public.clubs FROM anon;

-- 2) tournament_members: restrict email enumeration.
-- Previously staff could SELECT every member row. Narrow to managers + the member's own row.
DROP POLICY IF EXISTS tm_select_admin ON public.tournament_members;
CREATE POLICY tm_select_admin ON public.tournament_members
  FOR SELECT TO authenticated
  USING (
    public.can_manage_tournament_members(auth.uid(), tournament_id)
    OR user_id = auth.uid()
  );

-- 3) tournament_registrations: drop the JWT-email-match self read policy.
-- Public registration access goes through the roster_token RPC; this policy
-- allowed reading PII (phone, players JSON) just by registering with someone
-- else's email.
DROP POLICY IF EXISTS tournament_registrations_self_read ON public.tournament_registrations;

-- 4) tournament_team_players: hide birth_date and license_number from anonymous visitors.
-- Authenticated tournament managers/members keep access via existing policies.
REVOKE SELECT (birth_date, license_number) ON public.tournament_team_players FROM anon;

-- 5) public_rate_limits: lock down. Only service_role may read/write.
REVOKE ALL ON public.public_rate_limits FROM anon, authenticated;
GRANT ALL ON public.public_rate_limits TO service_role;
-- Explicit deny policies (fail-closed already, but make intent obvious and
-- prevent accidental future policies from widening access).
DROP POLICY IF EXISTS public_rate_limits_no_access_anon ON public.public_rate_limits;
DROP POLICY IF EXISTS public_rate_limits_no_access_authenticated ON public.public_rate_limits;
CREATE POLICY public_rate_limits_no_access_anon ON public.public_rate_limits
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY public_rate_limits_no_access_authenticated ON public.public_rate_limits
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
