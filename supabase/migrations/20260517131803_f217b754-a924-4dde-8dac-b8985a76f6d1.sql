DROP FUNCTION IF EXISTS public.get_member_invite_info(text);

CREATE FUNCTION public.get_member_invite_info(_token text)
RETURNS TABLE(
  email text,
  role app_role,
  kind text,
  used boolean,
  expired boolean,
  suggested_first_name text,
  suggested_last_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mi.email,
    mi.role,
    CASE
      WHEN mi.parent_for_player_id IS NOT NULL THEN 'parent'
      WHEN mi.player_id IS NOT NULL THEN 'player'
      ELSE 'member'
    END AS kind,
    (mi.used_at IS NOT NULL) AS used,
    (mi.expires_at < now()) AS expired,
    CASE
      WHEN mi.player_id IS NOT NULL THEN p.first_name
      WHEN mi.parent_for_player_id IS NOT NULL THEN
        NULLIF(split_part(COALESCE(pp.full_name, ''), ' ', 1), '')
      ELSE NULL
    END AS suggested_first_name,
    CASE
      WHEN mi.player_id IS NOT NULL THEN p.last_name
      WHEN mi.parent_for_player_id IS NOT NULL THEN
        NULLIF(regexp_replace(COALESCE(pp.full_name, ''), '^\S+\s*', ''), '')
      ELSE NULL
    END AS suggested_last_name
  FROM public.member_invites mi
  LEFT JOIN public.players p ON p.id = mi.player_id
  LEFT JOIN LATERAL (
    SELECT pp2.full_name
    FROM public.player_parents pp2
    WHERE pp2.player_id = mi.parent_for_player_id
      AND (mi.email IS NULL OR lower(pp2.email) = lower(mi.email))
    ORDER BY pp2.created_at ASC
    LIMIT 1
  ) pp ON true
  WHERE mi.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_invite_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_member_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.member_invites%ROWTYPE;
  v_user uuid := auth.uid();
  v_first text;
  v_last text;
  v_full text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.member_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite'; END IF;
  IF v_invite.used_at IS NOT NULL THEN RAISE EXCEPTION 'Invite already used'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;

  SELECT first_name, last_name, full_name INTO v_first, v_last, v_full
  FROM public.profiles WHERE id = v_user;

  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES (v_invite.club_id, v_user, v_invite.role)
  ON CONFLICT DO NOTHING;

  IF v_invite.player_id IS NOT NULL THEN
    UPDATE public.players
      SET user_id = v_user,
          first_name = COALESCE(NULLIF(v_first, ''), first_name),
          last_name = COALESCE(NULLIF(v_last, ''), last_name)
      WHERE id = v_invite.player_id AND user_id IS NULL;
    IF v_invite.team_id IS NOT NULL THEN
      INSERT INTO public.team_members (team_id, user_id, player_id, role)
      VALUES (v_invite.team_id, v_user, v_invite.player_id, v_invite.role)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF v_invite.parent_for_player_id IS NOT NULL THEN
    UPDATE public.player_parents
      SET parent_user_id = v_user,
          full_name = COALESCE(
            NULLIF(trim(COALESCE(v_full, concat_ws(' ', v_first, v_last))), ''),
            full_name
          )
      WHERE player_id = v_invite.parent_for_player_id
        AND parent_user_id IS NULL
        AND (email IS NULL OR lower(email) = lower(v_invite.email));
  END IF;

  UPDATE public.member_invites SET used_at = now() WHERE id = v_invite.id;
  RETURN v_invite.club_id;
END;
$$;