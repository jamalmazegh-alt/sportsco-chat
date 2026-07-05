
-- 1) Trigger + fonction de contrôle sur derived_value
DROP TRIGGER IF EXISTS challenge_results_check_derived_trg ON public.challenge_results;
DROP FUNCTION IF EXISTS public.challenge_results_check_derived();

-- 2) Colonne derived_value sur challenge_results
ALTER TABLE public.challenge_results DROP COLUMN IF EXISTS derived_value;

-- 3) Colonne derived sur challenges
ALTER TABLE public.challenges DROP COLUMN IF EXISTS derived;

-- 4) Enum challenge_derived (plus référencé)
DROP TYPE IF EXISTS public.challenge_derived;

-- 5) Fonctions SQL VO2 (plus utilisées)
DROP FUNCTION IF EXISTS public.vo2_leger(numeric);
DROP FUNCTION IF EXISTS public.vo2_cooper(numeric);
DROP FUNCTION IF EXISTS public.vo2_age_factor(integer);
