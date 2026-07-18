
-- =========================================================
-- LOT 0 : Groupes personnalisés du club + resolver d'audience
-- =========================================================

-- 1) club_groups : groupes personnalisés (CODIR, jeunes arbitres, etc.)
CREATE TABLE public.club_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_groups_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);
CREATE INDEX club_groups_club_id_idx ON public.club_groups(club_id);
CREATE UNIQUE INDEX club_groups_club_name_unique ON public.club_groups(club_id, lower(btrim(name))) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_groups TO authenticated;
GRANT ALL ON public.club_groups TO service_role;

ALTER TABLE public.club_groups ENABLE ROW LEVEL SECURITY;

-- Staff-only: lecture ET écriture. Membre standard: 0 ligne.
CREATE POLICY "club_groups_staff_select"
  ON public.club_groups FOR SELECT TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id));

CREATE POLICY "club_groups_staff_insert"
  ON public.club_groups FOR INSERT TO authenticated
  WITH CHECK (public.is_club_staff(auth.uid(), club_id) AND created_by = auth.uid());

CREATE POLICY "club_groups_staff_update"
  ON public.club_groups FOR UPDATE TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id))
  WITH CHECK (public.is_club_staff(auth.uid(), club_id));

CREATE POLICY "club_groups_staff_delete"
  ON public.club_groups FOR DELETE TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id));

-- 2) club_group_members : composition
CREATE TABLE public.club_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.club_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_id)
);
CREATE INDEX club_group_members_group_id_idx ON public.club_group_members(group_id);
CREATE INDEX club_group_members_member_id_idx ON public.club_group_members(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_group_members TO authenticated;
GRANT ALL ON public.club_group_members TO service_role;

ALTER TABLE public.club_group_members ENABLE ROW LEVEL SECURITY;

-- Staff-only via le club du groupe.
CREATE POLICY "club_group_members_staff_select"
  ON public.club_group_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_groups g
    WHERE g.id = club_group_members.group_id
      AND public.is_club_staff(auth.uid(), g.club_id)
  ));

CREATE POLICY "club_group_members_staff_insert"
  ON public.club_group_members FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.club_groups g
      JOIN public.club_members m ON m.id = club_group_members.member_id
      WHERE g.id = club_group_members.group_id
        AND m.club_id = g.club_id
        AND public.is_club_staff(auth.uid(), g.club_id)
    )
  );

CREATE POLICY "club_group_members_staff_delete"
  ON public.club_group_members FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_groups g
    WHERE g.id = club_group_members.group_id
      AND public.is_club_staff(auth.uid(), g.club_id)
  ));

-- 3) updated_at trigger sur club_groups
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_groups_set_updated_at ON public.club_groups;
CREATE TRIGGER club_groups_set_updated_at
  BEFORE UPDATE ON public.club_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Resolver d'audience central
-- _spec = jsonb array of selectors. Each element:
--   {"type":"team_players", "team_id":"..."}
--   {"type":"team_parents", "team_id":"..."}
--   {"type":"team_educators", "team_id":"..."}
--   {"type":"category_educators", "category":"U15"}
--   {"type":"club_educators"}
--   {"type":"club_staff"}
--   {"type":"club_members"}
--   {"type":"convoked_players", "event_id":"..."}
--   {"type":"convoked_parents", "event_id":"..."}
--   {"type":"club_group", "group_id":"..."}
--   {"type":"selected_members", "user_ids":["...","..."]}
--
-- Retourne auth user_ids uniques, membres actifs du club uniquement.
-- Toute référence à un team/group/event ne relevant PAS de _club_id est
-- silencieusement ignorée (fuite cross-club impossible).
CREATE OR REPLACE FUNCTION public.resolve_audience_members(
  _club_id uuid,
  _spec jsonb
) RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
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
      -- Filtre : ne garde que ceux qui sont membres du club
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

REVOKE ALL ON FUNCTION public.resolve_audience_members(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_audience_members(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_audience_members(uuid, jsonb) TO service_role;
