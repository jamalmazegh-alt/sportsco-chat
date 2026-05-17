ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS convocation_sent_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS convocation_last_sent_at timestamptz;