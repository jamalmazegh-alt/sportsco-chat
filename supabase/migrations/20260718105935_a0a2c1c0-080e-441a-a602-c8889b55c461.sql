
CREATE OR REPLACE FUNCTION public.preview_group_rule_details(_club_id uuid, _rule jsonb)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  kind text,
  subtitle text,
  roles text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rt text;
  team uuid;
BEGIN
  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), _club_id))
  ) THEN
    RETURN;
  END IF;

  IF _rule IS NULL OR jsonb_typeof(_rule) <> 'object' THEN
    RETURN;
  END IF;

  rt := _rule->>'type';
  team := NULLIF(_rule->>'team_id', '')::uuid;

  IF rt = 'team_players' THEN
    RETURN QUERY
      SELECT DISTINCT ON (p.id)
        p.user_id,
        NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '') AS full_name,
        coalesce(p.email, au.email) AS email,
        'player'::text AS kind,
        NULL::text AS subtitle,
        CASE WHEN p.user_id IS NOT NULL THEN ARRAY['player']::text[] ELSE ARRAY[]::text[] END
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      JOIN public.players p ON p.id = tm.player_id
      LEFT JOIN auth.users au ON au.id = p.user_id
      WHERE t.id = team
        AND t.club_id = _club_id
        AND p.user_id IS NOT NULL
      ORDER BY p.id;

  ELSIF rt = 'team_parents' THEN
    RETURN QUERY
      SELECT DISTINCT ON (pp.id)
        pp.parent_user_id AS user_id,
        coalesce(
          NULLIF(trim(pp.full_name), ''),
          pr.full_name,
          NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), '')
        ) AS full_name,
        coalesce(NULLIF(trim(pp.email), ''), au.email) AS email,
        'parent'::text AS kind,
        ('Parent de ' || NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '')) AS subtitle,
        ARRAY['parent']::text[]
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      JOIN public.players p ON p.id = tm.player_id
      JOIN public.player_parents pp ON pp.player_id = p.id
      LEFT JOIN public.profiles pr ON pr.id = pp.parent_user_id
      LEFT JOIN auth.users au ON au.id = pp.parent_user_id
      WHERE t.id = team
        AND t.club_id = _club_id
        AND (pp.parent_user_id IS NOT NULL OR NULLIF(trim(pp.email), '') IS NOT NULL)
      ORDER BY pp.id;

  ELSE
    -- Fallback: use resolve_audience_members + profile/club_members lookup
    RETURN QUERY
      WITH ids AS (
        SELECT r.user_id FROM public.resolve_audience_members(_club_id, jsonb_build_array(_rule)) r
      )
      SELECT
        i.user_id,
        coalesce(pr.full_name, NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), '')) AS full_name,
        au.email,
        'member'::text AS kind,
        NULL::text AS subtitle,
        coalesce(cm.roles, CASE WHEN cm.role IS NOT NULL THEN ARRAY[cm.role]::text[] ELSE ARRAY[]::text[] END)
      FROM ids i
      LEFT JOIN public.profiles pr ON pr.id = i.user_id
      LEFT JOIN auth.users au ON au.id = i.user_id
      LEFT JOIN public.club_members cm ON cm.user_id = i.user_id AND cm.club_id = _club_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_group_rule_details(uuid, jsonb) TO authenticated, service_role;
