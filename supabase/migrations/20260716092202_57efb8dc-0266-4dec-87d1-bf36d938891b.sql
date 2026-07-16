-- Helper: is user a self-player or linked-parent of a player convoqué to any event of this team?
CREATE OR REPLACE FUNCTION public.has_convocation_in_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.convocations c
    JOIN public.events e ON e.id = c.event_id
    JOIN public.players p ON p.id = c.player_id
    LEFT JOIN public.player_parents pp ON pp.player_id = p.id
    WHERE e.team_id = _team_id
      AND (p.user_id = _user_id OR pp.parent_user_id = _user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_convocation_in_team(uuid, uuid) TO authenticated;

-- teams: allow invited player/parent to read the team row of the event their child is convoqué to
DROP POLICY IF EXISTS teams_select_member ON public.teams;
CREATE POLICY teams_select_member ON public.teams
FOR SELECT TO authenticated
USING (
  has_club_role(auth.uid(), club_id, 'admin'::app_role)
  OR can_view_team(auth.uid(), id)
  OR has_convocation_in_team(auth.uid(), id)
);

-- carpools
DROP POLICY IF EXISTS carpools_select ON public.carpools;
CREATE POLICY carpools_select ON public.carpools
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = carpools.event_id
      AND (can_view_team(auth.uid(), e.team_id) OR has_convocation_in_team(auth.uid(), e.team_id))
  )
);

-- carpool_passengers
DROP POLICY IF EXISTS carpool_passengers_select ON public.carpool_passengers;
CREATE POLICY carpool_passengers_select ON public.carpool_passengers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.carpools c
    JOIN public.events e ON e.id = c.event_id
    WHERE c.id = carpool_passengers.carpool_id
      AND (can_view_team(auth.uid(), e.team_id) OR has_convocation_in_team(auth.uid(), e.team_id))
  )
);

-- carpool_needs
DROP POLICY IF EXISTS carpool_needs_select ON public.carpool_needs;
CREATE POLICY carpool_needs_select ON public.carpool_needs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = carpool_needs.event_id
      AND (can_view_team(auth.uid(), e.team_id) OR has_convocation_in_team(auth.uid(), e.team_id))
  )
);

-- event_goals
DROP POLICY IF EXISTS event_goals_select ON public.event_goals;
CREATE POLICY event_goals_select ON public.event_goals
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_goals.event_id
      AND (can_view_team(auth.uid(), e.team_id) OR has_convocation_in_team(auth.uid(), e.team_id))
  )
);