CREATE OR REPLACE FUNCTION public.can_view_team(_user_id uuid, _team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = _team_id
        AND (
          public.has_club_role(_user_id, t.club_id, 'admin'::app_role)
          OR public.has_club_role(_user_id, t.club_id, 'dirigeant'::app_role)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = _team_id AND tm.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.player_parents pp ON pp.player_id = tm.player_id
      WHERE tm.team_id = _team_id AND pp.parent_user_id = _user_id
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_team_coach(_user_id uuid, _team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id AND tm.role IN ('coach','admin')
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.club_members cm ON cm.club_id = t.club_id
    WHERE t.id = _team_id AND cm.user_id = _user_id AND cm.role IN ('admin','coach','dirigeant')
  );
$function$;