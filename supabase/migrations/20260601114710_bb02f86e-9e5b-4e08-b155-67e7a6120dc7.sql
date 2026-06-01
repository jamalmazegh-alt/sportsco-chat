
ALTER TABLE public.club_payment_settings
  ADD COLUMN IF NOT EXISTS payment_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_reminder_offsets_days integer[] NOT NULL DEFAULT ARRAY[-7, -1, 3, 7]::integer[];

CREATE TABLE IF NOT EXISTS public.payment_reminder_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.payment_obligations(id) ON DELETE CASCADE,
  payment_item_id uuid NOT NULL REFERENCES public.payment_items(id) ON DELETE CASCADE,
  offset_days integer NOT NULL,
  recipient_email text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  sent_at timestamptz NOT NULL DEFAULT now(),
  triggered_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_reminder_log_uniq
  ON public.payment_reminder_log (obligation_id, offset_days, recipient_email);
CREATE INDEX IF NOT EXISTS payment_reminder_log_club_sent_idx
  ON public.payment_reminder_log (club_id, sent_at DESC);

GRANT SELECT ON public.payment_reminder_log TO authenticated;
GRANT ALL ON public.payment_reminder_log TO service_role;

ALTER TABLE public.payment_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prl_fin_admin_read" ON public.payment_reminder_log
  FOR SELECT TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

-- Cron: daily at 09:00 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('clubero-payment-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'clubero-payment-reminders',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app/api/public/hooks/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYXdtaHVudGFqcGllem1tZ3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTExMTMsImV4cCI6MjA5NDI4NzExM30.XsVPX_ZlN8QVZZB5dbWy8xLbcJo-mKG3D1LOd7uWOWs'
    ),
    body := '{}'::jsonb
  );
  $$
);
