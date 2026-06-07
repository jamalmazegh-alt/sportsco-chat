-- Guard for /players/:id/availability — player self, parent, team coach, or club admin.
CREATE OR REPLACE FUNCTION public.can_view_player_availability(_user_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.id = _player_id
      AND p.user_id = _user_id
  )
  OR public.is_parent_of_player(_user_id, _player_id)
  OR public.is_player_team_coach(_user_id, _player_id)
  OR public.is_player_club_admin(_user_id, _player_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_view_player_availability(uuid, uuid) TO authenticated;
