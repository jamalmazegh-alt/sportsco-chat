ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS club_id uuid;
CREATE INDEX IF NOT EXISTS idx_audit_logs_club_id ON public.audit_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);

DROP POLICY IF EXISTS audit_logs_select_actor ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;

CREATE POLICY audit_logs_select_actor_or_admin
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  actor_user_id = auth.uid()
  OR (club_id IS NOT NULL AND public.has_club_role(auth.uid(), club_id, 'admin'::app_role))
  OR public.has_super_admin(auth.uid())
);

CREATE POLICY audit_logs_insert_self
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (actor_user_id = auth.uid());