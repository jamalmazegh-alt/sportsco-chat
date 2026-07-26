
CREATE OR REPLACE FUNCTION public.get_assignable_staff(p_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  role text,
  usual_team_name text,
  is_event_team_staff boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_team_id uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  SELECT t.club_id, e.team_id
    INTO v_club_id, v_team_id
  FROM public.events e
  JOIN public.teams t ON t.id = e.team_id
  WHERE e.id = p_event_id;

  IF v_club_id IS NULL THEN
    RETURN;
  END IF;

  -- Access guard: caller must be team staff of the event OR club admin/dirigeant.
  IF NOT (
    public.is_team_staff_of_event(p_event_id, v_caller)
    OR public.has_club_role_any(v_caller, v_club_id, ARRAY['admin','dirigeant']::text[])
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
    -- (a) All coaches/assistant_coaches of every non-deleted team in the club.
    tm AS (
      SELECT DISTINCT ON (tm.user_id)
        tm.user_id,
        tm.role::text                        AS role,
        t.name                               AS team_name,
        (tm.team_id = v_team_id)             AS is_event_team_staff
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = v_club_id
        AND t.deleted_at IS NULL
        AND tm.role IN ('coach','assistant_coach')
        AND tm.user_id IS NOT NULL
      ORDER BY tm.user_id,
        -- Prefer the event's team when a coach belongs to several teams.
        (tm.team_id = v_team_id) DESC,
        t.name ASC
    ),
    -- (b) club_members whose role/roles contain coach or assistant_coach.
    cm AS (
      SELECT
        m.user_id,
        CASE
          WHEN m.role::text = 'assistant_coach'
            OR ('assistant_coach' = ANY (COALESCE(m.roles, ARRAY[]::text[]))
                AND NOT ('coach' = ANY (COALESCE(m.roles, ARRAY[]::text[]))))
          THEN 'assistant_coach'
          ELSE 'coach'
        END AS role
      FROM public.club_members m
      WHERE m.club_id = v_club_id
        AND m.user_id IS NOT NULL
        AND (
          m.role::text IN ('coach','assistant_coach')
          OR 'coach' = ANY (COALESCE(m.roles, ARRAY[]::text[]))
          OR 'assistant_coach' = ANY (COALESCE(m.roles, ARRAY[]::text[]))
        )
    ),
    merged AS (
      SELECT
        tm.user_id,
        tm.role,
        tm.team_name         AS usual_team_name,
        tm.is_event_team_staff
      FROM tm
      UNION ALL
      SELECT
        cm.user_id,
        cm.role,
        NULL::text           AS usual_team_name,
        FALSE                AS is_event_team_staff
      FROM cm
      WHERE cm.user_id NOT IN (SELECT tm.user_id FROM tm)
    )
  SELECT DISTINCT ON (m.user_id)
    m.user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
      p.full_name,
      '—'
    )                              AS full_name,
    m.role,
    m.usual_team_name,
    m.is_event_team_staff
  FROM merged m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  ORDER BY m.user_id, m.is_event_team_staff DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_assignable_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assignable_staff(uuid) TO authenticated;
