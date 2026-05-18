
ALTER TABLE public.member_invites
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

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
      WHEN mi.player_id IS NOT NULL THEN COALESCE(NULLIF(mi.first_name, ''), p.first_name)
      WHEN mi.parent_for_player_id IS NOT NULL THEN
        COALESCE(NULLIF(mi.first_name, ''), NULLIF(split_part(COALESCE(pp.full_name, ''), ' ', 1), ''))
      ELSE NULLIF(mi.first_name, '')
    END AS suggested_first_name,
    CASE
      WHEN mi.player_id IS NOT NULL THEN COALESCE(NULLIF(mi.last_name, ''), p.last_name)
      WHEN mi.parent_for_player_id IS NOT NULL THEN
        COALESCE(NULLIF(mi.last_name, ''), NULLIF(regexp_replace(COALESCE(pp.full_name, ''), '^\S+\s*', ''), ''))
      ELSE NULLIF(mi.last_name, '')
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
