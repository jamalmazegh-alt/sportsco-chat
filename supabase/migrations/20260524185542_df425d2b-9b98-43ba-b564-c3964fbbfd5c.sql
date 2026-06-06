-- 1. tournament_members_touch_updated: set search_path
CREATE OR REPLACE FUNCTION public.tournament_members_touch_updated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 2. audit_logs: drop overly-permissive INSERT policy. Service role bypasses RLS,
-- so backend audit writes continue working.
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;

-- 3. tournament_teams: hide contact_email / contact_phone from anonymous visitors
-- on public tournament pages. Authenticated managers continue to access them.
REVOKE SELECT (contact_email, contact_phone) ON public.tournament_teams FROM anon;

-- 4. tournament_registrations: explicit deny for anonymous reads.
DROP POLICY IF EXISTS tournament_registrations_anon_no_select ON public.tournament_registrations;
CREATE POLICY tournament_registrations_anon_no_select
ON public.tournament_registrations
FOR SELECT
TO anon
USING (false);
