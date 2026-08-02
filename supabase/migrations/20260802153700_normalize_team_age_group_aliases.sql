-- Normalisation age_group → catalogue officiel.
-- Source : review_categories.numbers (review manuelle 2026-08-02).
--
-- Auto (alias Senior* / Vétérans*) + overrides précis (plages, vide PSG).
-- « Réunions internes » (is_internal) : catégorie volontairement NULL — équipe technique.

-- 1) Alias Senior* → Senior (couvre Sénior, Seniors, Senior F, …)
UPDATE public.teams
SET age_group = 'Senior'
WHERE deleted_at IS NULL
  AND COALESCE(is_internal, false) = false
  AND age_group IS DISTINCT FROM 'Senior'
  AND age_group ~* 'senior';

-- 2) Alias Vétérans* → Vétérans (+ trim espaces)
UPDATE public.teams
SET age_group = 'Vétérans'
WHERE deleted_at IS NULL
  AND COALESCE(is_internal, false) = false
  AND btrim(age_group) IS DISTINCT FROM 'Vétérans'
  AND age_group ~* 'v[eé]t[eé]ran';

-- 3) Overrides revue manuelle (plages + vide)
UPDATE public.teams SET age_group = 'U7'
WHERE id = 'f87343c9-f3cc-41dd-a192-c9487b721ef7'; -- FC VALLEE DU LOT / U6-U7

UPDATE public.teams SET age_group = 'U9'
WHERE id = '203cfc04-6119-477e-8c1d-c4b26c122775'; -- FC VALLEE DU LOT / U8-U9

UPDATE public.teams SET age_group = 'U16'
WHERE id = '93472d8a-8d2e-4297-b01a-1449a408f537'; -- PSG / U16 (était NULL)

-- 4) Équipes techniques : pas de catégorie sportive
UPDATE public.teams
SET age_group = NULL
WHERE deleted_at IS NULL
  AND is_internal = true;
