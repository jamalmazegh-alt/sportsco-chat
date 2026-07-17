
CREATE TABLE IF NOT EXISTS public.email_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NULL,
  template_name TEXT NOT NULL,
  dispatch_type TEXT NOT NULL CHECK (dispatch_type IN ('initial','manual_resend','dlq_replay')),
  created_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_dispatches TO authenticated;
GRANT ALL ON public.email_dispatches TO service_role;

ALTER TABLE public.email_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_dispatches_read_superadmin"
  ON public.email_dispatches FOR SELECT
  TO authenticated
  USING (public.has_super_admin(auth.uid()));

CREATE POLICY "email_dispatches_read_club_admin"
  ON public.email_dispatches FOR SELECT
  TO authenticated
  USING (
    event_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.teams t ON t.id = e.team_id
      JOIN public.club_members cm ON cm.club_id = t.club_id
      WHERE e.id = email_dispatches.event_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin'::app_role,'coach'::app_role,'dirigeant'::app_role)
    )
  );

CREATE INDEX IF NOT EXISTS idx_email_dispatches_event ON public.email_dispatches(event_id);
CREATE INDEX IF NOT EXISTS idx_email_dispatches_created_at ON public.email_dispatches(created_at DESC);

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS dispatch_id UUID NULL REFERENCES public.email_dispatches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id UUID NULL,
  ADD COLUMN IF NOT EXISTS recipient_id UUID NULL,
  ADD COLUMN IF NOT EXISTS notification_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mismatch_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worker_build TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_email_send_log_dispatch_id ON public.email_send_log(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_event_id ON public.email_send_log(event_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_id, notification_type);

CREATE UNIQUE INDEX IF NOT EXISTS email_send_log_dispatch_recipient_success
  ON public.email_send_log (dispatch_id, recipient_id, notification_type)
  WHERE status IN ('sent','delivered')
    AND dispatch_id IS NOT NULL
    AND recipient_id IS NOT NULL
    AND notification_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_send_log_event_recipient_success_legacy
  ON public.email_send_log (event_id, recipient_id, notification_type)
  WHERE status IN ('sent','delivered')
    AND dispatch_id IS NULL
    AND event_id IS NOT NULL
    AND recipient_id IS NOT NULL
    AND notification_type IS NOT NULL;

ALTER TABLE public.email_send_state
  ADD COLUMN IF NOT EXISTS transactional_batch_size INT NULL,
  ADD COLUMN IF NOT EXISTS transactional_send_delay_ms INT NULL;

UPDATE public.email_send_state
   SET transactional_batch_size = COALESCE(transactional_batch_size, 1),
       transactional_send_delay_ms = COALESCE(transactional_send_delay_ms, 250),
       updated_at = now()
 WHERE id = 1;
