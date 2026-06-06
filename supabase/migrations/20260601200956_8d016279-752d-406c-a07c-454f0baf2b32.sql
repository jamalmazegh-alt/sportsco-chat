-- 1) Rate limit table for public endpoints (fixed hourly window)
CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  ip text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, route, window_start)
);

GRANT ALL ON public.public_rate_limits TO service_role;

ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (used by public route handlers) accesses this table.

CREATE INDEX IF NOT EXISTS idx_public_rate_limits_window
  ON public.public_rate_limits (window_start);

-- 2) Partial unique index on payment_transactions.external_reference so the
--    Stripe webhook self-heal (upsert by session id) can never create duplicates,
--    even if it races the original pending insert.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_external_reference_uidx
  ON public.payment_transactions (external_reference)
  WHERE external_reference IS NOT NULL;
