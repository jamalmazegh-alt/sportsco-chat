-- redeem_club_invite_v2 lisait profiles.email, colonne inexistante (l'e-mail vit dans auth.users).
CREATE OR REPLACE FUNCTION public.redeem_club_invite_v2(
  _token text,
  _mode text DEFAULT 'self',
  _birth_date date DEFAULT NULL,
  _phone text DEFAULT NULL,
  _license text DEFAULT NULL,
  _child_first_name text DEFAULT NULL,
  _child_last_name text DEFAULT NULL,
  _child_birth_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite public.club_invites%ROWTYPE;
  v_user uuid := auth.uid();
  v_role app_role;
  v_first text;
  v_last text;
  v_email text;
  v_player uuid;
  v_existing_uid uuid;
  v_p_first text;
  v_p_last text;
  v_p_birth date;
  v_already_member boolean;
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

  v_already_member := EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_invite.club_id AND user_id = v_user
  );

  IF NOT v_already_member
     AND v_invite.max_uses IS NOT NULL
     AND v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'Invite fully used';
  END IF;

  IF v_invite.team_id IS NOT NULL THEN
    PERFORM 1 FROM public.teams t
      WHERE t.id = v_invite.team_id AND t.club_id = v_invite.club_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invite team mismatch';
    END IF;
  END IF;

  SELECT p.first_name, p.last_name, u.email
    INTO v_first, v_last, v_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.id = v_user;

  v_role := v_invite.role;
  IF _mode = 'child' THEN
    v_role := 'parent'::app_role;
  END IF;

  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES (v_invite.club_id, v_user, v_role)
  ON CONFLICT (club_id, user_id) DO UPDATE
    SET roles = ARRAY(
      SELECT DISTINCT unnest(public.club_members.roles || v_role::text)
    );

  IF v_invite.team_id IS NOT NULL THEN
    IF _mode = 'child' THEN
      v_p_first := nullif(btrim(coalesce(_child_first_name, '')), '');
      v_p_last := nullif(btrim(coalesce(_child_last_name, '')), '');
      v_p_birth := _child_birth_date;
      IF v_p_first IS NULL OR v_p_last IS NULL THEN
        RAISE EXCEPTION 'Child name required';
      END IF;
    ELSE
      v_p_first := nullif(btrim(coalesce(v_first, '')), '');
      v_p_last := nullif(btrim(coalesce(v_last, '')), '');
      v_p_birth := _birth_date;
      IF v_p_first IS NULL OR v_p_last IS NULL THEN
        RAISE EXCEPTION 'Missing profile name';
      END IF;
    END IF;

    IF _mode <> 'child' THEN
      SELECT id INTO v_player FROM public.players
       WHERE club_id = v_invite.club_id AND user_id = v_user AND deleted_at IS NULL
       LIMIT 1;
    END IF;

    IF v_player IS NULL AND v_p_birth IS NOT NULL THEN
      SELECT id, user_id INTO v_player, v_existing_uid FROM public.players
       WHERE club_id = v_invite.club_id
         AND deleted_at IS NULL
         AND public.normalize_name(first_name) = public.normalize_name(v_p_first)
         AND public.normalize_name(last_name) = public.normalize_name(v_p_last)
         AND birth_date = v_p_birth
       LIMIT 1;

      IF FOUND THEN
        IF v_existing_uid IS NOT NULL AND v_existing_uid IS DISTINCT FROM v_user THEN
          RAISE EXCEPTION 'player_already_linked'
            USING HINT = 'This roster entry is already linked to another account.';
        END IF;
      ELSE
        v_player := NULL;
      END IF;
    END IF;

    IF v_player IS NULL THEN
      INSERT INTO public.players (club_id, user_id, first_name, last_name, birth_date, phone, email, license_number)
      VALUES (
        v_invite.club_id,
        CASE WHEN _mode = 'child' THEN NULL ELSE v_user END,
        v_p_first,
        v_p_last,
        v_p_birth,
        CASE WHEN _mode = 'child' THEN NULL ELSE nullif(btrim(coalesce(_phone, '')), '') END,
        CASE WHEN _mode = 'child' THEN NULL ELSE v_email END,
        nullif(btrim(coalesce(_license, '')), '')
      )
      RETURNING id INTO v_player;
    ELSE
      UPDATE public.players SET
        user_id = CASE WHEN _mode = 'child' THEN user_id ELSE coalesce(user_id, v_user) END,
        birth_date = coalesce(birth_date, v_p_birth),
        phone = CASE WHEN _mode = 'child' THEN phone ELSE coalesce(phone, nullif(btrim(coalesce(_phone, '')), '')) END,
        license_number = coalesce(license_number, nullif(btrim(coalesce(_license, '')), ''))
      WHERE id = v_player;
    END IF;

    IF _mode = 'child' THEN
      INSERT INTO public.player_parents (player_id, parent_user_id, full_name, phone, email)
      VALUES (
        v_player,
        v_user,
        btrim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')),
        nullif(btrim(coalesce(_phone, '')), ''),
        v_email
      )
      ON CONFLICT (player_id, parent_user_id) DO NOTHING;
    END IF;

    INSERT INTO public.team_members (team_id, player_id, role)
    VALUES (v_invite.team_id, v_player, 'player'::app_role)
    ON CONFLICT (team_id, player_id, role) DO NOTHING;
  END IF;

  IF NOT v_already_member THEN
    UPDATE public.club_invites SET uses_count = uses_count + 1 WHERE id = v_invite.id;
  END IF;

  RETURN v_invite.club_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date) TO authenticated;