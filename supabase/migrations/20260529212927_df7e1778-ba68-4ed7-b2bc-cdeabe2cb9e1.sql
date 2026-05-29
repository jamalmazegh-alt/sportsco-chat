
ALTER VIEW public.player_season_stats SET (security_invoker = true);

DROP POLICY IF EXISTS "seasons_update" ON public.player_seasons;
CREATE POLICY "seasons_update"
ON public.player_seasons FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id
      AND (
        public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
        OR public.has_club_role(auth.uid(), p.club_id, 'coach'::app_role)
      )
  )
);
