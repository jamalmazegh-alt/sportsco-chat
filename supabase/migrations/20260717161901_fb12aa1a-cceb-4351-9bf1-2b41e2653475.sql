-- The application uses composite string identifiers for recipients such as
--   "player:<uuid>" or "parent:<uuid>:<email>"
-- which do not fit into a strict UUID column. This caused every send to
-- succeed at the provider but fail when inserting the "sent" row into
-- email_send_log (22P02 invalid input syntax for type uuid), which the
-- worker treated as a send failure and retried until DLQ.

ALTER TABLE public.email_send_log
  ALTER COLUMN recipient_id TYPE text USING recipient_id::text;