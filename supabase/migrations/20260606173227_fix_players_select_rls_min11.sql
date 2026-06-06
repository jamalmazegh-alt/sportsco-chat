-- MIN-11: parents could read any player in their club without a player_parents link.
-- Replace players_select_clubmate with role-scoped SELECT access.

DROP POLICY IF EXISTS "players_select_clubmate" ON public.players;

CREATE POLICY "players_select_scoped"
  ON public.players
  FOR SELECT
  TO authenticated
  USING (
    -- Staff: full club roster
    public.has_club_role(auth.uid(), club_id, 'admin'::public.app_role)
    OR public.has_club_role(auth.uid(), club_id, 'coach'::public.app_role)
    OR public.has_club_role(auth.uid(), club_id, 'dirigeant'::public.app_role)
    -- Player: own profile only
    OR user_id = auth.uid()
    -- Parent: linked children only
    OR EXISTS (
      SELECT 1
      FROM public.player_parents pp
      WHERE pp.player_id = players.id
        AND pp.parent_user_id = auth.uid()
    )
  );
