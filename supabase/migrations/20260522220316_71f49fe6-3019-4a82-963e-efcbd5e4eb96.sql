-- Allow all club members (not just admins/dirigeants) to read the subscription status
-- of their own club. The UI gates non-billing actions on the active state, and
-- coaches were being incorrectly locked out because they couldn't read the row.
DROP POLICY IF EXISTS "Members can view their club subscription" ON public.subscriptions;
CREATE POLICY "Members can view their club subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));