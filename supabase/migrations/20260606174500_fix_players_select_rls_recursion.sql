-- Fix infinite recursion: players SELECT must use SECURITY DEFINER helper
-- instead of querying player_parents directly (player_parents SELECT reads players).

DROP POLICY IF EXISTS "players_select_scoped" ON public.players;

CREATE POLICY "players_select_scoped"
  ON public.players
  FOR SELECT
  TO authenticated
  USING (
    public.has_club_role(auth.uid(), club_id, 'admin'::public.app_role)
    OR public.has_club_role(auth.uid(), club_id, 'coach'::public.app_role)
    OR public.has_club_role(auth.uid(), club_id, 'dirigeant'::public.app_role)
    OR user_id = auth.uid()
    OR public.is_parent_of_player(auth.uid(), id)
  );
