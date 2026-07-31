-- 1) Motifs et statuts
CREATE TYPE public.wall_report_reason AS ENUM (
  'inappropriate', 'harassment', 'spam', 'misinformation', 'privacy', 'other'
);
CREATE TYPE public.wall_report_status AS ENUM (
  'pending', 'reviewing', 'dismissed', 'actioned'
);

-- 2) Masquage manuel des contenus du mur
ALTER TABLE public.wall_posts
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

ALTER TABLE public.wall_comments
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

-- 3) Table de signalements
CREATE TABLE public.wall_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.wall_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.wall_comments(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason public.wall_report_reason NOT NULL,
  details text,
  status public.wall_report_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wall_content_reports_details_len CHECK (details IS NULL OR char_length(details) <= 500)
);

-- Unicité : un signalement par utilisateur et par contenu (post ou commentaire)
CREATE UNIQUE INDEX wall_content_reports_unique_post
  ON public.wall_content_reports (post_id, reporter_user_id)
  WHERE comment_id IS NULL;
CREATE UNIQUE INDEX wall_content_reports_unique_comment
  ON public.wall_content_reports (comment_id, reporter_user_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX wall_content_reports_club_status_idx
  ON public.wall_content_reports (club_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.wall_content_reports TO authenticated;
GRANT ALL ON public.wall_content_reports TO service_role;

ALTER TABLE public.wall_content_reports ENABLE ROW LEVEL SECURITY;

-- Helper: modérateur du club (admin / dirigeant) ou super admin
CREATE OR REPLACE FUNCTION public.is_wall_moderator(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins sa WHERE sa.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = _user_id
      AND cm.club_id = _club_id
      AND (
        cm.role IN ('admin', 'dirigeant')
        OR cm.roles && ARRAY['admin', 'dirigeant']::text[]
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_wall_moderator(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_wall_moderator(uuid, uuid) TO authenticated, service_role;

-- Signaler : membre du club uniquement, pour soi-même
CREATE POLICY "Members can report club content"
ON public.wall_content_reports FOR INSERT TO authenticated
WITH CHECK (
  reporter_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = wall_content_reports.club_id
  )
);

-- Lecture : son propre signalement, ou tous pour les modérateurs
CREATE POLICY "Reporters read own, moderators read all"
ON public.wall_content_reports FOR SELECT TO authenticated
USING (
  reporter_user_id = auth.uid()
  OR public.is_wall_moderator(auth.uid(), club_id)
);

-- Traitement : modérateurs uniquement
CREATE POLICY "Moderators can process reports"
ON public.wall_content_reports FOR UPDATE TO authenticated
USING (public.is_wall_moderator(auth.uid(), club_id))
WITH CHECK (public.is_wall_moderator(auth.uid(), club_id));

CREATE TRIGGER wall_content_reports_set_updated_at
BEFORE UPDATE ON public.wall_content_reports
FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();