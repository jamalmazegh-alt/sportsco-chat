-- FIX 1b: update clubero-payment-reminders cron job to send x-cron-secret
SELECT cron.unschedule('clubero-payment-reminders');

SELECT cron.schedule(
  'clubero-payment-reminders',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app/api/public/hooks/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'data_retention_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- FIX 2: mirror USING in WITH CHECK on player_seasons.seasons_update
DROP POLICY IF EXISTS seasons_update ON public.player_seasons;

CREATE POLICY seasons_update ON public.player_seasons
  FOR UPDATE
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