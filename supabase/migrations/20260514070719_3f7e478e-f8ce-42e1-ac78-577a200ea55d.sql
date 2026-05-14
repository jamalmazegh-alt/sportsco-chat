
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'parent', 'player');
CREATE TYPE public.event_type AS ENUM ('training', 'match', 'tournament', 'meeting', 'other');
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'uncertain', 'pending');
CREATE TYPE public.reminder_channel AS ENUM ('in_app', 'email', 'push');

-- Profiles (one row per auth user)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clubs
CREATE TABLE public.clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Club members + role
CREATE TABLE public.club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id, role)
);
CREATE INDEX ON public.club_members(user_id);
CREATE INDEX ON public.club_members(club_id);

-- Teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  season TEXT,
  sport TEXT,
  age_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.teams(club_id);

-- Players (player profile, optionally linked to a user)
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  position TEXT,
  jersey_number INT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.players(club_id);
CREATE INDEX ON public.players(user_id);

-- Team membership: links users (coach/parent) AND players to teams
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (role = 'player' AND player_id IS NOT NULL) OR
    (role <> 'player' AND user_id IS NOT NULL)
  )
);
CREATE INDEX ON public.team_members(team_id);
CREATE INDEX ON public.team_members(user_id);
CREATE INDEX ON public.team_members(player_id);

-- Player parents
CREATE TABLE public.player_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, parent_user_id)
);
CREATE INDEX ON public.player_parents(parent_user_id);

-- Events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  type public.event_type NOT NULL DEFAULT 'training',
  status public.event_status NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  meeting_point TEXT,
  opponent TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  responses_locked BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.events(team_id, starts_at);

-- Convocations
CREATE TABLE public.convocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status public.attendance_status NOT NULL DEFAULT 'pending',
  comment TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);
CREATE INDEX ON public.convocations(event_id);
CREATE INDEX ON public.convocations(player_id);

-- Reminders history
CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocation_id UUID NOT NULL REFERENCES public.convocations(id) ON DELETE CASCADE,
  channel public.reminder_channel NOT NULL DEFAULT 'in_app',
  sent_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.reminders(convocation_id);

-- In-app notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notifications(user_id, created_at DESC);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_club_role(_user_id UUID, _club_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id AND club_id = _club_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_club_member(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id AND club_id = _club_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_coach(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id AND tm.role IN ('coach','admin')
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.club_members cm ON cm.club_id = t.club_id
    WHERE t.id = _team_id AND cm.user_id = _user_id AND cm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_team(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.player_parents pp ON pp.player_id = tm.player_id
    WHERE tm.team_id = _team_id AND pp.parent_user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.club_members cm ON cm.club_id = t.club_id
    WHERE t.id = _team_id AND cm.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_respond_for_player(_user_id UUID, _player_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id AND p.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.player_parents pp
    WHERE pp.player_id = _player_id AND pp.parent_user_id = _user_id
  );
$$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_own_or_clubmate" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.club_members me
    JOIN public.club_members other ON other.club_id = me.club_id
    WHERE me.user_id = auth.uid() AND other.user_id = profiles.id
  )
);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Clubs policies
CREATE POLICY "clubs_select_member" ON public.clubs FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), id) OR created_by = auth.uid());
CREATE POLICY "clubs_insert_self" ON public.clubs FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "clubs_update_admin" ON public.clubs FOR UPDATE TO authenticated
USING (public.has_club_role(auth.uid(), id, 'admin'));
CREATE POLICY "clubs_delete_admin" ON public.clubs FOR DELETE TO authenticated
USING (public.has_club_role(auth.uid(), id, 'admin'));

-- Club members policies
CREATE POLICY "club_members_select_member" ON public.club_members FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "club_members_insert_admin_or_self_first" ON public.club_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() OR public.has_club_role(auth.uid(), club_id, 'admin')
);
CREATE POLICY "club_members_delete_admin" ON public.club_members FOR DELETE TO authenticated
USING (public.has_club_role(auth.uid(), club_id, 'admin') OR user_id = auth.uid());

-- Teams policies
CREATE POLICY "teams_select_member" ON public.teams FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "teams_admin_all" ON public.teams FOR ALL TO authenticated
USING (public.has_club_role(auth.uid(), club_id, 'admin'))
WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'));

-- Players policies
CREATE POLICY "players_select_clubmate" ON public.players FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "players_admin_or_coach_write" ON public.players FOR ALL TO authenticated
USING (
  public.has_club_role(auth.uid(), club_id, 'admin') OR
  public.has_club_role(auth.uid(), club_id, 'coach')
)
WITH CHECK (
  public.has_club_role(auth.uid(), club_id, 'admin') OR
  public.has_club_role(auth.uid(), club_id, 'coach')
);

-- Team members policies
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT TO authenticated
USING (public.can_view_team(auth.uid(), team_id));
CREATE POLICY "team_members_coach_write" ON public.team_members FOR ALL TO authenticated
USING (public.is_team_coach(auth.uid(), team_id))
WITH CHECK (public.is_team_coach(auth.uid(), team_id));

-- Player parents policies
CREATE POLICY "player_parents_select" ON public.player_parents FOR SELECT TO authenticated
USING (
  parent_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = player_id AND public.is_club_member(auth.uid(), p.club_id)
  )
);
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

-- Events policies
CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated
USING (public.can_view_team(auth.uid(), team_id));
CREATE POLICY "events_coach_write" ON public.events FOR ALL TO authenticated
USING (public.is_team_coach(auth.uid(), team_id))
WITH CHECK (public.is_team_coach(auth.uid(), team_id));

-- Convocations policies
CREATE POLICY "convocations_select" ON public.convocations FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_view_team(auth.uid(), e.team_id))
);
CREATE POLICY "convocations_coach_write" ON public.convocations FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_team_coach(auth.uid(), e.team_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_team_coach(auth.uid(), e.team_id))
);
CREATE POLICY "convocations_player_respond" ON public.convocations FOR UPDATE TO authenticated
USING (public.can_respond_for_player(auth.uid(), player_id))
WITH CHECK (public.can_respond_for_player(auth.uid(), player_id));

-- Reminders policies
CREATE POLICY "reminders_select_event" ON public.reminders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.convocations c
    JOIN public.events e ON e.id = c.event_id
    WHERE c.id = convocation_id AND public.can_view_team(auth.uid(), e.team_id)
  )
);
CREATE POLICY "reminders_insert_coach" ON public.reminders FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.convocations c
    JOIN public.events e ON e.id = c.event_id
    WHERE c.id = convocation_id AND public.is_team_coach(auth.uid(), e.team_id)
  )
);

-- Notifications policies
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "notifications_insert_any_authenticated" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);

-- Audit logs policies (read by club admins via app, no direct insert from client)
CREATE POLICY "audit_logs_select_actor" ON public.audit_logs FOR SELECT TO authenticated
USING (actor_user_id = auth.uid());
CREATE POLICY "audit_logs_insert_self" ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (actor_user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.convocations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.convocations REPLICA IDENTITY FULL;
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
