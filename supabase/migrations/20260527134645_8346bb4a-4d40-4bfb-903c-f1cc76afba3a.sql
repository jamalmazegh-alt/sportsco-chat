DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'process-email-queue'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id := v_jobid,
    schedule := '5 seconds',
    command := $cron$
    SELECT CASE
      WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
        THEN NULL
      WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
        OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
        THEN net.http_post(
          url := 'https://clubero.app/lovable/email/queue/process',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              SELECT decrypted_secret FROM vault.decrypted_secrets
              WHERE name = 'email_queue_service_role_key'
            )
          ),
          body := '{}'::jsonb
        )
      ELSE NULL
    END;
    $cron$
  );
END $$;
