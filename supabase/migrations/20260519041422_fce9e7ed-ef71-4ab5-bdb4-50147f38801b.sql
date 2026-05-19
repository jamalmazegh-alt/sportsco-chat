CREATE OR REPLACE FUNCTION public.can_author_player_feedback(_user_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id
      AND (
        public.has_club_role(_user_id, p.club_id, 'admin'::app_role)
        OR public.has_club_role(_user_id, p.club_id, 'coach'::app_role)
        OR public.has_club_role(_user_id, p.club_id, 'dirigeant'::app_role)
        OR public.has_super_admin(_user_id)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm_player
    WHERE tm_player.player_id = _player_id
      AND public.is_team_coach(_user_id, tm_player.team_id)
  );
$function$;