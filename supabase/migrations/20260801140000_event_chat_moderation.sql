-- Modération du chat d'événement.
--
-- 1) Suppression des messages : jusqu'ici réservée à l'auteur. Le staff de
--    l'équipe de l'événement et les responsables du club (admin/dirigeant)
--    peuvent désormais supprimer n'importe quel message.
CREATE POLICY event_messages_delete_moderation ON public.event_messages
FOR DELETE TO authenticated
USING (
  public.is_team_staff_of_event(event_messages.event_id, auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.teams tm ON tm.id = e.team_id
    WHERE e.id = event_messages.event_id
      AND public.is_wall_moderator(auth.uid(), tm.club_id)
  )
);

-- 2) Signalements de messages du chat. L'extrait (excerpt) et l'auteur sont
--    figés au moment du signalement, côté serveur uniquement : la table n'est
--    PAS insérable par les clients (pas de GRANT INSERT à authenticated) pour
--    empêcher la falsification de citations — l'insertion passe par la server
--    function reportEventMessage (service role) après vérification, via la
--    session RLS de l'appelant, que le message lui est visible.
CREATE TABLE public.event_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- SET NULL : le signalement (et son extrait) survit à la suppression du message.
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

-- Un signalement par personne et par message (tant que le message existe).
CREATE UNIQUE INDEX event_message_reports_unique_msg
  ON public.event_message_reports (message_id, reporter_user_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX event_message_reports_club_status_idx
  ON public.event_message_reports (club_id, status, created_at DESC);

GRANT SELECT, UPDATE ON public.event_message_reports TO authenticated;
GRANT ALL ON public.event_message_reports TO service_role;

ALTER TABLE public.event_message_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters read own, moderators read all messages"
ON public.event_message_reports FOR SELECT TO authenticated
USING (
  reporter_user_id = auth.uid()
  OR public.is_wall_moderator(auth.uid(), club_id)
);

CREATE POLICY "Moderators can process message reports"
ON public.event_message_reports FOR UPDATE TO authenticated
USING (public.is_wall_moderator(auth.uid(), club_id))
WITH CHECK (public.is_wall_moderator(auth.uid(), club_id));

CREATE TRIGGER event_message_reports_set_updated_at
BEFORE UPDATE ON public.event_message_reports
FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
