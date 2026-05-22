CREATE OR REPLACE FUNCTION public.tournament_match_compute_winner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND NEW.score_a IS NOT NULL AND NEW.score_b IS NOT NULL THEN
    IF NEW.score_a > NEW.score_b THEN
      NEW.winner_team_id := NEW.team_a_id;
    ELSIF NEW.score_b > NEW.score_a THEN
      NEW.winner_team_id := NEW.team_b_id;
    ELSIF NEW.penalty_score_a IS NOT NULL AND NEW.penalty_score_b IS NOT NULL AND NEW.penalty_score_a <> NEW.penalty_score_b THEN
      IF NEW.penalty_score_a > NEW.penalty_score_b THEN
        NEW.winner_team_id := NEW.team_a_id;
      ELSE
        NEW.winner_team_id := NEW.team_b_id;
      END IF;
    ELSE
      NEW.winner_team_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;