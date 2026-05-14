ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS competitions text[] NOT NULL DEFAULT ARRAY['friendly','championship','cup']::text[];

CREATE INDEX IF NOT EXISTS idx_teams_competitions ON public.teams USING GIN (competitions);

CREATE OR REPLACE FUNCTION public.can_respond_for_player(_user_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.id = _player_id
      AND p.user_id = _user_id
      AND p.can_respond = true
  ) OR EXISTS (
    SELECT 1
    FROM public.player_parents pp
    WHERE pp.player_id = _player_id
      AND pp.parent_user_id = _user_id
      AND pp.can_respond = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_coach(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id AND tm.role IN ('coach','admin')
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.club_members cm ON cm.club_id = t.club_id
    WHERE t.id = _team_id AND cm.user_id = _user_id AND cm.role IN ('admin','coach')
  );
$$;

DROP POLICY IF EXISTS "players_admin_or_coach_write" ON public.players;
CREATE POLICY "players_admin_or_coach_write" ON public.players FOR ALL TO authenticated
USING (
  public.has_club_role(auth.uid(), club_id, 'admin') OR
  public.has_club_role(auth.uid(), club_id, 'coach')
)
WITH CHECK (
  public.has_club_role(auth.uid(), club_id, 'admin') OR
  public.has_club_role(auth.uid(), club_id, 'coach')
);

DROP POLICY IF EXISTS "player_parents_write_admin_coach_or_self" ON public.player_parents;
CREATE POLICY "player_parents_write_admin_coach_or_self" ON public.player_parents FOR ALL TO authenticated
USING (
  parent_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id AND (
      public.has_club_role(auth.uid(), p.club_id, 'admin') OR
      public.has_club_role(auth.uid(), p.club_id, 'coach')
    )
  )
)
WITH CHECK (
  parent_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id AND (
      public.has_club_role(auth.uid(), p.club_id, 'admin') OR
      public.has_club_role(auth.uid(), p.club_id, 'coach')
    )
  )
);