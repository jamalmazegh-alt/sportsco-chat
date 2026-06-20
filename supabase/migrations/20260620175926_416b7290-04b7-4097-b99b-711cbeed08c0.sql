CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_trial_secret text;
BEGIN
  SELECT decrypted_secret INTO v_trial_secret
  FROM vault.decrypted_secrets
  WHERE name = 'trial_reminders_secret'
  LIMIT 1;

  v_trial_secret := COALESCE(
    v_trial_secret,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'data_retention_secret' LIMIT 1)
  );

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'clubero-trial-reminders';

  PERFORM cron.schedule(
    'clubero-trial-reminders',
    '0 9 * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://www.clubero.app/api/public/hooks/trial-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-trial-reminders-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$, COALESCE(v_trial_secret, ''))
  );
END $$;