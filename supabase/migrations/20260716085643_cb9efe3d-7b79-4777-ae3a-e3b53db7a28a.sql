CREATE OR REPLACE FUNCTION public.can_view_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      SELECT 1
      FROM public.team_members tm
      JOIN public.players p ON p.id = tm.player_id
      WHERE tm.team_id = _team_id AND p.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      JOIN public.player_parents pp ON pp.player_id = tm.player_id
      WHERE tm.team_id = _team_id AND pp.parent_user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_event(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = _event_id
      AND public.can_view_team(_user_id, e.team_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.convocations c
    JOIN public.players p ON p.id = c.player_id
    WHERE c.event_id = _event_id
      AND p.user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.convocations c
    JOIN public.player_parents pp ON pp.player_id = c.player_id
    WHERE c.event_id = _event_id
      AND pp.parent_user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_event(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS events_select ON public.events;

CREATE POLICY events_select
ON public.events
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.can_access_event(auth.uid(), id));