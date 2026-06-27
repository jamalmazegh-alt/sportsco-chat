
-- 1. Restrict Stripe metadata columns on clubs to admins/financial_admins only
REVOKE SELECT (stripe_account_id, stripe_account_status, stripe_payouts_enabled, stripe_charges_enabled)
  ON public.clubs FROM authenticated;

-- Re-grant all other columns explicitly via a view-friendly approach: column-level grant for everything else
-- We grant SELECT on the remaining columns to authenticated
DO $$
DECLARE
  col text;
  cols text := '';
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clubs'
      AND column_name NOT IN ('stripe_account_id','stripe_account_status','stripe_payouts_enabled','stripe_charges_enabled')
  LOOP
    cols := cols || quote_ident(col) || ',';
  END LOOP;
  cols := rtrim(cols, ',');
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.clubs TO authenticated';
END$$;

-- Create a SECURITY DEFINER function exposing Stripe fields only to club admins/financial_admins
CREATE OR REPLACE FUNCTION public.get_club_stripe_status(_club_id uuid)
RETURNS TABLE(
  stripe_account_id text,
  stripe_account_status text,
  stripe_payouts_enabled boolean,
  stripe_charges_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.stripe_account_id, c.stripe_account_status, c.stripe_payouts_enabled, c.stripe_charges_enabled
  FROM public.clubs c
  WHERE c.id = _club_id
    AND (
      public.has_club_role(auth.uid(), _club_id, 'admin'::app_role)
      OR public.has_club_role(auth.uid(), _club_id, 'financial_admin'::app_role)
      OR public.has_super_admin(auth.uid())
    )
$$;
GRANT EXECUTE ON FUNCTION public.get_club_stripe_status(uuid) TO authenticated;

-- 2. Mask donor PII for anonymous fundraising contributions via trigger
CREATE OR REPLACE FUNCTION public.mask_anonymous_donor_pii()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_anonymous IS TRUE THEN
    NEW.donor_name := NULL;
    NEW.donor_email := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mask_anonymous_donor_pii ON public.fundraising_contributions;
CREATE TRIGGER trg_mask_anonymous_donor_pii
BEFORE INSERT OR UPDATE ON public.fundraising_contributions
FOR EACH ROW EXECUTE FUNCTION public.mask_anonymous_donor_pii();

-- Backfill: null PII on existing anonymous rows
UPDATE public.fundraising_contributions
SET donor_name = NULL, donor_email = NULL
WHERE is_anonymous IS TRUE AND (donor_name IS NOT NULL OR donor_email IS NOT NULL);

-- 3. Allow tournament registrants to read their own registration (by matching auth email)
CREATE POLICY tournament_registrations_self_read
ON public.tournament_registrations
FOR SELECT
TO authenticated
USING (
  contact_email IS NOT NULL
  AND lower(contact_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- 4. Allow public tournament viewers to read team rosters
CREATE POLICY ttp_select_public
ON public.tournament_team_players
FOR SELECT
USING (public.can_view_tournament(auth.uid(), tournament_id));
