CREATE TABLE IF NOT EXISTS public.push_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  targets_count int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS push_dispatch_log_kind_ref_uniq
  ON public.push_dispatch_log(kind, ref_id);

GRANT SELECT ON public.push_dispatch_log TO authenticated;
GRANT ALL ON public.push_dispatch_log TO service_role;

ALTER TABLE public.push_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_dispatch_log_no_select" ON public.push_dispatch_log
  FOR SELECT TO authenticated USING (false);