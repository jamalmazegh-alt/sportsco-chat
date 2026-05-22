
-- Allow personal tournaments (no club)
ALTER TABLE public.tournaments ALTER COLUMN club_id DROP NOT NULL;

-- Update helper functions to handle personal tournaments
CREATE OR REPLACE FUNCTION public.can_view_tournament(_user_id uuid, _tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament_id
      AND (
        (t.status IN ('published','in_progress','completed') AND t.archived_at IS NULL)
        OR (t.club_id IS NOT NULL AND is_club_member(_user_id, t.club_id))
        OR (t.club_id IS NULL AND t.created_by = _user_id)
        OR has_super_admin(_user_id)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_tournament(_user_id uuid, _tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament_id
      AND (
        (t.club_id IS NOT NULL AND (
          has_club_role(_user_id, t.club_id, 'admin'::app_role)
          OR has_club_role(_user_id, t.club_id, 'dirigeant'::app_role)
        ))
        OR (t.club_id IS NULL AND t.created_by = _user_id)
        OR has_super_admin(_user_id)
      )
  );
$function$;

-- Update RLS policies for tournaments to cover personal tournaments
DROP POLICY IF EXISTS "tournaments_select_member" ON public.tournaments;
CREATE POLICY "tournaments_select_member"
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (
    (club_id IS NOT NULL AND is_club_member(auth.uid(), club_id))
    OR (club_id IS NULL AND created_by = auth.uid())
    OR has_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "tournaments_write_admin_dirigeant" ON public.tournaments;
CREATE POLICY "tournaments_write_admin_dirigeant"
  ON public.tournaments
  FOR ALL
  TO authenticated
  USING (
    (club_id IS NOT NULL AND (
      has_club_role(auth.uid(), club_id, 'admin'::app_role)
      OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
    ))
    OR (club_id IS NULL AND created_by = auth.uid())
    OR has_super_admin(auth.uid())
  )
  WITH CHECK (
    (club_id IS NOT NULL AND (
      has_club_role(auth.uid(), club_id, 'admin'::app_role)
      OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
    ))
    OR (club_id IS NULL AND created_by = auth.uid())
    OR has_super_admin(auth.uid())
  );
