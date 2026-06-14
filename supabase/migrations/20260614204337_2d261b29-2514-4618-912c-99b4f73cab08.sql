
-- 1. Drop overly broad self-select policy on tournament_registrations
DROP POLICY IF EXISTS tournament_registrations_contact_self_select ON public.tournament_registrations;

-- 2. Restrict notifications insert policy to authenticated role only
DROP POLICY IF EXISTS notifications_insert_clubmate ON public.notifications;
CREATE POLICY notifications_insert_clubmate
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NOT NULL
    AND (user_id = auth.uid() OR public.users_share_club(auth.uid(), user_id))
  );

-- 3. Hide platform_fee_bps from regular club members (column-level revoke)
REVOKE SELECT (platform_fee_bps) ON public.club_payment_settings FROM authenticated;
-- service_role retains full ALL grant; financial admins can access via SECURITY DEFINER RPCs if needed

-- 4. Tighten conversion_events insert: prevent spoofing user_id
DROP POLICY IF EXISTS "anyone inserts conversion events" ON public.conversion_events;
CREATE POLICY "anyone inserts conversion events"
  ON public.conversion_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
