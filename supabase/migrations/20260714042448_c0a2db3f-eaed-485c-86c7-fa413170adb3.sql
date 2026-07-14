CREATE TABLE public.product_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  category text NOT NULL,
  action_type text NOT NULL,
  resource_type text,
  resource_id uuid,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','warning','failure')),
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_activity_club_idx ON public.product_activity_log (club_id, created_at DESC);
CREATE INDEX product_activity_category_idx ON public.product_activity_log (category, created_at DESC);
CREATE INDEX product_activity_status_idx ON public.product_activity_log (status, created_at DESC) WHERE status <> 'success';
CREATE INDEX product_activity_action_idx ON public.product_activity_log (action_type, created_at DESC);
CREATE INDEX product_activity_actor_idx ON public.product_activity_log (actor_user_id, created_at DESC);

GRANT SELECT ON public.product_activity_log TO authenticated;
GRANT ALL ON public.product_activity_log TO service_role;

ALTER TABLE public.product_activity_log ENABLE ROW LEVEL SECURITY;

-- Superadmins only can read. No INSERT/UPDATE/DELETE policies => only service_role can write.
CREATE POLICY pal_select_super ON public.product_activity_log
  FOR SELECT TO authenticated
  USING (public.has_super_admin(auth.uid()));