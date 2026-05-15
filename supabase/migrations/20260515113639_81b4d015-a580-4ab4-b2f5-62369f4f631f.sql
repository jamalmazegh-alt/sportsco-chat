-- 1) Lock invite SELECT to club admins only
DROP POLICY IF EXISTS club_invites_select_authenticated ON public.club_invites;
CREATE POLICY club_invites_select_admin
  ON public.club_invites FOR SELECT
  TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

DROP POLICY IF EXISTS member_invites_select_authenticated ON public.member_invites;
CREATE POLICY member_invites_select_admin
  ON public.member_invites FOR SELECT
  TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

-- 2) Restrict notification inserts to clubmates only (no cross-club spam)
DROP POLICY IF EXISTS notifications_insert_any_authenticated ON public.notifications;
CREATE POLICY notifications_insert_clubmate
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.club_members me
      JOIN public.club_members other ON other.club_id = me.club_id
      WHERE me.user_id = auth.uid()
        AND other.user_id = notifications.user_id
    )
  );