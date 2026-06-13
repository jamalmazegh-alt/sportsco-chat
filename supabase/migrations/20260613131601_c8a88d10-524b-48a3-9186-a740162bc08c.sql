
CREATE TABLE public.llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid,
  feature text NOT NULL,
  model text NOT NULL,
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_usage_user_feature_created_idx ON public.llm_usage (user_id, feature, created_at DESC);
GRANT INSERT ON public.llm_usage TO authenticated;
GRANT ALL ON public.llm_usage TO service_role;
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "llm_usage_superadmin_read" ON public.llm_usage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));
CREATE POLICY "llm_usage_self_insert" ON public.llm_usage FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE TABLE public.llm_cache (
  cache_key text PRIMARY KEY,
  feature text NOT NULL,
  locale text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.llm_cache TO service_role;
ALTER TABLE public.llm_cache ENABLE ROW LEVEL SECURITY;
-- No policies: server_role only via supabaseAdmin.
