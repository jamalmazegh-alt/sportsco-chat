DROP POLICY IF EXISTS players_admin_or_coach_write ON public.players;

CREATE POLICY players_admin_or_coach_write ON public.players
FOR ALL
USING (
  has_club_role(auth.uid(), club_id, 'admin'::app_role)
  OR has_club_role(auth.uid(), club_id, 'coach'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = players.club_id
      AND 'assistant_coach' = ANY(cm.roles)
  )
)
WITH CHECK (
  has_club_role(auth.uid(), club_id, 'admin'::app_role)
  OR has_club_role(auth.uid(), club_id, 'coach'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = players.club_id
      AND 'assistant_coach' = ANY(cm.roles)
  )
);