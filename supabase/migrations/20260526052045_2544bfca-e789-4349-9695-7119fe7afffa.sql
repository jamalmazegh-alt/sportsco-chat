CREATE TABLE IF NOT EXISTS public.superadmin_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL,
  import_type text NOT NULL CHECK (import_type IN ('players','coaches','planning')),
  file_name text,
  rows_total integer NOT NULL DEFAULT 0,
  rows_imported integer NOT NULL DEFAULT 0,
  ia_used boolean NOT NULL DEFAULT false,
  invitations_sent boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('success','partial','failed')),
  error_log jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_imports_club ON public.superadmin_imports(club_id, created_at DESC);

ALTER TABLE public.superadmin_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS superadmin_imports_super_all ON public.superadmin_imports;
CREATE POLICY superadmin_imports_super_all ON public.superadmin_imports
  FOR ALL TO authenticated
  USING (public.has_super_admin(auth.uid()))
  WITH CHECK (public.has_super_admin(auth.uid()));