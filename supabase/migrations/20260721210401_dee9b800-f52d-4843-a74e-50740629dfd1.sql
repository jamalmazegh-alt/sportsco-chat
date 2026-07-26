
-- ============================================================
-- Lot 4c-1 : in-app notifications for staff assignments & conflicts
-- ============================================================

-- 1) AFTER INSERT event_staff_assignments -> notify assignee
CREATE OR REPLACE FUNCTION public.notify_event_staff_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event RECORD;
  v_team_name text;
  v_locale text;
  v_link text;
  v_title text;
  v_body text;
  v_when text;
  v_type_label text;
  v_headline text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip self-assign
  IF v_actor IS NOT NULL AND v_actor = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT e.id, e.title, e.type, e.opponent, e.starts_at, e.team_id, t.name AS team_name
    INTO v_event
  FROM public.events e
  LEFT JOIN public.teams t ON t.id = e.team_id
  WHERE e.id = NEW.event_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_team_name := COALESCE(v_event.team_name, '');
  v_link := '/events/' || NEW.event_id::text;

  -- Dedup by (user, type, link)
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.user_id
      AND type = 'event_staff_assigned'
      AND link = v_link
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(LOWER(LEFT(p.preferred_language, 2)), ''), 'fr')
    INTO v_locale
  FROM public.profiles p WHERE p.id = NEW.user_id;
  v_locale := COALESCE(v_locale, 'fr');

  v_when := to_char(v_event.starts_at, 'DD/MM/YYYY') || ' ' ||
    CASE v_locale WHEN 'fr' THEN 'à ' ELSE 'at ' END ||
    to_char(v_event.starts_at, 'HH24:MI');

  v_type_label := CASE
    WHEN v_event.type = 'match' AND v_event.opponent IS NOT NULL THEN
      CASE v_locale WHEN 'fr' THEN 'Match vs ' ELSE 'Match vs ' END || v_event.opponent
    WHEN v_event.type = 'match' THEN 'Match'
    WHEN v_event.type = 'training' THEN CASE v_locale WHEN 'fr' THEN 'Entraînement' ELSE 'Training' END
    ELSE COALESCE(v_event.title, CASE v_locale WHEN 'fr' THEN 'Événement' ELSE 'Event' END)
  END;

  v_headline := v_type_label ||
    CASE WHEN v_team_name <> '' THEN ' · ' || v_team_name ELSE '' END ||
    ' · ' || v_when;

  v_title := CASE v_locale
    WHEN 'en' THEN 'You have been assigned to an event'
    WHEN 'de' THEN 'Sie wurden einem Ereignis zugewiesen'
    WHEN 'es' THEN 'Has sido asignado a un evento'
    WHEN 'it' THEN 'Sei stato assegnato a un evento'
    WHEN 'nl' THEN 'Je bent toegewezen aan een gebeurtenis'
    WHEN 'pt' THEN 'Você foi atribuído a um evento'
    ELSE 'Tu as été assigné à un événement'
  END;

  v_body := v_headline;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'event_staff_assigned', v_title, v_body, v_link);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event_staff_assigned ON public.event_staff_assignments;
CREATE TRIGGER trg_notify_event_staff_assigned
AFTER INSERT ON public.event_staff_assignments
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_staff_assigned();


-- 2) AFTER DELETE event_staff_assignments -> notify ex-assignee
CREATE OR REPLACE FUNCTION public.notify_event_staff_unassigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_locale text;
  v_link text;
  v_title text;
  v_body text;
BEGIN
  IF OLD.user_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Skip self-unassign
  IF v_actor IS NOT NULL AND v_actor = OLD.user_id THEN
    RETURN OLD;
  END IF;

  v_link := '/events/' || OLD.event_id::text;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = OLD.user_id
      AND type = 'event_staff_unassigned'
      AND link = v_link
      AND created_at > now() - interval '1 minute'
  ) THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(NULLIF(LOWER(LEFT(p.preferred_language, 2)), ''), 'fr')
    INTO v_locale
  FROM public.profiles p WHERE p.id = OLD.user_id;
  v_locale := COALESCE(v_locale, 'fr');

  v_title := CASE v_locale
    WHEN 'en' THEN 'You are no longer assigned to this event'
    WHEN 'de' THEN 'Sie sind diesem Ereignis nicht mehr zugewiesen'
    WHEN 'es' THEN 'Ya no estás asignado a este evento'
    WHEN 'it' THEN 'Non sei più assegnato a questo evento'
    WHEN 'nl' THEN 'Je bent niet meer toegewezen aan deze gebeurtenis'
    WHEN 'pt' THEN 'Você não está mais atribuído a este evento'
    ELSE 'Tu n''es plus assigné à cet événement'
  END;

  v_body := CASE v_locale
    WHEN 'en' THEN 'The manager removed you from the assignment.'
    WHEN 'de' THEN 'Der Manager hat Sie aus der Zuweisung entfernt.'
    WHEN 'es' THEN 'El responsable te ha retirado de la asignación.'
    WHEN 'it' THEN 'Il responsabile ti ha rimosso dall''assegnazione.'
    WHEN 'nl' THEN 'De verantwoordelijke heeft je uit de toewijzing verwijderd.'
    WHEN 'pt' THEN 'O responsável removeu você da atribuição.'
    ELSE 'Le responsable t''a retiré de cette assignation.'
  END;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (OLD.user_id, 'event_staff_unassigned', v_title, v_body, v_link);

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event_staff_unassigned ON public.event_staff_assignments;
CREATE TRIGGER trg_notify_event_staff_unassigned
AFTER DELETE ON public.event_staff_assignments
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_staff_unassigned();


