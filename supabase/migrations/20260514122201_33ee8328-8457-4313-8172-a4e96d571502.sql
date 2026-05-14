-- 1. member_invites
CREATE TABLE public.member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  parent_for_player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  email text,
  phone text,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_invites_token ON public.member_invites(token);
CREATE INDEX idx_member_invites_club ON public.member_invites(club_id);

ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_invites_admin_all" ON public.member_invites
  FOR ALL TO authenticated
  USING (has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY "member_invites_select_authenticated" ON public.member_invites
  FOR SELECT TO authenticated
  USING (true);

-- 2. verification_codes
CREATE TABLE public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms','email','whatsapp')),
  target text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_codes_user ON public.verification_codes(user_id);

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verification_codes_own" ON public.verification_codes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. profiles.phone_verified_at
ALTER TABLE public.profiles ADD COLUMN phone_verified_at timestamptz;

-- 4. clubs.default_channels
ALTER TABLE public.clubs
  ADD COLUMN default_channels jsonb NOT NULL DEFAULT '["email"]'::jsonb;

-- 5. Redeem function for member invites
CREATE OR REPLACE FUNCTION public.redeem_member_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.member_invites%ROWTYPE;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.member_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite'; END IF;
  IF v_invite.used_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;

  -- Add to club
  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES (v_invite.club_id, v_user, v_invite.role)
  ON CONFLICT DO NOTHING;

  -- Link player or parent
  IF v_invite.player_id IS NOT NULL THEN
    UPDATE public.players SET user_id = v_user WHERE id = v_invite.player_id AND user_id IS NULL;
    IF v_invite.team_id IS NOT NULL THEN
      INSERT INTO public.team_members (team_id, user_id, player_id, role)
      VALUES (v_invite.team_id, v_user, v_invite.player_id, v_invite.role)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF v_invite.parent_for_player_id IS NOT NULL THEN
    UPDATE public.player_parents
      SET parent_user_id = v_user
      WHERE player_id = v_invite.parent_for_player_id
        AND parent_user_id IS NULL
        AND (email IS NULL OR lower(email) = lower(v_invite.email));
  END IF;

  UPDATE public.member_invites SET used_at = now() WHERE id = v_invite.id;
  RETURN v_invite.club_id;
END;
$$;