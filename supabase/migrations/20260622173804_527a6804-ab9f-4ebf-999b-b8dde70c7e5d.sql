-- Protect Stripe Connect fields on public.clubs from regular club members
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_payouts_enabled, stripe_charges_enabled, stripe_account_created_at)
  ON public.clubs FROM authenticated, anon;

-- Defense-in-depth explicit service-role-only SELECT policy on waitlist_interest
-- (table already has RLS enabled with no policies; this documents intent)
DROP POLICY IF EXISTS "Service role can read waitlist" ON public.waitlist_interest;
CREATE POLICY "Service role can read waitlist"
  ON public.waitlist_interest FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can insert waitlist" ON public.waitlist_interest;
CREATE POLICY "Service role can insert waitlist"
  ON public.waitlist_interest FOR INSERT
  WITH CHECK (auth.role() = 'service_role');