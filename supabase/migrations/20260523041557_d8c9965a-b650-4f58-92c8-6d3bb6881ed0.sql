
-- ============================================================
-- PART 1 — club_members.roles[]
-- ============================================================

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';

-- Aggregate any future multi-row users into a single row (currently none, but safe)
WITH agg AS (
  SELECT club_id, user_id, array_agg(DISTINCT role::text) AS roles
  FROM public.club_members
  GROUP BY club_id, user_id
)
UPDATE public.club_members cm
SET roles = agg.roles
FROM agg
WHERE cm.club_id = agg.club_id AND cm.user_id = agg.user_id;

-- Replace unique(club_id,user_id,role) with unique(club_id,user_id)
ALTER TABLE public.club_members
  DROP CONSTRAINT IF EXISTS club_members_club_id_user_id_role_key;
ALTER TABLE public.club_members
  ADD CONSTRAINT club_members_club_id_user_id_key UNIQUE (club_id, user_id);

-- Validation: non-empty + only valid values
ALTER TABLE public.club_members
  DROP CONSTRAINT IF EXISTS club_members_roles_valid;
ALTER TABLE public.club_members
  ADD CONSTRAINT club_members_roles_valid CHECK (
    array_length(roles, 1) >= 1
    AND roles <@ ARRAY['admin','coach','assistant_coach','staff','tournament_manager','dirigeant','parent','player']::text[]
  );

