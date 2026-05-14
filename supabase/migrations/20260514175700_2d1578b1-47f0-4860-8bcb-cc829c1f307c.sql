
DO $$ BEGIN
  CREATE TYPE public.consent_kind AS ENUM (
    'terms', 'privacy', 'data_processing', 'media', 'notifications'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.media_consent_status AS ENUM ('pending','granted','denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.privacy_request_status AS ENUM ('pending','processing','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.consent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.consent_kind NOT NULL,
  version integer NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  required boolean NOT NULL DEFAULT true,
  title text NOT NULL,
  content_md text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version, locale)
);
ALTER TABLE public.consent_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_versions_read_all ON public.consent_versions;
CREATE POLICY consent_versions_read_all ON public.consent_versions
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid
);
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id);
$$;

DROP POLICY IF EXISTS super_admins_self_or_super ON public.super_admins;
CREATE POLICY super_admins_self_or_super ON public.super_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_super_admin(auth.uid()));
DROP POLICY IF EXISTS super_admins_super_write ON public.super_admins;
CREATE POLICY super_admins_super_write ON public.super_admins
  FOR ALL TO authenticated
  USING (public.has_super_admin(auth.uid()))
  WITH CHECK (public.has_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_parent_of_player(_user_id uuid, _player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.player_parents pp
    WHERE pp.player_id = _player_id AND pp.parent_user_id = _user_id
  );
$$;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS media_consent_status public.media_consent_status
    NOT NULL DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.player_is_minor(_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id
      AND p.birth_date IS NOT NULL
      AND p.birth_date > (CURRENT_DATE - INTERVAL '18 years')::date
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_player_media(_user_id uuid, _player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = _player_id
      AND (
        NOT (p.birth_date IS NOT NULL AND p.birth_date > (CURRENT_DATE - INTERVAL '18 years')::date)
        OR p.media_consent_status = 'granted'
        OR p.user_id = _user_id
        OR public.is_parent_of_player(_user_id, p.id)
        OR public.has_club_role(_user_id, p.club_id, 'admin'::app_role)
        OR public.has_club_role(_user_id, p.club_id, 'coach'::app_role)
        OR public.has_super_admin(_user_id)
      )
  );
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notifications_push  boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.consent_kind NOT NULL,
  version_id uuid NOT NULL REFERENCES public.consent_versions(id) ON DELETE RESTRICT,
  granted boolean NOT NULL,
  on_behalf_of_player_id uuid,
  ip text,
  user_agent text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_consents_user_idx ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS user_consents_player_idx ON public.user_consents(on_behalf_of_player_id);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consents_select ON public.user_consents;
CREATE POLICY user_consents_select ON public.user_consents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (on_behalf_of_player_id IS NOT NULL
        AND public.is_parent_of_player(auth.uid(), on_behalf_of_player_id))
    OR public.has_super_admin(auth.uid())
  );
DROP POLICY IF EXISTS user_consents_insert ON public.user_consents;
CREATE POLICY user_consents_insert ON public.user_consents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      on_behalf_of_player_id IS NULL
      OR public.is_parent_of_player(auth.uid(), on_behalf_of_player_id)
    )
  );
DROP POLICY IF EXISTS user_consents_update_own ON public.user_consents;
CREATE POLICY user_consents_update_own ON public.user_consents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status public.privacy_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  file_url text,
  error text
);
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS export_select_own ON public.data_export_requests;
CREATE POLICY export_select_own ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_super_admin(auth.uid()));
DROP POLICY IF EXISTS export_insert_own ON public.data_export_requests;
CREATE POLICY export_insert_own ON public.data_export_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status public.privacy_request_status NOT NULL DEFAULT 'pending',
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  processed_at timestamptz
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deletion_select_own ON public.account_deletion_requests;
CREATE POLICY deletion_select_own ON public.account_deletion_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_super_admin(auth.uid()));
DROP POLICY IF EXISTS deletion_insert_own ON public.account_deletion_requests;
CREATE POLICY deletion_insert_own ON public.account_deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS deletion_cancel_own ON public.account_deletion_requests;
CREATE POLICY deletion_cancel_own ON public.account_deletion_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md) VALUES
  ('terms',           1, 'en', true,  'Terms of Service', '# Terms of Service\n\nBy using Clubero you agree to these terms.'),
  ('privacy',         1, 'en', true,  'Privacy Policy', '# Privacy Policy\n\nWe process your data to operate club & team management features.'),
  ('data_processing', 1, 'en', true,  'Data Processing', '# Data Processing\n\nLawful basis: contract & legitimate interest. No AI profiling, biometrics, or behavioural analytics on minors.'),
  ('media',           1, 'en', false, 'Photo & Media', '# Media\n\nAllow photos of the player to be visible inside the authorised club/team.'),
  ('notifications',   1, 'en', false, 'Notifications', '# Notifications\n\nReceive event, convocation and chat notifications by email/push.'),
  ('terms',           1, 'fr', true,  'Conditions générales', '# Conditions générales\n\nEn utilisant Clubero, vous acceptez ces conditions.'),
  ('privacy',         1, 'fr', true,  'Politique de confidentialité', '# Politique de confidentialité\n\nNous traitons vos données pour faire fonctionner les fonctionnalités du club.'),
  ('data_processing', 1, 'fr', true,  'Traitement des données', '# Traitement des données\n\nBase légale : contrat & intérêt légitime. Aucun profilage IA, biométrie, ou analyse comportementale sur les mineurs.'),
  ('media',           1, 'fr', false, 'Photos et médias', '# Médias\n\nAutoriser l''affichage des photos du joueur dans le club/équipe autorisé.'),
  ('notifications',   1, 'fr', false, 'Notifications', '# Notifications\n\nRecevoir les notifications par email/push.')
ON CONFLICT (kind, version, locale) DO NOTHING;
