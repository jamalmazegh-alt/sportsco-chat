
CREATE OR REPLACE FUNCTION public.resolve_audience_members(
  _club_id uuid,
  _spec jsonb
) RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sel jsonb;
  sel_type text;
BEGIN
  IF _club_id IS NULL OR _spec IS NULL OR jsonb_typeof(_spec) <> 'array' THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _resolved_users (uid uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _resolved_users;

  FOR sel IN SELECT * FROM jsonb_array_elements(_spec)
  LOOP
    sel_type := sel->>'type';

    IF sel_type = 'team_players' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT p.user_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      JOIN public.players p ON p.id = tm.player_id
      WHERE t.id = (sel->>'team_id')::uuid
        AND t.club_id = _club_id
        AND p.user_id IS NOT NULL
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'team_parents' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT pp.parent_user_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      JOIN public.player_parents pp ON pp.player_id = tm.player_id
      WHERE t.id = (sel->>'team_id')::uuid
        AND t.club_id = _club_id
        AND pp.parent_user_id IS NOT NULL
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'team_educators' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT tm.user_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.id = (sel->>'team_id')::uuid
        AND t.club_id = _club_id
        AND tm.user_id IS NOT NULL
        AND tm.role IN ('coach','assistant_coach')
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'category_educators' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT tm.user_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = _club_id
        AND t.age_group = (sel->>'category')
        AND tm.user_id IS NOT NULL
        AND tm.role IN ('coach','assistant_coach')
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'club_educators' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT cm.user_id
      FROM public.club_members cm
      WHERE cm.club_id = _club_id
        AND (cm.roles && ARRAY['coach','assistant_coach']::text[])
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'club_staff' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT cm.user_id
      FROM public.club_members cm
      WHERE cm.club_id = _club_id
        AND (cm.roles && ARRAY['admin','coach','assistant_coach','staff','tournament_manager','dirigeant']::text[])
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'club_members' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT cm.user_id
      FROM public.club_members cm
      WHERE cm.club_id = _club_id
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'convoked_players' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT p.user_id
      FROM public.convocations c
      JOIN public.events e ON e.id = c.event_id
      JOIN public.teams t ON t.id = e.team_id
      JOIN public.players p ON p.id = c.player_id
      WHERE e.id = (sel->>'event_id')::uuid
        AND t.club_id = _club_id
        AND p.user_id IS NOT NULL
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'convoked_parents' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT pp.parent_user_id
      FROM public.convocations c
      JOIN public.events e ON e.id = c.event_id
      JOIN public.teams t ON t.id = e.team_id
      JOIN public.player_parents pp ON pp.player_id = c.player_id
      WHERE e.id = (sel->>'event_id')::uuid
        AND t.club_id = _club_id
        AND pp.parent_user_id IS NOT NULL
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'club_group' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT cm.user_id
      FROM public.club_group_members cgm
      JOIN public.club_groups g ON g.id = cgm.group_id
      JOIN public.club_members cm ON cm.id = cgm.member_id
      WHERE g.id = (sel->>'group_id')::uuid
        AND g.club_id = _club_id
        AND g.is_active
        AND cm.club_id = _club_id
      ON CONFLICT DO NOTHING;

    ELSIF sel_type = 'selected_members' THEN
      INSERT INTO _resolved_users(uid)
      SELECT DISTINCT cm.user_id
      FROM public.club_members cm
      WHERE cm.club_id = _club_id
        AND cm.user_id::text = ANY (
          SELECT jsonb_array_elements_text(coalesce(sel->'user_ids', '[]'::jsonb))
        )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN QUERY SELECT uid FROM _resolved_users WHERE uid IS NOT NULL;
END;
$$;
