-- Schedule hourly social media sync via pg_cron + pg_net.
-- Calls /api/public/social/sync on the stable production URL with x-cron-secret header.
DO $$
DECLARE
  v_secret text;
BEGIN
  -- Read shared cron secret from Vault if present
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'SOCIAL_SYNC_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  -- Unschedule existing job if present
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'social-sync-hourly';

  -- Schedule new job: every hour at minute 0
  PERFORM cron.schedule(
    'social-sync-hourly',
    '0 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://project--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app/api/public/social/sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$, COALESCE(v_secret, ''))
  );
END $$;