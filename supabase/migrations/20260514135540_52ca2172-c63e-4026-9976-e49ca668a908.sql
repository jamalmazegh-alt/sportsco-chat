-- Helper: check whether a user can access an event chat based on club settings & their relationship to the team
CREATE OR REPLACE FUNCTION public.can_access_event_chat(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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
          AND EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = e.team_id AND tm.user_id = _user_id AND tm.role = 'player'
          )
        )
        OR (
          c.event_chat_parents_enabled = true
          AND EXISTS (
            SELECT 1 FROM public.team_members tm
            JOIN public.player_parents pp ON pp.player_id = tm.player_id
            WHERE tm.team_id = e.team_id AND pp.parent_user_id = _user_id
          )
        )
      )
  );
$$;

-- Wall posts
CREATE TABLE IF NOT EXISTS public.wall_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wall_posts_club ON public.wall_posts(club_id, created_at DESC);
ALTER TABLE public.wall_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY wall_posts_select ON public.wall_posts FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY wall_posts_insert ON public.wall_posts FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.is_club_member(auth.uid(), club_id));
CREATE POLICY wall_posts_delete ON public.wall_posts FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

-- Wall comments
CREATE TABLE IF NOT EXISTS public.wall_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.wall_posts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wall_comments_post ON public.wall_comments(post_id, created_at);
ALTER TABLE public.wall_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY wall_comments_select ON public.wall_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wall_posts p
    WHERE p.id = wall_comments.post_id AND public.is_club_member(auth.uid(), p.club_id)
  ));
CREATE POLICY wall_comments_insert ON public.wall_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.wall_posts p
      JOIN public.clubs c ON c.id = p.club_id
      WHERE p.id = wall_comments.post_id
        AND public.is_club_member(auth.uid(), p.club_id)
        AND c.wall_comments_enabled = true
    )
  );
CREATE POLICY wall_comments_delete ON public.wall_comments FOR DELETE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wall_posts p
      WHERE p.id = wall_comments.post_id
        AND public.has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
    )
  );

-- Event messages
CREATE TABLE IF NOT EXISTS public.event_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_messages_event ON public.event_messages(event_id, created_at);
ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_messages_select ON public.event_messages FOR SELECT TO authenticated
  USING (public.can_access_event_chat(auth.uid(), event_id));
CREATE POLICY event_messages_insert ON public.event_messages FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.can_access_event_chat(auth.uid(), event_id));
CREATE POLICY event_messages_delete ON public.event_messages FOR DELETE TO authenticated
  USING (author_user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wall_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wall_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_messages;