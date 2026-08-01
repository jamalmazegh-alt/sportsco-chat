CREATE TABLE public.user_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, muted_user_id),
  CONSTRAINT user_mutes_not_self CHECK (user_id <> muted_user_id)
);
CREATE INDEX idx_user_mutes_user ON public.user_mutes(user_id);
GRANT SELECT, INSERT, DELETE ON public.user_mutes TO authenticated;
GRANT ALL ON public.user_mutes TO service_role;
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_mutes_select_own" ON public.user_mutes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_mutes_insert_own" ON public.user_mutes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_mutes_delete_own" ON public.user_mutes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason public.wall_report_reason NOT NULL,
  details text,
  status public.wall_report_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_details_len CHECK (details IS NULL OR char_length(details) <= 500),
  CONSTRAINT user_reports_not_self CHECK (reporter_user_id <> reported_user_id)
);
CREATE UNIQUE INDEX user_reports_open_uniq ON public.user_reports (club_id, reported_user_id, reporter_user_id) WHERE status IN ('pending', 'reviewing');
CREATE INDEX user_reports_club_status_idx ON public.user_reports (club_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can report club members" ON public.user_reports FOR INSERT TO authenticated
WITH CHECK (
  reporter_user_id = auth.uid()
  AND public.is_club_member(auth.uid(), club_id)
  AND public.is_club_member(reported_user_id, club_id)
);
CREATE POLICY "Reporters read own, moderators read all users" ON public.user_reports FOR SELECT TO authenticated
USING (reporter_user_id = auth.uid() OR public.is_wall_moderator(auth.uid(), club_id));
CREATE POLICY "Moderators can process user reports" ON public.user_reports FOR UPDATE TO authenticated
USING (public.is_wall_moderator(auth.uid(), club_id))
WITH CHECK (public.is_wall_moderator(auth.uid(), club_id));
CREATE TRIGGER user_reports_set_updated_at BEFORE UPDATE ON public.user_reports FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

CREATE POLICY event_messages_delete_moderation ON public.event_messages
FOR DELETE TO authenticated
USING (
  public.is_team_staff_of_event(event_messages.event_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.teams tm ON tm.id = e.team_id
    WHERE e.id = event_messages.event_id
      AND public.is_wall_moderator(auth.uid(), tm.club_id)
  )
);

CREATE TABLE public.event_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.event_messages(id) ON DELETE SET NULL,
  message_author_user_id uuid,
  excerpt text,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason public.wall_report_reason NOT NULL,
  details text,
  status public.wall_report_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_message_reports_details_len CHECK (details IS NULL OR char_length(details) <= 500)
);
CREATE UNIQUE INDEX event_message_reports_unique_msg ON public.event_message_reports (message_id, reporter_user_id) WHERE message_id IS NOT NULL;
CREATE INDEX event_message_reports_club_status_idx ON public.event_message_reports (club_id, status, created_at DESC);
GRANT SELECT, UPDATE ON public.event_message_reports TO authenticated;
GRANT ALL ON public.event_message_reports TO service_role;
ALTER TABLE public.event_message_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporters read own, moderators read all messages" ON public.event_message_reports FOR SELECT TO authenticated
USING (reporter_user_id = auth.uid() OR public.is_wall_moderator(auth.uid(), club_id));
CREATE POLICY "Moderators can process message reports" ON public.event_message_reports FOR UPDATE TO authenticated
USING (public.is_wall_moderator(auth.uid(), club_id))
WITH CHECK (public.is_wall_moderator(auth.uid(), club_id));
CREATE TRIGGER event_message_reports_set_updated_at BEFORE UPDATE ON public.event_message_reports FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();