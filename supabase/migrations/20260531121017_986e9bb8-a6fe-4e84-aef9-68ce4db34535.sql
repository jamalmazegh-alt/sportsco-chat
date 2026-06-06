CREATE OR REPLACE FUNCTION public.on_tournament_completed_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_season text;
  v_winner_team uuid;
  v_finalist_team uuid;
BEGIN
  IF NEW.status <> 'completed' OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  v_season := public.compute_season_label(COALESCE(NEW.starts_on, CURRENT_DATE));

  SELECT m.winner_team_id,
         CASE WHEN m.winner_team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END AS finalist
    INTO v_winner_team, v_finalist_team
  FROM public.tournament_matches m
  WHERE m.tournament_id = NEW.id
    AND m.round = 'final'
    AND m.status = 'completed'
    AND m.winner_team_id IS NOT NULL
  ORDER BY m.scheduled_at DESC NULLS LAST
  LIMIT 1;

  IF v_winner_team IS NOT NULL THEN
    INSERT INTO public.player_achievements
      (player_id, club_id, team_id, season_label, title, achievement_type,
       source, status, visibility, related_tournament_id)
    SELECT DISTINCT
      tm.player_id, p.club_id, tt.team_id, v_season,
      NEW.name || COALESCE(' — ' || v_season, ''),
      'tournament_winner',
      'tournament', 'suggested', 'private',
      NEW.id
    FROM public.tournament_teams tt
    JOIN public.team_members tm ON tm.team_id = tt.team_id AND tm.player_id IS NOT NULL
    JOIN public.players p ON p.id = tm.player_id AND p.deleted_at IS NULL
    WHERE tt.id = v_winner_team
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_finalist_team IS NOT NULL THEN
    INSERT INTO public.player_achievements
      (player_id, club_id, team_id, season_label, title, achievement_type,
       source, status, visibility, related_tournament_id)
    SELECT DISTINCT
      tm.player_id, p.club_id, tt.team_id, v_season,
      NEW.name || COALESCE(' — ' || v_season, ''),
      'tournament_finalist',
      'tournament', 'suggested', 'private',
      NEW.id
    FROM public.tournament_teams tt
    JOIN public.team_members tm ON tm.team_id = tt.team_id AND tm.player_id IS NOT NULL
    JOIN public.players p ON p.id = tm.player_id AND p.deleted_at IS NULL
    WHERE tt.id = v_finalist_team
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;