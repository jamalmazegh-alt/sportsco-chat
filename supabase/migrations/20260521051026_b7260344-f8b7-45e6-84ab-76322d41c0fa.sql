CREATE OR REPLACE FUNCTION public.users_share_club(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members me
    JOIN public.club_members other ON other.club_id = me.club_id
    WHERE me.user_id = _a AND other.user_id = _b
  );
$$;

DROP POLICY IF EXISTS notifications_insert_clubmate ON public.notifications;
CREATE POLICY notifications_insert_clubmate
  ON public.notifications FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.users_share_club(auth.uid(), user_id)
  );
