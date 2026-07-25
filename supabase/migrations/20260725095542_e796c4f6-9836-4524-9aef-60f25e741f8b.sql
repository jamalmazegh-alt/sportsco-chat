ALTER TABLE public.suppressed_emails
  ADD COLUMN IF NOT EXISTS bounce_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_bounce_at timestamptz;

-- Backfill existing rows so historical suppressions stay blocked (>= threshold).
UPDATE public.suppressed_emails
   SET bounce_count = GREATEST(bounce_count, 3)
 WHERE reason = 'bounce';