
-- 1) can_view_team: also allow users (or parents) tied to a convocation of any event of this team.
CREATE OR REPLACE FUNCTION public.can_view_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = _team_id
        AND (
          public.has_club_role(_user_id, t.club_id, 'admin'::app_role)
          OR public.has_club_role(_user_id, t.club_id, 'dirigeant'::app_role)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = _team_id AND tm.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.player_parents pp ON pp.player_id = tm.player_id
      WHERE tm.team_id = _team_id AND pp.parent_user_id = _user_id
    )
    -- Convoked player (linked account) for any event of this team
    OR EXISTS (
      SELECT 1
      FROM public.convocations c
      JOIN public.events e ON e.id = c.event_id
      JOIN public.players p ON p.id = c.player_id
      WHERE e.team_id = _team_id AND p.user_id = _user_id
    )
    -- Parent of a convoked player for any event of this team
    OR EXISTS (
      SELECT 1
      FROM public.convocations c
      JOIN public.events e ON e.id = c.event_id
      JOIN public.player_parents pp ON pp.player_id = c.player_id
      WHERE e.team_id = _team_id AND pp.parent_user_id = _user_id
    );
$$;

-- 2) can_access_event_chat: same fallback at the event scope.
CREATE OR REPLACE FUNCTION public.can_access_event_chat(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.teams t ON t.id = e.team_id
    JOIN public.clubs c ON c.id = t.club_id
    WHERE e.id = _event_id
      AND c.event_chat_enabled = true
      AND (
        -- coaches & admins always allowed when chat enabled
        public.is_team_coach(_user_id, e.team_id)
        OR (
          c.event_chat_players_enabled = true
          AND (
            EXISTS (
              SELECT 1 FROM public.team_members tm
              WHERE tm.team_id = e.team_id AND tm.user_id = _user_id AND tm.role = 'player'
            )
            -- Fallback: a player convoked to this event whose account is linked
            OR EXISTS (
              SELECT 1
              FROM public.convocations conv
              JOIN public.players p ON p.id = conv.player_id
              WHERE conv.event_id = _event_id AND p.user_id = _user_id
            )
          )
        )
        OR (
          c.event_chat_parents_enabled = true
          AND (
            EXISTS (
              SELECT 1 FROM public.team_members tm
              JOIN public.player_parents pp ON pp.player_id = tm.player_id
              WHERE tm.team_id = e.team_id AND pp.parent_user_id = _user_id
            )
            -- Fallback: parent of a player convoked to this event
            OR EXISTS (
              SELECT 1
              FROM public.convocations conv
              JOIN public.player_parents pp ON pp.player_id = conv.player_id
              WHERE conv.event_id = _event_id AND pp.parent_user_id = _user_id
            )
          )
        )
      )
  );
$$;
