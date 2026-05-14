-- Allow parents to update their own child's media_consent_status
CREATE POLICY "players_parent_media_update"
ON public.players
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.player_parents pp
    WHERE pp.player_id = players.id
      AND pp.parent_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.player_parents pp
    WHERE pp.player_id = players.id
      AND pp.parent_user_id = auth.uid()
  )
);