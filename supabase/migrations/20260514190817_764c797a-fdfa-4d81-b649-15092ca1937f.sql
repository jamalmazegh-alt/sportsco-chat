CREATE OR REPLACE FUNCTION public.get_member_invite_info(_token text)
RETURNS TABLE(email text, role app_role, kind text, used boolean, expired boolean)
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
    (mi.expires_at < now()) AS expired
  FROM public.member_invites mi
  WHERE mi.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_invite_info(text) TO anon, authenticated;