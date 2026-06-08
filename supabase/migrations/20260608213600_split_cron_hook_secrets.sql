CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_payment_secret text;
  v_trial_secret text;
  v_social_secret text;
BEGIN
  SELECT decrypted_secret INTO v_payment_secret
  FROM vault.decrypted_secrets
  WHERE name = 'payment_reminders_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO v_trial_secret
  FROM vault.decrypted_secrets
  WHERE name = 'trial_reminders_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO v_social_secret
  FROM vault.decrypted_secrets
  WHERE name = 'social_sync_secret'
  LIMIT 1;

  v_payment_secret := COALESCE(
    v_payment_secret,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'data_retention_secret' LIMIT 1)
  );
  v_trial_secret := COALESCE(
    v_trial_secret,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'data_retention_secret' LIMIT 1)
  );
  v_social_secret := COALESCE(
    v_social_secret,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'data_retention_secret' LIMIT 1)
  );

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'clubero-payment-reminders';

  PERFORM cron.schedule(
    'clubero-payment-reminders',
    '0 9 * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://www.clubero.app/api/public/hooks/payment-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-payment-reminders-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$, COALESCE(v_payment_secret, ''))
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

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'social-sync-hourly';

  PERFORM cron.schedule(
    'social-sync-hourly',
    '0 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://www.clubero.app/api/public/social/sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-social-sync-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$, COALESCE(v_social_secret, ''))
  );
END $$;
