
-- Notification when a coach is attached to a team
-- Skips: self-add, system/seed inserts (no auth.uid), duplicates

CREATE OR REPLACE FUNCTION public.notify_coach_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_team_name text;
  v_club_id uuid;
  v_club_name text;
  v_locale text;
  v_first_name text;
  v_title text;
  v_body text;
  v_link text;
BEGIN
  -- Only coach role with an actual user
  IF NEW.role <> 'coach' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip seed/system context (no JWT)
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip self-add
  IF v_actor = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Fetch team & club
  SELECT t.name, t.club_id INTO v_team_name, v_club_id
  FROM public.teams t WHERE t.id = NEW.team_id;

  IF v_club_id IS NOT NULL THEN
    SELECT c.name INTO v_club_name FROM public.clubs c WHERE c.id = v_club_id;
  END IF;

  v_team_name := COALESCE(v_team_name, '');
  v_club_name := COALESCE(v_club_name, '');

  -- Coach profile (locale + first name)
  SELECT COALESCE(NULLIF(LOWER(LEFT(p.preferred_language, 2)), ''), 'fr'),
         p.first_name
    INTO v_locale, v_first_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  v_locale := COALESCE(v_locale, 'fr');
  v_link := '/teams/' || NEW.team_id::text;

  -- Dedup: skip if a coach_assigned notification already exists for same user+team
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.user_id
      AND type = 'coach_assigned'
      AND link = v_link
  ) THEN
    RETURN NEW;
  END IF;

  -- Localized strings (FR / EN / DE / ES / IT / NL / PT)
  v_title := CASE v_locale
    WHEN 'en' THEN 'You have been added to a team'
    WHEN 'de' THEN 'Sie wurden einem Team hinzugefügt'
    WHEN 'es' THEN 'Has sido añadido a un equipo'
    WHEN 'it' THEN 'Sei stato aggiunto a una squadra'
    WHEN 'nl' THEN 'Je bent toegevoegd aan een team'
    WHEN 'pt' THEN 'Você foi adicionado a uma equipe'
    ELSE 'Vous avez été ajouté à une équipe'
  END;

  v_body := CASE v_locale
    WHEN 'en' THEN 'You are now coach of ' || v_team_name || ' at ' || v_club_name || '.'
    WHEN 'de' THEN 'Sie sind jetzt Trainer von ' || v_team_name || ' bei ' || v_club_name || '.'
    WHEN 'es' THEN 'Ahora eres entrenador de ' || v_team_name || ' en ' || v_club_name || '.'
    WHEN 'it' THEN 'Ora sei allenatore di ' || v_team_name || ' presso ' || v_club_name || '.'
    WHEN 'nl' THEN 'Je bent nu coach van ' || v_team_name || ' bij ' || v_club_name || '.'
    WHEN 'pt' THEN 'Agora você é treinador de ' || v_team_name || ' no ' || v_club_name || '.'
    ELSE 'Vous êtes maintenant coach de ' || v_team_name || ' au club ' || v_club_name || '.'
  END;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'coach_assigned', v_title, v_body, v_link);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_coach_assigned ON public.team_members;
CREATE TRIGGER trg_notify_coach_assigned
AFTER INSERT ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.notify_coach_assigned();
