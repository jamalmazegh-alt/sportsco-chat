-- One-shot: remap known free-text age_group aliases to catalog codes.
-- Does NOT touch ambiguous ranges (U6-U7, U8-U9): re-pick a single catalog
-- code in the UI (e.g. U7) and put the range in the team *name* if needed.
-- Does NOT force NOT NULL yet: empty rows are fixed on next team edit (category required).

UPDATE public.teams
SET age_group = 'Senior'
WHERE deleted_at IS NULL
  AND age_group IS DISTINCT FROM 'Senior'
  AND age_group ~* 'senior';

UPDATE public.teams
SET age_group = 'Vétérans'
WHERE deleted_at IS NULL
  AND age_group IS DISTINCT FROM 'Vétérans'
  AND age_group ~* 'v[eé]t[eé]ran';
