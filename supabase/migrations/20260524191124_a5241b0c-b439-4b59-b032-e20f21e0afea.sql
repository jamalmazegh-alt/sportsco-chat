DO $$
BEGIN
  PERFORM cron.unschedule('coach-insights-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
