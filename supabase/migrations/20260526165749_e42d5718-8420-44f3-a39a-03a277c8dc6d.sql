-- 1. Extend wall_posts for external sources
ALTER TABLE public.wall_posts
  ALTER COLUMN author_user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'clubero',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS external_media_url text;

ALTER TABLE public.wall_posts
  DROP CONSTRAINT IF EXISTS wall_posts_source_check;
ALTER TABLE public.wall_posts
  ADD CONSTRAINT wall_posts_source_check
    CHECK (source IN ('clubero','instagram','facebook','twitter'));

CREATE UNIQUE INDEX IF NOT EXISTS wall_posts_club_source_external_unique
  ON public.wall_posts (club_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wall_posts_source_idx ON public.wall_posts (source);

-- 2. Social connections (OAuth tokens, encrypted)
CREATE TABLE IF NOT EXISTS public.club_social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  network text NOT NULL CHECK (network IN ('instagram','facebook','twitter')),
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  account_name text,
  account_id text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_error text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, network)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_social_connections TO authenticated;
GRANT ALL ON public.club_social_connections TO service_role;

ALTER TABLE public.club_social_connections ENABLE ROW LEVEL SECURITY;

-- Admins of the club can view their connections (tokens stay encrypted at rest)
CREATE POLICY social_conn_select_admin
  ON public.club_social_connections
  FOR SELECT
  TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY social_conn_insert_admin
  ON public.club_social_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY social_conn_update_admin
  ON public.club_social_connections
  FOR UPDATE
  TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY social_conn_delete_admin
  ON public.club_social_connections
  FOR DELETE
  TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE TRIGGER trg_social_conn_updated_at
  BEFORE UPDATE ON public.club_social_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();