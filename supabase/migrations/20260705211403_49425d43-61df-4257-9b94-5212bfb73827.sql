
-- Normalize legacy team.sport values ("Football" -> "football") so
-- sport-scoped challenge templates match consistently.
UPDATE public.teams
SET sport = LOWER(sport)
WHERE sport IS NOT NULL
  AND sport <> LOWER(sport);

-- Existing crossbar challenges were created with aggregate = 'cumulative'
-- which prevents the "Nouveau record" badge from showing. Convert them
-- to 'record' so the personal-best badge lights up.
UPDATE public.challenges
SET aggregate = 'record'
WHERE template_key = 'crossbar'
  AND aggregate = 'cumulative';
