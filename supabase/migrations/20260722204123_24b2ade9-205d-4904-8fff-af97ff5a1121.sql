CREATE OR REPLACE FUNCTION public.can_access_event(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND public.can_view_team(_user_id, e.team_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.convocations c
    JOIN public.players p ON p.id = c.player_id
    WHERE c.event_id = _event_id AND p.user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.convocations c
    JOIN public.player_parents pp ON pp.player_id = c.player_id
    WHERE c.event_id = _event_id AND pp.parent_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.meeting_attendees ma
    WHERE ma.event_id = _event_id AND ma.user_id = _user_id
  );
$function$;
