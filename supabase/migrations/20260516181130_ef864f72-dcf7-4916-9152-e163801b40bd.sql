ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS cancellation_reason text,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;