-- 3) AFTER INSERT staff_availabilities (status='active')
-- -> for each upcoming event where this coach is assigned and the absence
--    covers the event date, notify managers (team staff + club admins/dirigeants).
CREATE OR REPLACE FUNCTION public.notify_event_staff_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_manager RECORD;
  v_link text;
  v_locale text;
  v_title text;
  v_body text;
  v_team_name text;
  v_when text;
  v_type_label text;
  v_headline text;
  v_coach_name text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.full_name, 'Un coach')
    INTO v_coach_name
  FROM public.profiles p WHERE p.id = NEW.user_id;
  v_coach_name := COALESCE(v_coach_name, 'Un coach');

  FOR v_event IN
    SELECT e.id, e.title, e.type, e.opponent, e.starts_at, e.team_id,
           t.name AS team_name, t.club_id
    FROM public.event_staff_assignments a
    JOIN public.events e ON e.id = a.event_id
    LEFT JOIN public.teams t ON t.id = e.team_id
    WHERE a.user_id = NEW.user_id
      AND e.starts_at >= now()
      AND (e.starts_at)::date >= NEW.start_date
      AND (e.starts_at)::date <= NEW.end_date
  LOOP
    v_team_name := COALESCE(v_event.team_name, '');
    v_link := '/events/' || v_event.id::text;

    v_type_label := CASE
      WHEN v_event.type = 'match' AND v_event.opponent IS NOT NULL THEN 'Match vs ' || v_event.opponent
      WHEN v_event.type = 'match' THEN 'Match'
      WHEN v_event.type = 'training' THEN 'Entraînement'
      ELSE COALESCE(v_event.title, 'Événement')
    END;
    v_when := to_char(v_event.starts_at, 'DD/MM/YYYY à HH24:MI');
    v_headline := v_type_label ||
      CASE WHEN v_team_name <> '' THEN ' · ' || v_team_name ELSE '' END ||
      ' · ' || v_when;

    -- Recipients: team staff (coach/assistant_coach/admin/dirigeant) + club admins/dirigeants
    FOR v_manager IN
      SELECT DISTINCT uid FROM (
        SELECT tm.user_id AS uid
        FROM public.team_members tm
        WHERE tm.team_id = v_event.team_id
          AND tm.role::text IN ('coach','assistant_coach','admin','dirigeant')
          AND tm.user_id IS NOT NULL
        UNION
        SELECT cm.user_id AS uid
        FROM public.club_members cm
        WHERE cm.club_id = v_event.club_id
          AND (cm.role = 'admin' OR cm.role = 'dirigeant'
               OR (cm.roles IS NOT NULL AND (cm.roles && ARRAY['admin','dirigeant'])))
          AND cm.user_id IS NOT NULL
      ) s
      WHERE uid <> NEW.user_id
    LOOP
      SELECT COALESCE(NULLIF(LOWER(LEFT(p.preferred_language, 2)), ''), 'fr')
        INTO v_locale
      FROM public.profiles p WHERE p.id = v_manager.uid;
      v_locale := COALESCE(v_locale, 'fr');

      v_title := CASE v_locale
        WHEN 'en' THEN 'An assigned coach is no longer available'
        WHEN 'de' THEN 'Ein zugewiesener Trainer ist nicht mehr verfügbar'
        WHEN 'es' THEN 'Un entrenador asignado ya no está disponible'
        WHEN 'it' THEN 'Un allenatore assegnato non è più disponibile'
        WHEN 'nl' THEN 'Een toegewezen coach is niet meer beschikbaar'
        WHEN 'pt' THEN 'Um treinador atribuído já não está disponível'
        ELSE 'Un coach assigné est désormais indisponible'
      END;

      v_body := v_coach_name || ' · ' || v_headline;

      -- Dedup per (manager, event, coach)
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_manager.uid
          AND type = 'event_staff_conflict'
          AND link = v_link
          AND body = v_body
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_manager.uid, 'event_staff_conflict', v_title, v_body, v_link);
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event_staff_conflict ON public.staff_availabilities;
CREATE TRIGGER trg_notify_event_staff_conflict
AFTER INSERT ON public.staff_availabilities
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_staff_conflict();
