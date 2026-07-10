-- Trigger: enforce championship rule at the data layer for ALL write paths.
-- Source of truth = this trigger. Server functions may translate its errors into
-- friendly messages later, but must not diverge from the rule.

CREATE OR REPLACE FUNCTION public.enforce_event_championship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  champ RECORD;
  event_team_club_id uuid;
BEGIN
  IF NEW.competition_type = 'championship' THEN
    IF NEW.championship_id IS NULL THEN
      RAISE EXCEPTION 'championship_required'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT tc.id, tc.team_id, tc.club_id, tc.is_active, tc.name
      INTO champ
      FROM public.team_championships tc
     WHERE tc.id = NEW.championship_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'championship_not_found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF champ.team_id IS DISTINCT FROM NEW.team_id THEN
      RAISE EXCEPTION 'championship_team_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Club coherence: the championship's club must match the event team's club.
    SELECT t.club_id INTO event_team_club_id
      FROM public.teams t
     WHERE t.id = NEW.team_id;

    IF event_team_club_id IS NULL
       OR champ.club_id IS DISTINCT FROM event_team_club_id THEN
      RAISE EXCEPTION 'championship_club_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Archived championships: block at INSERT only. Updates on already-linked
    -- events remain allowed so users can still fix other fields on historical
    -- events whose championship was archived afterwards.
    IF TG_OP = 'INSERT' AND NOT champ.is_active THEN
      RAISE EXCEPTION 'championship_archived'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Snapshot rules for competition_name:
    --  * INSERT: always freeze the canonical championship name.
    --  * UPDATE: only refresh if the championship link itself changes;
    --    otherwise leave competition_name untouched so a later rename of the
    --    championship does not rewrite historical events.
    IF TG_OP = 'INSERT' THEN
      NEW.competition_name := champ.name;
    ELSIF TG_OP = 'UPDATE'
          AND NEW.championship_id IS DISTINCT FROM OLD.championship_id THEN
      NEW.competition_name := champ.name;
    END IF;

  ELSE
    -- Non-championship matches must not carry a championship_id.
    NEW.championship_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_event_championship_trg ON public.events;

CREATE TRIGGER enforce_event_championship_trg
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_championship();

COMMENT ON FUNCTION public.enforce_event_championship() IS
'Source of truth for the championship rule on events. Enforces championship_id validity (existence, same team, same club, is_active on INSERT) and freezes competition_name as a snapshot at create-time (refreshed only when championship_id is explicitly changed). Also nulls championship_id for non-championship matches. Applies to ALL write paths (server fns, direct client inserts, imports, RPCs, edge fns).';