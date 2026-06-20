-- 1. Table app_flags
CREATE TABLE IF NOT EXISTS public.app_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lecture publique (lecture du flag = pas sensible, c'est juste un on/off feature)
GRANT SELECT ON public.app_flags TO anon, authenticated;
GRANT ALL ON public.app_flags TO service_role;

ALTER TABLE public.app_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_flags readable by everyone"
  ON public.app_flags
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pas de policy INSERT/UPDATE/DELETE : seul service_role peut écrire (bypass RLS).

-- 2. Seed des flags V2 — tous à false pour la bêta
INSERT INTO public.app_flags (key, enabled, description) VALUES
  ('social_network_v2',       false, 'Réseau social cross-club : feed global, découverte, suggestions, networking'),
  ('public_player_profiles',  false, 'Profils publics enrichis (/p/:slug, /coach/:slug, listing /players)'),
  ('fundraising_v2',          false, 'Collectes, fundraising, cagnottes'),
  ('payments_v2',             false, 'Cotisations, licences, packs payants tournois, Stripe Connect')
ON CONFLICT (key) DO NOTHING;

-- 3. Helper is_v2 — utilisable depuis SQL/triggers/edge fns
CREATE OR REPLACE FUNCTION public.is_v2(_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.app_flags WHERE key = _key),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_v2(text) TO anon, authenticated, service_role;