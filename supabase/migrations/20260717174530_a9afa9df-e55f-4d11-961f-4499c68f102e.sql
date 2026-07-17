
ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'sent'::text,
    'suppressed'::text,
    'failed'::text,
    'bounced'::text,
    'complained'::text,
    'dlq'::text,
    'mismatch_deferred'::text,
    'skipped_duplicate'::text,
    'delivered'::text
  ]));
