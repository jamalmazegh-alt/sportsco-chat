-- Signalement d'un membre du club (en complément du signalement de contenu
-- du mur). Réutilise les enums wall_report_reason / wall_report_status et le
-- helper is_wall_moderator. Traité par les admins/dirigeants du club depuis
-- l'écran de modération.
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

-- Un seul signalement ouvert par signaleur et par personne visée dans un club ;
-- re-signaler redevient possible une fois le signalement traité ou ignoré.
CREATE UNIQUE INDEX user_reports_open_uniq
  ON public.user_reports (club_id, reported_user_id, reporter_user_id)
  WHERE status IN ('pending', 'reviewing');

CREATE INDEX user_reports_club_status_idx
  ON public.user_reports (club_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Signaler : membre du club, en son nom, visant un membre du même club.
-- is_club_member est SECURITY DEFINER : pas de dépendance à la RLS de
-- club_members pour vérifier l'appartenance de la personne visée.
CREATE POLICY "Members can report club members"
ON public.user_reports FOR INSERT TO authenticated
WITH CHECK (
  reporter_user_id = auth.uid()
  AND public.is_club_member(auth.uid(), club_id)
  AND public.is_club_member(reported_user_id, club_id)
);

CREATE POLICY "Reporters read own, moderators read all users"
ON public.user_reports FOR SELECT TO authenticated
USING (
  reporter_user_id = auth.uid()
  OR public.is_wall_moderator(auth.uid(), club_id)
);

CREATE POLICY "Moderators can process user reports"
ON public.user_reports FOR UPDATE TO authenticated
USING (public.is_wall_moderator(auth.uid(), club_id))
WITH CHECK (public.is_wall_moderator(auth.uid(), club_id));

CREATE TRIGGER user_reports_set_updated_at
BEFORE UPDATE ON public.user_reports
FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
