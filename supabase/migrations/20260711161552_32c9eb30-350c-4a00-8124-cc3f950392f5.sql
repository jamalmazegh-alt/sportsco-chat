-- =========================================================================
-- Support "View as" mode — Phase 1 schema
-- =========================================================================

-- Personas that a superadmin can simulate in a support session.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_view_persona') THEN
    CREATE TYPE public.support_view_persona AS ENUM (
      'club_admin',
      'coach',
      'player',
      'parent',
      'member'
    );
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- support_view_sessions
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_view_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  superadmin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  persona public.support_view_persona NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_view_sessions_superadmin_active_idx
  ON public.support_view_sessions (superadmin_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS support_view_sessions_target_idx
  ON public.support_view_sessions (target_user_id, club_id);

GRANT SELECT ON public.support_view_sessions TO authenticated;
GRANT ALL ON public.support_view_sessions TO service_role;

ALTER TABLE public.support_view_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_view_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins read own support sessions" ON public.support_view_sessions;
CREATE POLICY "Superadmins read own support sessions"
  ON public.support_view_sessions
  FOR SELECT
  TO authenticated
  USING (
    superadmin_id = auth.uid()
    AND public.has_super_admin(auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies: all writes go through SECURITY DEFINER RPCs.

-- -------------------------------------------------------------------------
-- support_view_actions (audit log)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_view_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.support_view_sessions(id) ON DELETE CASCADE,
  superadmin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 100),
  target_kind TEXT,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_view_actions_session_idx
  ON public.support_view_actions (session_id, created_at DESC);

GRANT SELECT ON public.support_view_actions TO authenticated;
GRANT ALL ON public.support_view_actions TO service_role;

ALTER TABLE public.support_view_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_view_actions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins read own support actions" ON public.support_view_actions;
CREATE POLICY "Superadmins read own support actions"
  ON public.support_view_actions
  FOR SELECT
  TO authenticated
  USING (
    superadmin_id = auth.uid()
    AND public.has_super_admin(auth.uid())
  );

-- =========================================================================
-- RPCs (SECURITY DEFINER, pinned search_path, fully qualified refs)
-- =========================================================================

-- create_support_view_session
CREATE OR REPLACE FUNCTION public.create_support_view_session(
  _target_user_id UUID,
  _club_id UUID,
  _persona public.support_view_persona,
  _reason TEXT,
  _duration_minutes INTEGER DEFAULT 30
)
RETURNS public.support_view_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _caller UUID := auth.uid();
  _duration INTEGER := LEAST(GREATEST(COALESCE(_duration_minutes, 30), 1), 60);
  _persona_ok BOOLEAN := false;
  _session public.support_view_sessions;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_super_admin(_caller) THEN
    RAISE EXCEPTION 'forbidden: superadmin required' USING ERRCODE = '42501';
  END IF;

  IF _target_user_id IS NULL OR _club_id IS NULL OR _persona IS NULL THEN
    RAISE EXCEPTION 'missing_parameters' USING ERRCODE = '22023';
  END IF;

  IF _target_user_id = _caller THEN
    RAISE EXCEPTION 'cannot_impersonate_self' USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(_reason, '')) = '' OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id) THEN
    RAISE EXCEPTION 'club_not_found' USING ERRCODE = '22023';
  END IF;

  -- Validate persona against real DB roles
  IF _persona = 'club_admin' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id AND m.user_id = _target_user_id
        AND m.role IN ('owner', 'admin')
    ) INTO _persona_ok;
  ELSIF _persona = 'coach' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = _club_id AND tm.user_id = _target_user_id
        AND tm.role = 'coach'
    ) INTO _persona_ok;
  ELSIF _persona = 'player' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.club_id = _club_id AND p.user_id = _target_user_id
    ) INTO _persona_ok;
  ELSIF _persona = 'parent' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.player_parents pp
      JOIN public.players p ON p.id = pp.player_id
      WHERE p.club_id = _club_id AND pp.parent_user_id = _target_user_id
    ) INTO _persona_ok;
  ELSIF _persona = 'member' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id AND m.user_id = _target_user_id
    ) INTO _persona_ok;
  END IF;

  IF NOT _persona_ok THEN
    RAISE EXCEPTION 'persona_not_matching_real_role' USING ERRCODE = '42501';
  END IF;

  -- Auto-close any prior active session for this superadmin
  UPDATE public.support_view_sessions s
     SET ended_at = now()
   WHERE s.superadmin_id = _caller
     AND s.ended_at IS NULL;

  INSERT INTO public.support_view_sessions (
    superadmin_id, target_user_id, club_id, persona, reason,
    started_at, expires_at
  ) VALUES (
    _caller, _target_user_id, _club_id, _persona, btrim(_reason),
    now(), now() + make_interval(mins => _duration)
  )
  RETURNING * INTO _session;

  INSERT INTO public.support_view_actions (session_id, superadmin_id, action, target_kind, target_id, metadata)
  VALUES (_session.id, _caller, 'session.create', 'club', _club_id,
          jsonb_build_object('persona', _persona, 'target_user_id', _target_user_id));

  RETURN _session;
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_view_session(UUID, UUID, public.support_view_persona, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_view_session(UUID, UUID, public.support_view_persona, TEXT, INTEGER) TO authenticated;

-- end_support_view_session
CREATE OR REPLACE FUNCTION public.end_support_view_session(_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _caller UUID := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_super_admin(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_view_sessions
     SET ended_at = COALESCE(ended_at, now())
   WHERE id = _session_id
     AND superadmin_id = _caller;
END;
$$;

REVOKE ALL ON FUNCTION public.end_support_view_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_support_view_session(UUID) TO authenticated;

-- get_active_support_view_session (server-side truth)
CREATE OR REPLACE FUNCTION public.get_active_support_view_session(_session_id UUID)
RETURNS public.support_view_sessions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  _caller UUID := auth.uid();
  _row public.support_view_sessions;
BEGIN
  IF _caller IS NULL OR NOT public.has_super_admin(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
    FROM public.support_view_sessions
   WHERE id = _session_id
     AND superadmin_id = _caller
     AND ended_at IS NULL
     AND expires_at > now();

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found_or_expired' USING ERRCODE = '42704';
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_support_view_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_support_view_session(UUID) TO authenticated;

-- log_support_view_action
CREATE OR REPLACE FUNCTION public.log_support_view_action(
  _session_id UUID,
  _action TEXT,
  _target_kind TEXT DEFAULT NULL,
  _target_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _caller UUID := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_super_admin(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.support_view_sessions
     WHERE id = _session_id
       AND superadmin_id = _caller
       AND ended_at IS NULL
       AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'session_not_found_or_expired' USING ERRCODE = '42704';
  END IF;

  INSERT INTO public.support_view_actions (session_id, superadmin_id, action, target_kind, target_id, metadata)
  VALUES (_session_id, _caller, _action, _target_kind, _target_id, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.log_support_view_action(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_support_view_action(UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;
