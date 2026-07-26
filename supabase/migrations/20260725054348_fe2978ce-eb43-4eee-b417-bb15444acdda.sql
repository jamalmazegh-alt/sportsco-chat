CREATE OR REPLACE FUNCTION public._resolve_audience_subjects(
  _club_id uuid,
  _audiences jsonb,
  _manual_member_ids uuid[]
)
RETURNS TABLE(subject_kind text, member_id uuid, subject_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH aud AS (
    SELECT
      (elem->>'audience_type')::text           AS audience_type,
      NULLIF(elem->>'team_id','')::uuid        AS team_id,
      NULLIF(elem->>'season_id','')::uuid      AS season_id,
      NULLIF(elem->>'category_label','')::text AS category_label,
      NULLIF(elem->>'event_id','')::uuid       AS event_id,
      NULLIF(elem->>'group_id','')::uuid       AS group_id
    FROM jsonb_array_elements(COALESCE(_audiences, '[]'::jsonb)) elem
  ),
  manual_ids AS (
    SELECT unnest(COALESCE(_manual_member_ids, ARRAY[]::uuid[])) AS manual_player_id
  ),
  -- Équipes qui contiennent au moins un joueur d'une catégorie ciblée
  category_teams AS (
    SELECT DISTINCT tm.team_id
      FROM aud a
      JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.team_members tm ON tm.player_id = ps.player_id
      JOIN public.teams t ON t.id = tm.team_id AND t.club_id = _club_id
     WHERE a.audience_type IN ('joueurs_categorie','parents_categorie')
  ),
  players_ AS (
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN public.team_members tm ON tm.team_id = a.team_id
      JOIN public.players p ON p.id = tm.player_id
     WHERE a.audience_type = 'joueurs_equipe'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.players p ON p.id = ps.player_id
     WHERE a.audience_type = 'joueurs_categorie'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN public.convocations c ON c.event_id = a.event_id
      JOIN public.players p ON p.id = c.player_id
     WHERE a.audience_type = 'joueurs_convoques'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT DISTINCT p.id AS player_id
      FROM aud a
      JOIN manual_ids mi ON TRUE
      JOIN public.players p ON p.id = mi.manual_player_id
     WHERE a.audience_type = 'selection_manuelle'
       AND p.club_id = _club_id AND p.deleted_at IS NULL
  ),
  users_ AS (
    SELECT DISTINCT pp.parent_user_id AS user_id
      FROM aud a
      JOIN public.team_members tm ON tm.team_id = a.team_id
      JOIN public.players p ON p.id = tm.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_equipe'
    UNION
    SELECT DISTINCT pp.parent_user_id AS user_id
      FROM aud a
      JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id
      JOIN public.player_seasons ps ON ps.club_id = _club_id
                                   AND ps.season_label = s.label
                                   AND lower(ps.category) = lower(a.category_label)
      JOIN public.players p ON p.id = ps.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_categorie'
    UNION
    SELECT DISTINCT pp.parent_user_id AS user_id
      FROM aud a
      JOIN public.convocations c ON c.event_id = a.event_id
      JOIN public.players p ON p.id = c.player_id AND p.club_id = _club_id AND p.deleted_at IS NULL
      JOIN public.player_parents pp ON pp.player_id = p.id AND pp.parent_user_id IS NOT NULL
     WHERE a.audience_type = 'parents_convoques'
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.club_members cm ON cm.club_id = _club_id
     WHERE a.audience_type = 'educateurs'
       AND public.has_club_role_any(cm.user_id, _club_id, ARRAY['coach','assistant_coach'])
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.club_members cm ON cm.club_id = _club_id
     WHERE a.audience_type = 'dirigeants'
       AND public.has_club_role_any(cm.user_id, _club_id, ARRAY['admin','dirigeant'])
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.club_group_members cgm ON cgm.group_id = a.group_id
      JOIN public.club_members cm ON cm.id = cgm.member_id AND cm.club_id = _club_id
     WHERE a.audience_type = 'groupe_personnalise'
       AND cm.user_id IS NOT NULL
    UNION
    SELECT DISTINCT tm.user_id AS user_id
      FROM aud a
      JOIN public.teams t ON t.id = a.team_id AND t.club_id = _club_id
      JOIN public.team_members tm ON tm.team_id = a.team_id
     WHERE a.audience_type = 'staff_equipe'
       AND tm.user_id IS NOT NULL
       AND tm.role IN ('coach','dirigeant')
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM aud a
      JOIN public.teams t ON t.id = a.team_id AND t.club_id = _club_id
      JOIN public.club_members cm ON cm.club_id = t.club_id
     WHERE a.audience_type = 'staff_equipe'
       AND cm.user_id IS NOT NULL
       AND public.has_club_role_any(cm.user_id, t.club_id, ARRAY['admin','dirigeant'])
    -- NEW: catégorie ciblée → staff des équipes de la catégorie (coach/dirigeant team_members)
    UNION
    SELECT DISTINCT tm.user_id AS user_id
      FROM category_teams ct
      JOIN public.team_members tm ON tm.team_id = ct.team_id
     WHERE tm.user_id IS NOT NULL
       AND tm.role IN ('coach','dirigeant')
    -- NEW: catégorie ciblée → admins/dirigeants du club (aligné avec staff_equipe)
    UNION
    SELECT DISTINCT cm.user_id AS user_id
      FROM category_teams ct
      JOIN public.teams t ON t.id = ct.team_id
      JOIN public.club_members cm ON cm.club_id = t.club_id
     WHERE cm.user_id IS NOT NULL
       AND public.has_club_role_any(cm.user_id, t.club_id, ARRAY['admin','dirigeant'])
  )
  SELECT 'player'::text AS subject_kind, p.player_id AS member_id, NULL::uuid AS subject_user_id
  FROM players_ p
  UNION ALL
  SELECT 'user'::text AS subject_kind, NULL::uuid AS member_id, u.user_id AS subject_user_id
  FROM users_ u
  WHERE u.user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public._resolve_audience_subjects(uuid, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._resolve_audience_subjects(uuid, jsonb, uuid[]) TO authenticated, service_role;