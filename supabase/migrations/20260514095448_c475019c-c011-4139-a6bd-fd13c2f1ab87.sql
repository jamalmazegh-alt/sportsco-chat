-- Club invites table
CREATE TABLE public.club_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'player',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.club_invites ENABLE ROW LEVEL SECURITY;

-- Admins of the club can manage invites
CREATE POLICY club_invites_admin_all ON public.club_invites
  FOR ALL TO authenticated
  USING (has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (has_club_role(auth.uid(), club_id, 'admin'::app_role));

-- Any authenticated user can look up an invite by token (to validate at signup)
CREATE POLICY club_invites_select_authenticated ON public.club_invites
  FOR SELECT TO authenticated
  USING (true);

-- Redemption function: adds current user to the club with the invite's role
CREATE OR REPLACE FUNCTION public.redeem_club_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.club_invites%ROWTYPE;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.club_invites WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'Invite fully used';
  END IF;

  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES (v_invite.club_id, v_user, v_invite.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.club_invites SET uses_count = uses_count + 1 WHERE id = v_invite.id;

  RETURN v_invite.club_id;
END;
$$;