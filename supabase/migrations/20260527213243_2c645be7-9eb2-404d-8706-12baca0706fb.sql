
-- 1. events: add carpool_enabled
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS carpool_enabled boolean NOT NULL DEFAULT false;

-- Auto-enable on insert when not home
CREATE OR REPLACE FUNCTION public.events_autoenable_carpool()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_home = false AND NEW.carpool_enabled = false THEN
    NEW.carpool_enabled := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_autoenable_carpool ON public.events;
CREATE TRIGGER trg_events_autoenable_carpool
BEFORE INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.events_autoenable_carpool();

-- 2. carpools
CREATE TABLE public.carpools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  driver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_name text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('car','van')),
  total_seats integer NOT NULL CHECK (total_seats BETWEEN 1 AND 8),
  departure_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, driver_user_id)
);
CREATE INDEX carpools_event_id_idx ON public.carpools(event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpools TO authenticated;
GRANT ALL ON public.carpools TO service_role;

ALTER TABLE public.carpools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carpools_select" ON public.carpools FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpools.event_id AND public.can_view_team(auth.uid(), e.team_id)));

CREATE POLICY "carpools_insert" ON public.carpools FOR INSERT TO authenticated
WITH CHECK (
  driver_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpools.event_id AND public.can_view_team(auth.uid(), e.team_id))
);

CREATE POLICY "carpools_update_own_or_coach" ON public.carpools FOR UPDATE TO authenticated
USING (
  driver_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpools.event_id AND public.is_team_coach(auth.uid(), e.team_id))
)
WITH CHECK (
  driver_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpools.event_id AND public.is_team_coach(auth.uid(), e.team_id))
);

CREATE POLICY "carpools_delete_own_or_coach" ON public.carpools FOR DELETE TO authenticated
USING (
  driver_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpools.event_id AND public.is_team_coach(auth.uid(), e.team_id))
);

-- 3. carpool_passengers
CREATE TABLE public.carpool_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id uuid NOT NULL REFERENCES public.carpools(id) ON DELETE CASCADE,
  passenger_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (carpool_id, passenger_user_id)
);
CREATE INDEX carpool_passengers_carpool_id_idx ON public.carpool_passengers(carpool_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpool_passengers TO authenticated;
GRANT ALL ON public.carpool_passengers TO service_role;

ALTER TABLE public.carpool_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carpool_passengers_select" ON public.carpool_passengers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.carpools c JOIN public.events e ON e.id = c.event_id
  WHERE c.id = carpool_passengers.carpool_id AND public.can_view_team(auth.uid(), e.team_id)
));

CREATE POLICY "carpool_passengers_insert" ON public.carpool_passengers FOR INSERT TO authenticated
WITH CHECK (
  passenger_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.carpools c JOIN public.events e ON e.id = c.event_id
              WHERE c.id = carpool_passengers.carpool_id AND public.can_view_team(auth.uid(), e.team_id))
);

CREATE POLICY "carpool_passengers_delete_own_or_coach" ON public.carpool_passengers FOR DELETE TO authenticated
USING (
  passenger_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.carpools c JOIN public.events e ON e.id = c.event_id
             WHERE c.id = carpool_passengers.carpool_id AND public.is_team_coach(auth.uid(), e.team_id))
);

-- Trigger: one carpool per passenger per event
CREATE OR REPLACE FUNCTION public.carpool_passengers_one_per_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event uuid;
BEGIN
  SELECT event_id INTO v_event FROM public.carpools WHERE id = NEW.carpool_id;
  IF EXISTS (
    SELECT 1 FROM public.carpool_passengers p
    JOIN public.carpools c ON c.id = p.carpool_id
    WHERE c.event_id = v_event
      AND p.passenger_user_id = NEW.passenger_user_id
      AND p.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'already_booked_in_another_carpool'
      USING HINT = 'Vous avez déjà réservé une place dans un autre véhicule pour cet événement.';
  END IF;
  -- Driver cannot book own car
  IF EXISTS (
    SELECT 1 FROM public.carpools c
    WHERE c.id = NEW.carpool_id AND c.driver_user_id = NEW.passenger_user_id
  ) THEN
    RAISE EXCEPTION 'driver_cannot_book_own_car';
  END IF;
  -- Auto-clean any carpool_needs for this parent on this event
  DELETE FROM public.carpool_needs
   WHERE event_id = v_event AND parent_user_id = NEW.passenger_user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_carpool_passengers_one_per_event
BEFORE INSERT ON public.carpool_passengers
FOR EACH ROW EXECUTE FUNCTION public.carpool_passengers_one_per_event();

-- 4. carpool_needs
CREATE TABLE public.carpool_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, parent_user_id)
);
CREATE INDEX carpool_needs_event_id_idx ON public.carpool_needs(event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carpool_needs TO authenticated;
GRANT ALL ON public.carpool_needs TO service_role;

ALTER TABLE public.carpool_needs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carpool_needs_select" ON public.carpool_needs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpool_needs.event_id AND public.can_view_team(auth.uid(), e.team_id)));

CREATE POLICY "carpool_needs_insert" ON public.carpool_needs FOR INSERT TO authenticated
WITH CHECK (
  parent_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpool_needs.event_id AND public.can_view_team(auth.uid(), e.team_id))
);

