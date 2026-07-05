CREATE OR REPLACE FUNCTION public.challenge_results_check_derived()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind challenge_kind;
BEGIN
  IF NEW.derived_value IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.kind INTO v_kind
  FROM public.challenge_passages cp
  JOIN public.challenges c ON c.id = cp.challenge_id
  WHERE cp.id = NEW.passage_id;
  IF v_kind IS DISTINCT FROM 'physical_test'::challenge_kind THEN
    RAISE EXCEPTION 'derived_value is only allowed on physical_test challenges'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS challenge_results_check_derived_trg ON public.challenge_results;
CREATE TRIGGER challenge_results_check_derived_trg
BEFORE INSERT OR UPDATE OF derived_value, passage_id ON public.challenge_results
FOR EACH ROW EXECUTE FUNCTION public.challenge_results_check_derived();