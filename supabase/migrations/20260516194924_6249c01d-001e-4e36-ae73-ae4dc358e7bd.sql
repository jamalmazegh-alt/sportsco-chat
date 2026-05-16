CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove prior schedule if any
DO $$
BEGIN
  PERFORM cron.unschedule('clubero-trial-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'clubero-trial-reminders',
  '0 9 * * *', -- daily at 09:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://project--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app/api/public/hooks/trial-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYXdtaHVudGFqcGllem1tZ3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTExMTMsImV4cCI6MjA5NDI4NzExM30.XsVPX_ZlN8QVZZB5dbWy8xLbcJo-mKG3D1LOd7uWOWs'
    ),
    body := '{}'::jsonb
  );
  $$
);