CREATE POLICY "carpool_needs_update_own" ON public.carpool_needs FOR UPDATE TO authenticated
USING (parent_user_id = auth.uid())
WITH CHECK (parent_user_id = auth.uid());

CREATE POLICY "carpool_needs_delete_own_or_coach" ON public.carpool_needs FOR DELETE TO authenticated
USING (
  parent_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = carpool_needs.event_id AND public.is_team_coach(auth.uid(), e.team_id))
);

-- 5. Notifications triggers

-- new driver -> notify convoked parents without transport
CREATE OR REPLACE FUNCTION public.notify_carpool_new_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_seats text;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;
  v_seats := NEW.total_seats::text;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT DISTINCT pp.parent_user_id,
         'carpool_new_driver',
         v_event.title,
         '🚗 ' || NEW.driver_name || ' propose ' || v_seats || ' places',
         '/events/' || v_event.id::text
  FROM public.convocations c
  JOIN public.players p ON p.id = c.player_id
  JOIN public.player_parents pp ON pp.player_id = p.id
  WHERE c.event_id = NEW.event_id
    AND c.status IN ('present','uncertain','pending')
    AND pp.parent_user_id IS NOT NULL
    AND pp.parent_user_id <> NEW.driver_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.carpool_passengers cp
      JOIN public.carpools cc ON cc.id = cp.carpool_id
      WHERE cc.event_id = NEW.event_id AND cp.passenger_user_id = pp.parent_user_id
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_carpool_new_driver
AFTER INSERT ON public.carpools
FOR EACH ROW EXECUTE FUNCTION public.notify_carpool_new_driver();

-- new booking -> notify driver
CREATE OR REPLACE FUNCTION public.notify_carpool_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver uuid;
  v_event_id uuid;
  v_event_title text;
  v_passenger_name text;
  v_players text;
BEGIN
  SELECT c.driver_user_id, c.event_id, e.title
    INTO v_driver, v_event_id, v_event_title
  FROM public.carpools c JOIN public.events e ON e.id = c.event_id
  WHERE c.id = NEW.carpool_id;

  SELECT COALESCE(NULLIF(trim(full_name), ''), 'Parent') INTO v_passenger_name
  FROM public.profiles WHERE id = NEW.passenger_user_id;

  SELECT string_agg(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ', ')
  INTO v_players
  FROM public.players WHERE id = ANY(NEW.player_ids);

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_driver, 'carpool_booked', v_event_title,
          v_passenger_name || ' a réservé une place' || COALESCE(' · ' || v_players, ''),
          '/events/' || v_event_id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_carpool_booked
AFTER INSERT ON public.carpool_passengers
FOR EACH ROW EXECUTE FUNCTION public.notify_carpool_booked();

-- cancellation -> notify driver
CREATE OR REPLACE FUNCTION public.notify_carpool_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver uuid;
  v_event_id uuid;
  v_event_title text;
  v_passenger_name text;
BEGIN
  SELECT c.driver_user_id, c.event_id, e.title
    INTO v_driver, v_event_id, v_event_title
  FROM public.carpools c JOIN public.events e ON e.id = c.event_id
  WHERE c.id = OLD.carpool_id;

  IF v_driver IS NULL OR v_driver = OLD.passenger_user_id THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), 'Parent') INTO v_passenger_name
  FROM public.profiles WHERE id = OLD.passenger_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_driver, 'carpool_cancelled', v_event_title,
          v_passenger_name || ' a annulé sa réservation',
          '/events/' || v_event_id::text);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_notify_carpool_cancelled
AFTER DELETE ON public.carpool_passengers
FOR EACH ROW EXECUTE FUNCTION public.notify_carpool_cancelled();

-- need ride -> notify team coaches
CREATE OR REPLACE FUNCTION public.notify_carpool_needs_ride()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_players text;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;

  SELECT string_agg(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ', ')
  INTO v_players
  FROM public.players WHERE id = ANY(NEW.player_ids);

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT DISTINCT tm.user_id,
         'carpool_needs_ride',
         v_event.title,
         COALESCE(v_players, 'Un joueur') || ' a besoin d''un transport',
         '/events/' || v_event.id::text
  FROM public.team_members tm
  WHERE tm.team_id = v_event.team_id
    AND tm.role IN ('coach','admin')
    AND tm.user_id IS NOT NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_carpool_needs_ride
AFTER INSERT ON public.carpool_needs
FOR EACH ROW EXECUTE FUNCTION public.notify_carpool_needs_ride();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.carpools;
ALTER PUBLICATION supabase_realtime ADD TABLE public.carpool_passengers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.carpool_needs;
