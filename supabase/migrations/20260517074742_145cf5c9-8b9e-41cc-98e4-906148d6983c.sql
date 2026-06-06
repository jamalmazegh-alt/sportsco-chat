-- Superadmin audit log table
CREATE TABLE public.superadmin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  club_id uuid,
  metadata jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_superadmin_audit_actor ON public.superadmin_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_superadmin_audit_target ON public.superadmin_audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX idx_superadmin_audit_created ON public.superadmin_audit_logs(created_at DESC);

ALTER TABLE public.superadmin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read; no one can update/delete (immutable audit)
CREATE POLICY "superadmin_audit_select_super"
  ON public.superadmin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_super_admin(auth.uid()));

-- Insert path is the security definer function below (no direct insert policy needed,
-- but we add a restrictive one to allow service_role + the function to work).
CREATE POLICY "superadmin_audit_no_direct_insert"
  ON public.superadmin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Secure logging function: re-checks role before inserting
CREATE OR REPLACE FUNCTION public.log_superadmin_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _club_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_super_admin(v_user) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  INSERT INTO public.superadmin_audit_logs
    (actor_user_id, action, target_type, target_id, club_id, metadata, ip, user_agent)
  VALUES
    (v_user, _action, _target_type, _target_id, _club_id, _metadata, _ip, _user_agent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Platform-wide stats for the super admin dashboard
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.has_super_admin(v_user) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  SELECT jsonb_build_object(
    'clubs_total', (SELECT count(*) FROM public.clubs),
    'clubs_active', (
      SELECT count(*) FROM public.clubs c
      WHERE public.club_has_active_subscription(c.id)
    ),
    'users_total', (SELECT count(*) FROM public.profiles),
    'subs_active', (
      SELECT count(*) FROM public.subscriptions
      WHERE status IN ('active','past_due')
        AND (current_period_end IS NULL OR current_period_end > now())
    ),
    'subs_trialing', (
      SELECT count(*) FROM public.subscriptions
      WHERE status = 'trialing' AND trial_end > now()
    ),
    'subs_expiring_7d', (
      SELECT count(*) FROM public.subscriptions
      WHERE (
        (status = 'trialing' AND trial_end BETWEEN now() AND now() + interval '7 days')
        OR (status IN ('active','past_due') AND current_period_end BETWEEN now() AND now() + interval '7 days')
      )
    ),
    'events_total', (SELECT count(*) FROM public.events WHERE deleted_at IS NULL),
    'events_30d', (SELECT count(*) FROM public.events WHERE created_at > now() - interval '30 days' AND deleted_at IS NULL),
    'convocations_total', (SELECT count(*) FROM public.convocations),
    'convocations_30d', (SELECT count(*) FROM public.convocations WHERE created_at > now() - interval '30 days'),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;