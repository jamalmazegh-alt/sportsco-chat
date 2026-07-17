ALTER TABLE public.email_send_state
  ADD COLUMN IF NOT EXISTS transactional_retry_after_until timestamptz;

COMMENT ON COLUMN public.email_send_state.transactional_retry_after_until IS
  'Per-queue cooldown for the transactional_emails queue only (e.g. recipient_mismatch burst backoff). Does not block auth_emails, unlike retry_after_until which is used for provider-wide 429s.';