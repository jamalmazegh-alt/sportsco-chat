
-- Tournament formats: ajout double-élimination et système suisse
ALTER TYPE tournament_format ADD VALUE IF NOT EXISTS 'double_elimination';
ALTER TYPE tournament_format ADD VALUE IF NOT EXISTS 'swiss';
ALTER TYPE tournament_format ADD VALUE IF NOT EXISTS 'round_robin_home_away';

-- Système suisse : nombre de rondes
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS swiss_rounds integer;

-- Sport personnalisé : nom libre
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS custom_sport_name text;

-- Streaming par terrain : map { nom_terrain -> url } stockée en jsonb
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS field_streams jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Métadonnée bracket pour double élimination
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS bracket_side text;

-- Marqueur "comment le match a été décidé" (utile pour le préset Hockey OT)
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS decided_in text;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_bracket_side_check
  CHECK (bracket_side IS NULL OR bracket_side = ANY (ARRAY['winner','loser','grand_final']));

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_decided_in_check
  CHECK (decided_in IS NULL OR decided_in = ANY (ARRAY['regulation','overtime','shootout']));
