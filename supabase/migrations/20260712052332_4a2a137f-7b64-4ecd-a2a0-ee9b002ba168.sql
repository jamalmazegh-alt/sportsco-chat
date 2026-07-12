
-- Table de log pour la purge quotidienne des documents de stages (RGPD).
CREATE TABLE public.club_camp_document_purge_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  camp_id UUID NULL REFERENCES public.club_camps(id) ON DELETE SET NULL,
  files_deleted INT NOT NULL DEFAULT 0,
  rows_deleted INT NOT NULL DEFAULT 0,
  error TEXT NULL,
  details JSONB NULL
);

GRANT SELECT ON public.club_camp_document_purge_log TO authenticated;
GRANT ALL ON public.club_camp_document_purge_log TO service_role;

ALTER TABLE public.club_camp_document_purge_log ENABLE ROW LEVEL SECURITY;

-- Admins/dirigeants du club peuvent lire les logs de leur club (audit).
CREATE POLICY "Managers can read purge log of their club"
ON public.club_camp_document_purge_log
FOR SELECT
TO authenticated
USING (
  camp_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.club_camps c
    JOIN public.club_members m ON m.club_id = c.club_id
    WHERE c.id = club_camp_document_purge_log.camp_id
      AND m.user_id = auth.uid()
      AND (
        m.role IN ('admin','dirigeant')
        OR 'admin' = ANY(COALESCE(m.roles, ARRAY[]::text[]))
        OR 'dirigeant' = ANY(COALESCE(m.roles, ARRAY[]::text[]))
      )
  )
);

CREATE INDEX idx_camp_purge_log_camp_time
  ON public.club_camp_document_purge_log(camp_id, run_at DESC);