-- Keep deprecated `role` column in sync with roles[0]
CREATE OR REPLACE FUNCTION public.sync_club_members_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.roles IS NULL OR array_length(NEW.roles, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  -- pick first known app_role value as the legacy single role
  IF NEW.roles[1] IN ('admin','coach','parent','player','dirigeant') THEN
    NEW.role := NEW.roles[1]::app_role;
  ELSIF 'admin' = ANY(NEW.roles) THEN
    NEW.role := 'admin'::app_role;
  ELSIF 'coach' = ANY(NEW.roles) THEN
    NEW.role := 'coach'::app_role;
  ELSE
    NEW.role := 'dirigeant'::app_role; -- staff / assistant_coach / tournament_manager map to dirigeant
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_club_members_role ON public.club_members;
CREATE TRIGGER trg_sync_club_members_role
  BEFORE INSERT OR UPDATE OF roles ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_club_members_role();

-- ============================================================
-- Rewrite has_club_role to read from roles[]
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_club_role(_user_id uuid, _club_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id
      AND club_id = _club_id
      AND _role::text = ANY(roles)
  );
$$;

-- Text variant for new role values not in app_role enum
CREATE OR REPLACE FUNCTION public.has_club_role_text(_user_id uuid, _club_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id
      AND club_id = _club_id
      AND _role = ANY(roles)
  );
$$;

-- ============================================================
-- PART 2 — tournament_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tournament_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('tournament_admin','staff','referee')),
  assigned_match_ids uuid[] NOT NULL DEFAULT '{}',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  invite_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tournament_members_tournament ON public.tournament_members(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_members_user ON public.tournament_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_members_token ON public.tournament_members(invite_token);

ALTER TABLE public.tournament_members ENABLE ROW LEVEL SECURITY;

-- Helper: is the user a member of this tournament with any given role?
CREATE OR REPLACE FUNCTION public.is_tournament_member(_user_id uuid, _tournament_id uuid, _role text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_members
    WHERE tournament_id = _tournament_id
      AND user_id = _user_id
      AND joined_at IS NOT NULL
      AND (_role IS NULL OR role = _role)
  );
$$;

-- Helper: is the user a tournament admin (direct OR club admin/tournament_manager of owning club OR superadmin)
CREATE OR REPLACE FUNCTION public.can_manage_tournament_members(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_super_admin(_user_id)
    OR public.is_tournament_member(_user_id, _tournament_id, 'tournament_admin')
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = _tournament_id
        AND t.club_id IS NOT NULL
        AND (
          public.has_club_role(_user_id, t.club_id, 'admin'::app_role)
          OR public.has_club_role_text(_user_id, t.club_id, 'tournament_manager')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = _tournament_id
        AND t.club_id IS NULL
        AND t.created_by = _user_id
    );
$$;

-- Helper: is the user a referee assigned to this match?
CREATE OR REPLACE FUNCTION public.is_tournament_referee_for_match(_user_id uuid, _match_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_matches m
    JOIN public.tournament_members tm
      ON tm.tournament_id = m.tournament_id
     AND tm.user_id = _user_id
     AND tm.role = 'referee'
     AND tm.joined_at IS NOT NULL
    WHERE m.id = _match_id
      AND m.id = ANY(tm.assigned_match_ids)
  );
$$;

-- RLS policies on tournament_members
CREATE POLICY tm_select_admin ON public.tournament_members
  FOR SELECT TO authenticated
  USING (
    public.can_manage_tournament_members(auth.uid(), tournament_id)
    OR public.is_tournament_member(auth.uid(), tournament_id, 'staff')
    OR (user_id = auth.uid())
  );

CREATE POLICY tm_insert_admin ON public.tournament_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_tournament_members(auth.uid(), tournament_id));

CREATE POLICY tm_update_admin ON public.tournament_members
  FOR UPDATE TO authenticated
  USING (public.can_manage_tournament_members(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament_members(auth.uid(), tournament_id));

CREATE POLICY tm_delete_admin ON public.tournament_members
  FOR DELETE TO authenticated
  USING (public.can_manage_tournament_members(auth.uid(), tournament_id));

-- Public token-based lookup via SECURITY DEFINER RPC (no RLS to anon)
CREATE OR REPLACE FUNCTION public.get_tournament_member_by_token(_token uuid)
RETURNS TABLE (
  id uuid, tournament_id uuid, email text, first_name text, last_name text,
  role text, joined_at timestamptz, tournament_name text, tournament_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tm.id, tm.tournament_id, tm.email, tm.first_name, tm.last_name,
         tm.role, tm.joined_at, t.name, t.slug
  FROM public.tournament_members tm
  JOIN public.tournaments t ON t.id = tm.tournament_id
  WHERE tm.invite_token = _token;
$$;
GRANT EXECUTE ON FUNCTION public.get_tournament_member_by_token(uuid) TO anon, authenticated;

-- Accept invite RPC
CREATE OR REPLACE FUNCTION public.accept_tournament_member_invite(_token uuid, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.tournament_members
  SET user_id = _user_id, joined_at = now(), updated_at = now()
  WHERE invite_token = _token AND joined_at IS NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_tournament_member_invite(uuid, uuid) TO authenticated;

-- Allow referees to update score of their assigned matches
DROP POLICY IF EXISTS tournament_matches_referee_update ON public.tournament_matches;
CREATE POLICY tournament_matches_referee_update ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (
    referee_user_id = auth.uid()
    OR public.is_tournament_referee_for_match(auth.uid(), id)
  )
  WITH CHECK (
    referee_user_id = auth.uid()
    OR public.is_tournament_referee_for_match(auth.uid(), id)
  );

-- ============================================================
-- PART 3 — permission_changes_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.permission_changes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text,
  scope text NOT NULL CHECK (scope IN ('club','tournament')),
  scope_id uuid NOT NULL,
  old_roles text[],
  new_roles text[],
  action text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_permlog_scope ON public.permission_changes_log(scope, scope_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_permlog_target ON public.permission_changes_log(target_id);

ALTER TABLE public.permission_changes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY permlog_select_club ON public.permission_changes_log
  FOR SELECT TO authenticated
  USING (
    public.has_super_admin(auth.uid())
    OR (scope = 'club' AND public.has_club_role(auth.uid(), scope_id, 'admin'::app_role))
    OR (scope = 'tournament' AND public.can_manage_tournament_members(auth.uid(), scope_id))
  );

-- Inserts only via SECURITY DEFINER server fns (no direct INSERT policy)
-- No UPDATE/DELETE policies — append-only.

-- updated_at trigger for tournament_members
CREATE OR REPLACE FUNCTION public.tournament_members_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_tm_updated ON public.tournament_members;
CREATE TRIGGER trg_tm_updated BEFORE UPDATE ON public.tournament_members
  FOR EACH ROW EXECUTE FUNCTION public.tournament_members_touch_updated();
