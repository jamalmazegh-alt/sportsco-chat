-- 1) Add referee columns FIRST (needed by helpers below)
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS referee_user_id uuid,
  ADD COLUMN IF NOT EXISTS referee_name text;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_referee
  ON public.tournament_matches(referee_user_id)
  WHERE referee_user_id IS NOT NULL;

-- 2) Collaborators table
DO $$ BEGIN
  CREATE TYPE public.tournament_collaborator_role AS ENUM ('co_organizer', 'referee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tournament_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  role public.tournament_collaborator_role NOT NULL,
  email text NOT NULL,
  display_name text,
  user_id uuid,
  invitation_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, role, email)
);

CREATE INDEX IF NOT EXISTS idx_tournament_collab_tournament ON public.tournament_collaborators(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_collab_user ON public.tournament_collaborators(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_collab_email ON public.tournament_collaborators(lower(email));

DROP TRIGGER IF EXISTS trg_tournament_collab_updated ON public.tournament_collaborators;
CREATE TRIGGER trg_tournament_collab_updated
BEFORE UPDATE ON public.tournament_collaborators
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tournament_collaborators ENABLE ROW LEVEL SECURITY;

-- 3) Helpers
CREATE OR REPLACE FUNCTION public.is_tournament_co_organizer(_user_id uuid, _tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_collaborators c
    WHERE c.tournament_id = _tournament_id
      AND c.role = 'co_organizer'
      AND c.user_id = _user_id
      AND c.accepted_at IS NOT NULL
      AND c.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_referee(_user_id uuid, _tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_collaborators c
    WHERE c.tournament_id = _tournament_id
      AND c.role = 'referee'
      AND c.user_id = _user_id
      AND c.accepted_at IS NOT NULL
      AND c.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_match_referee(_user_id uuid, _match_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.id = _match_id AND m.referee_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tournament(_user_id uuid, _tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament_id
      AND (
        (t.club_id IS NOT NULL AND (
          has_club_role(_user_id, t.club_id, 'admin'::app_role)
          OR has_club_role(_user_id, t.club_id, 'dirigeant'::app_role)
        ))
        OR (t.club_id IS NULL AND t.created_by = _user_id)
        OR has_super_admin(_user_id)
        OR public.is_tournament_co_organizer(_user_id, _tournament_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_owner(_user_id uuid, _tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament_id
      AND (
        (t.club_id IS NOT NULL AND (
          has_club_role(_user_id, t.club_id, 'admin'::app_role)
          OR has_club_role(_user_id, t.club_id, 'dirigeant'::app_role)
        ))
        OR (t.club_id IS NULL AND t.created_by = _user_id)
        OR has_super_admin(_user_id)
      )
  );
$$;

-- 4) RLS for collaborators
DROP POLICY IF EXISTS tournament_collab_select ON public.tournament_collaborators;
CREATE POLICY tournament_collab_select ON public.tournament_collaborators
  FOR SELECT TO authenticated
  USING (
    public.is_tournament_owner(auth.uid(), tournament_id)
    OR public.is_tournament_co_organizer(auth.uid(), tournament_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS tournament_collab_write ON public.tournament_collaborators;
CREATE POLICY tournament_collab_write ON public.tournament_collaborators
  FOR ALL TO authenticated
  USING (public.is_tournament_owner(auth.uid(), tournament_id))
  WITH CHECK (public.is_tournament_owner(auth.uid(), tournament_id));

-- 5) Match policies: referee can update assigned match + insert events
DROP POLICY IF EXISTS tournament_matches_referee_update ON public.tournament_matches;
CREATE POLICY tournament_matches_referee_update ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (
    can_manage_tournament(auth.uid(), tournament_id)
    OR referee_user_id = auth.uid()
  )
  WITH CHECK (
    can_manage_tournament(auth.uid(), tournament_id)
    OR referee_user_id = auth.uid()
  );

DROP POLICY IF EXISTS tournament_match_events_referee_write ON public.tournament_match_events;
CREATE POLICY tournament_match_events_referee_write ON public.tournament_match_events
  FOR ALL TO authenticated
  USING (
    can_manage_tournament(auth.uid(), (SELECT m.tournament_id FROM public.tournament_matches m WHERE m.id = match_id))
    OR public.is_match_referee(auth.uid(), match_id)
  )
  WITH CHECK (
    can_manage_tournament(auth.uid(), (SELECT m.tournament_id FROM public.tournament_matches m WHERE m.id = match_id))
    OR public.is_match_referee(auth.uid(), match_id)
  );

-- 6) Accept invite RPC
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite public.tournament_collaborators%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  SELECT * INTO v_invite FROM public.tournament_collaborators
   WHERE invitation_token = _token AND revoked_at IS NULL LIMIT 1;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or revoked invitation'; END IF;
  IF v_invite.accepted_at IS NOT NULL AND v_invite.user_id IS NOT NULL AND v_invite.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Invitation already accepted by another user';
  END IF;
  UPDATE public.tournament_collaborators
     SET user_id = v_user_id,
         accepted_at = COALESCE(accepted_at, now()),
         email = COALESCE(v_user_email, email)
   WHERE id = v_invite.id;
  RETURN jsonb_build_object('tournament_id', v_invite.tournament_id, 'role', v_invite.role);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tournament_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tournament_invite(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_invite_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tournament_id', c.tournament_id,
    'tournament_name', t.name,
    'tournament_slug', t.slug,
    'role', c.role,
    'email', c.email,
    'accepted', c.accepted_at IS NOT NULL,
    'revoked', c.revoked_at IS NOT NULL
  )
  FROM public.tournament_collaborators c
  JOIN public.tournaments t ON t.id = c.tournament_id
  WHERE c.invitation_token = _token LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_tournament_invite_by_token(text) TO anon, authenticated;