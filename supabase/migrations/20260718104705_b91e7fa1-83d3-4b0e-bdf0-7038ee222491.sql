-- Add 'club_admins' rule type

ALTER TABLE public.club_group_rules DROP CONSTRAINT IF EXISTS club_group_rules_type_chk;
ALTER TABLE public.club_group_rules ADD CONSTRAINT club_group_rules_type_chk CHECK (
  rule_type IN (
    'team_players','team_parents','team_educators',
    'category_educators','club_educators','club_staff','club_members','club_admins'
  )
);

ALTER TABLE public.club_group_rules DROP CONSTRAINT IF EXISTS club_group_rules_params_chk;
ALTER TABLE public.club_group_rules ADD CONSTRAINT club_group_rules_params_chk CHECK (
  (rule_type IN ('team_players','team_parents','team_educators')
    AND team_id IS NOT NULL AND category IS NULL)
  OR (rule_type = 'category_educators'
    AND category IS NOT NULL AND team_id IS NULL)
  OR (rule_type IN ('club_educators','club_staff','club_members','club_admins')
    AND team_id IS NULL AND category IS NULL)
);

CREATE OR REPLACE FUNCTION public.resolve_audience_members(_club_id uuid, _spec jsonb)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sel jsonb;
  sel_type text;
  uids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), _club_id))
  ) THEN
    RETURN;
  END IF;

  IF _club_id IS NULL OR _spec IS NULL OR jsonb_typeof(_spec) <> 'array' THEN
    RETURN;
  END IF;

  FOR sel IN SELECT * FROM jsonb_array_elements(_spec)
  LOOP
    sel_type := sel->>'type';

    IF sel_type = 'team_players' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT p.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.players p ON p.id = tm.player_id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.players p ON p.id = tm.player_id
        JOIN public.player_parents pp ON pp.player_id = p.id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NULL
          AND pp.parent_user_id IS NOT NULL
      );

    ELSIF sel_type = 'team_parents' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.player_parents pp ON pp.player_id = tm.player_id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND pp.parent_user_id IS NOT NULL
      );

    ELSIF sel_type = 'team_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND tm.user_id IS NOT NULL
          AND tm.role::text = ANY (ARRAY['coach','assistant_coach'])
      );

    ELSIF sel_type = 'category_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE t.club_id = _club_id
          AND t.age_group = (sel->>'category')
          AND tm.user_id IS NOT NULL
          AND tm.role::text = ANY (ARRAY['coach','assistant_coach'])
      );

    ELSIF sel_type = 'club_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND (cm.roles && ARRAY['coach','assistant_coach']::text[])
      );

    ELSIF sel_type = 'club_staff' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND (cm.roles && ARRAY['admin','coach','assistant_coach','staff','tournament_manager','dirigeant']::text[])
      );

    ELSIF sel_type = 'club_admins' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND (cm.roles && ARRAY['admin']::text[])
      );

    ELSIF sel_type = 'club_members' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND cm.user_id IS NOT NULL
      );

    ELSIF sel_type = 'convoked_players' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT p.user_id
        FROM public.convocations c
        JOIN public.events e ON e.id = c.event_id
        JOIN public.teams t ON t.id = e.team_id
        JOIN public.players p ON p.id = c.player_id
        WHERE e.id = (sel->>'event_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.convocations c
        JOIN public.events e ON e.id = c.event_id
        JOIN public.teams t ON t.id = e.team_id
        JOIN public.players p ON p.id = c.player_id
        JOIN public.player_parents pp ON pp.player_id = p.id
        WHERE e.id = (sel->>'event_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NULL
          AND pp.parent_user_id IS NOT NULL
      );

    ELSIF sel_type = 'convoked_parents' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.convocations c
        JOIN public.events e ON e.id = c.event_id
        JOIN public.teams t ON t.id = e.team_id
        JOIN public.player_parents pp ON pp.player_id = c.player_id
        WHERE e.id = (sel->>'event_id')::uuid
          AND t.club_id = _club_id
          AND pp.parent_user_id IS NOT NULL
      );

    ELSIF sel_type = 'club_group' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_group_members cgm
        JOIN public.club_groups g ON g.id = cgm.group_id
        JOIN public.club_members cm ON cm.id = cgm.member_id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND cm.club_id = _club_id
          AND cm.user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT p.user_id
        FROM public.club_group_rules r
        JOIN public.club_groups g ON g.id = r.group_id
        JOIN public.team_members tm ON tm.team_id = r.team_id
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.players p ON p.id = tm.player_id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND r.rule_type = 'team_players'
          AND t.club_id = _club_id
          AND p.user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.club_group_rules r
        JOIN public.club_groups g ON g.id = r.group_id
        JOIN public.team_members tm ON tm.team_id = r.team_id
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.players p ON p.id = tm.player_id
        JOIN public.player_parents pp ON pp.player_id = p.id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND r.rule_type = 'team_players'
          AND t.club_id = _club_id
          AND p.user_id IS NULL
          AND pp.parent_user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.club_group_rules r
        JOIN public.club_groups g ON g.id = r.group_id
        JOIN public.team_members tm ON tm.team_id = r.team_id
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.player_parents pp ON pp.player_id = tm.player_id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND r.rule_type = 'team_parents'
          AND t.club_id = _club_id
          AND pp.parent_user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.club_group_rules r
        JOIN public.club_groups g ON g.id = r.group_id
        JOIN public.team_members tm ON tm.team_id = r.team_id
        JOIN public.teams t ON t.id = tm.team_id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND r.rule_type = 'team_educators'
          AND t.club_id = _club_id
          AND tm.user_id IS NOT NULL
          AND tm.role::text = ANY (ARRAY['coach','assistant_coach'])
      );
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.club_group_rules r
        JOIN public.club_groups g ON g.id = r.group_id
        JOIN public.teams t ON t.age_group = r.category AND t.club_id = _club_id
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND r.rule_type = 'category_educators'
          AND tm.user_id IS NOT NULL
          AND tm.role::text = ANY (ARRAY['coach','assistant_coach'])
      );
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_group_rules r
        JOIN public.club_groups g ON g.id = r.group_id
        JOIN public.club_members cm ON cm.club_id = _club_id
        WHERE g.id = (sel->>'group_id')::uuid
          AND g.club_id = _club_id
          AND g.is_active
          AND cm.user_id IS NOT NULL
          AND (
            (r.rule_type = 'club_members')
            OR (r.rule_type = 'club_staff' AND cm.roles && ARRAY['admin','coach','assistant_coach','staff','tournament_manager','dirigeant']::text[])
            OR (r.rule_type = 'club_educators' AND cm.roles && ARRAY['coach','assistant_coach']::text[])
            OR (r.rule_type = 'club_admins' AND cm.roles && ARRAY['admin']::text[])
          )
      );

    ELSIF sel_type = 'selected_members' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND cm.user_id::text = ANY (
            SELECT jsonb_array_elements_text(coalesce(sel->'user_ids', '[]'::jsonb))
          )
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT DISTINCT u FROM unnest(uids) AS u WHERE u IS NOT NULL;
END;
$function$;