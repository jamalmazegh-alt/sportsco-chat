-- Normalisation nom/prénom pour matching : accents retirés + minuscule + suppression des caractères non alphanumériques.
CREATE OR REPLACE FUNCTION public.normalize_name(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(public.unaccent_compat(coalesce(t, ''))), '[^a-z0-9]', '', 'g')
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_name(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.normalize_name(text) TO authenticated, service_role;

-- Filet de sécurité : impossible d'avoir 2 joueurs actifs avec même identité dans un club.
-- birth_date NULL = ligne exclue de l'index (NULLs distincts) — rejet côté import.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_identity_unique
  ON public.players (
    club_id,
    public.normalize_name(first_name),
    public.normalize_name(last_name),
    birth_date
  )
  WHERE deleted_at IS NULL AND birth_date IS NOT NULL;