
-- 1) Table club_group_rules
CREATE TABLE IF NOT EXISTS public.club_group_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.club_groups(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  team_id uuid NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  category text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT club_group_rules_type_chk CHECK (
    rule_type IN (
      'team_players','team_parents','team_educators',
      'category_educators','club_educators','club_staff','club_members'
    )
  ),
  CONSTRAINT club_group_rules_params_chk CHECK (
    (rule_type IN ('team_players','team_parents','team_educators')
      AND team_id IS NOT NULL AND category IS NULL)
    OR (rule_type = 'category_educators'
      AND category IS NOT NULL AND team_id IS NULL)
    OR (rule_type IN ('club_educators','club_staff','club_members')
      AND team_id IS NULL AND category IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS club_group_rules_unique_idx
  ON public.club_group_rules (
    group_id,
    rule_type,
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category, '')
  );

CREATE INDEX IF NOT EXISTS club_group_rules_group_id_idx
  ON public.club_group_rules (group_id);

-- 2) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_group_rules TO authenticated;
GRANT ALL ON public.club_group_rules TO service_role;

-- 3) RLS staff-only (via le club du groupe parent)
ALTER TABLE public.club_group_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_group_rules_staff_select ON public.club_group_rules;
CREATE POLICY club_group_rules_staff_select ON public.club_group_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.club_groups g
      WHERE g.id = club_group_rules.group_id
        AND public.is_club_staff(auth.uid(), g.club_id)
    )
  );

DROP POLICY IF EXISTS club_group_rules_staff_insert ON public.club_group_rules;
CREATE POLICY club_group_rules_staff_insert ON public.club_group_rules
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_groups g
      WHERE g.id = club_group_rules.group_id
        AND public.is_club_staff(auth.uid(), g.club_id)
    )
    AND (
      team_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.club_groups g ON g.id = club_group_rules.group_id
        WHERE t.id = club_group_rules.team_id
          AND t.club_id = g.club_id
      )
    )
  );

DROP POLICY IF EXISTS club_group_rules_staff_delete ON public.club_group_rules;
CREATE POLICY club_group_rules_staff_delete ON public.club_group_rules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.club_groups g
      WHERE g.id = club_group_rules.group_id
        AND public.is_club_staff(auth.uid(), g.club_id)
    )
  );

-- 4) Étendre le resolver : le type 'club_group' inclut désormais aussi la résolution
-- dynamique des règles attachées au groupe. Pas de récursion : les règles ne peuvent
-- pas référencer un autre club_group (contrainte CHECK sur rule_type).
CREATE OR REPLACE FUNCTION public.resolve_audience_members(_club_id uuid, _spec jsonb)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 VOLATILE
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
          AND tm.role IN ('coach','assistant_coach')
      );

    ELSIF sel_type = 'category_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE t.club_id = _club_id
          AND t.age_group = (sel->>'category')
          AND tm.user_id IS NOT NULL
          AND tm.role IN ('coach','assistant_coach')
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
      -- Membres individuels
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
      -- Règles dynamiques : joueurs d'équipes
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
      -- Parents d'équipes
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
      -- Éducateurs d'équipes
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
          AND tm.role IN ('coach','assistant_coach')
      );
      -- Éducateurs d'une catégorie
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
          AND tm.role IN ('coach','assistant_coach')
      );
      -- Tous les éducateurs / staff / membres du club (règles club-wide)
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
