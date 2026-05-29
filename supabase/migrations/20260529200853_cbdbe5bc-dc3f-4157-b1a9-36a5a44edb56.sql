
-- 1) events.is_official
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_event_is_official_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_official IS NULL OR NEW.is_official = false THEN
      IF NEW.type = 'match' THEN NEW.is_official := true; END IF;
    END IF;
    IF NEW.type IN ('training','meeting') THEN NEW.is_official := false; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.type IN ('training','meeting') THEN NEW.is_official := false; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_event_is_official ON public.events;
CREATE TRIGGER trg_set_event_is_official
BEFORE INSERT OR UPDATE OF type, is_official ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_event_is_official_default();

-- 2) player_suspensions
CREATE TABLE IF NOT EXISTS public.player_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  suspension_reason text NOT NULL CHECK (suspension_reason IN ('red_card','accumulated_yellow_cards','federation_sanction','club_sanction','other')),
  suspension_notes text,
  matches_to_serve integer NOT NULL CHECK (matches_to_serve > 0),
  matches_served integer NOT NULL DEFAULT 0 CHECK (matches_served >= 0),
  suspension_start_date date NOT NULL DEFAULT CURRENT_DATE,
  first_match_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  served_event_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_suspensions_player_status ON public.player_suspensions(player_id, status);
CREATE INDEX IF NOT EXISTS idx_player_suspensions_team_status ON public.player_suspensions(team_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_suspensions TO authenticated;
GRANT ALL ON public.player_suspensions TO service_role;

ALTER TABLE public.player_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches/admins read suspensions"
  ON public.player_suspensions FOR SELECT TO authenticated
  USING (
    public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR public.has_club_role(auth.uid(), club_id, 'coach'::app_role)
  );

CREATE POLICY "Coaches/admins insert suspensions"
  ON public.player_suspensions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR public.has_club_role(auth.uid(), club_id, 'coach'::app_role)
  );

CREATE POLICY "Coaches/admins update suspensions"
  ON public.player_suspensions FOR UPDATE TO authenticated
  USING (
    public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR public.has_club_role(auth.uid(), club_id, 'coach'::app_role)
  )
  WITH CHECK (
    public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR public.has_club_role(auth.uid(), club_id, 'coach'::app_role)
  );

CREATE POLICY "Admins delete suspensions"
  ON public.player_suspensions FOR DELETE TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_player_suspension()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_player_suspension ON public.player_suspensions;
CREATE TRIGGER trg_touch_player_suspension
BEFORE UPDATE ON public.player_suspensions
FOR EACH ROW EXECUTE FUNCTION public.touch_player_suspension();

-- 3) Auto-decrement on completed official match
CREATE OR REPLACE FUNCTION public.decrement_suspensions_on_event_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  conv RECORD;
  susp RECORD;
  coach_member RECORD;
  player_name text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' OR NEW.is_official IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  FOR conv IN
    SELECT player_id FROM public.convocations
    WHERE event_id = NEW.id AND status = 'present'
  LOOP
    FOR susp IN
      SELECT * FROM public.player_suspensions
      WHERE player_id = conv.player_id
        AND team_id = NEW.team_id
        AND status = 'active'
        AND NOT (NEW.id = ANY(served_event_ids))
      FOR UPDATE
    LOOP
      UPDATE public.player_suspensions ps
      SET matches_served = ps.matches_served + 1,
          served_event_ids = ps.served_event_ids || NEW.id,
          status = CASE WHEN ps.matches_served + 1 >= ps.matches_to_serve THEN 'completed' ELSE 'active' END
      WHERE ps.id = susp.id
      RETURNING * INTO susp;

      IF susp.status = 'completed' THEN
        SELECT first_name, last_name INTO player_name
          FROM (SELECT first_name || ' ' || last_name AS player_name FROM public.players WHERE id = susp.player_id) x;
        FOR coach_member IN
          SELECT DISTINCT tm.user_id
          FROM public.team_members tm
          WHERE tm.team_id = NEW.team_id
            AND tm.role IN ('coach','assistant_coach')
            AND tm.user_id IS NOT NULL
        LOOP
          INSERT INTO public.notifications (user_id, type, title, body, data)
          VALUES (
            coach_member.user_id,
            'suspension_completed',
            'Player eligible again',
            COALESCE(player_name, 'Player') || ' is now eligible for official matches again.',
            jsonb_build_object('player_id', susp.player_id, 'team_id', NEW.team_id, 'suspension_id', susp.id)
          );
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decrement_suspensions ON public.events;
CREATE TRIGGER trg_decrement_suspensions
AFTER UPDATE OF status ON public.events
FOR EACH ROW EXECUTE FUNCTION public.decrement_suspensions_on_event_complete();
