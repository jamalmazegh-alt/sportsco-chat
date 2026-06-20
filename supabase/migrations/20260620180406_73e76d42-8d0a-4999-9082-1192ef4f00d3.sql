CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'clubero-trial-reminders';

  PERFORM cron.schedule(
    'clubero-trial-reminders',
    '0 9 * * *',
    $job$
      SELECT net.http_post(
        url := 'https://www.clubero.app/api/public/hooks/trial-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-trial-reminders-secret', COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'trial_reminders_secret' LIMIT 1),
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'data_retention_secret' LIMIT 1),
            ''
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
END $$;