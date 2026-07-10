
-- =====================================================================
-- 1. team_championships table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_championships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  season_label text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_championships_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT team_championships_team_name_unique UNIQUE (team_id, name)
);

CREATE INDEX IF NOT EXISTS team_championships_team_id_idx ON public.team_championships(team_id);
CREATE INDEX IF NOT EXISTS team_championships_club_id_idx ON public.team_championships(club_id);
CREATE INDEX IF NOT EXISTS team_championships_active_team_idx ON public.team_championships(team_id, is_active);

-- Grants (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_championships TO authenticated;
GRANT ALL ON public.team_championships TO service_role;

-- updated_at trigger (reuse existing helper)
DROP TRIGGER IF EXISTS update_team_championships_updated_at ON public.team_championships;
CREATE TRIGGER update_team_championships_updated_at
BEFORE UPDATE ON public.team_championships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enforce club_id == teams.club_id (server-side truth, cannot be forged by client)
CREATE OR REPLACE FUNCTION public.team_championships_enforce_club_team()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team_club uuid;
BEGIN
  SELECT club_id INTO v_team_club FROM public.teams WHERE id = NEW.team_id;
  IF v_team_club IS NULL THEN
    RAISE EXCEPTION 'team_championships: team % not found', NEW.team_id;
  END IF;
  -- Always align club_id to the team's club (never trust client)
  NEW.club_id := v_team_club;

  -- Prevent moving to another team on update
  IF TG_OP = 'UPDATE' AND NEW.team_id <> OLD.team_id THEN
    RAISE EXCEPTION 'team_championships: cannot change team_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_championships_enforce_club_team_ins ON public.team_championships;
CREATE TRIGGER team_championships_enforce_club_team_ins
BEFORE INSERT ON public.team_championships
FOR EACH ROW EXECUTE FUNCTION public.team_championships_enforce_club_team();

DROP TRIGGER IF EXISTS team_championships_enforce_club_team_upd ON public.team_championships;
CREATE TRIGGER team_championships_enforce_club_team_upd
BEFORE UPDATE ON public.team_championships
FOR EACH ROW EXECUTE FUNCTION public.team_championships_enforce_club_team();

-- Prevent hard delete when referenced by any event
CREATE OR REPLACE FUNCTION public.team_championships_block_delete_if_referenced()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE championship_id = OLD.id) THEN
    RAISE EXCEPTION 'championship_in_use'
      USING HINT = 'Archive the championship instead of deleting it.';
  END IF;
  RETURN OLD;
END;
$$;

-- RLS
ALTER TABLE public.team_championships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tchamp_select" ON public.team_championships;
CREATE POLICY "tchamp_select" ON public.team_championships
FOR SELECT TO authenticated
USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "tchamp_insert" ON public.team_championships;
CREATE POLICY "tchamp_insert" ON public.team_championships
FOR INSERT TO authenticated
WITH CHECK (public.is_team_coach(auth.uid(), team_id));

DROP POLICY IF EXISTS "tchamp_update" ON public.team_championships;
CREATE POLICY "tchamp_update" ON public.team_championships
FOR UPDATE TO authenticated
USING (public.is_team_coach(auth.uid(), team_id))
WITH CHECK (public.is_team_coach(auth.uid(), team_id));

DROP POLICY IF EXISTS "tchamp_delete" ON public.team_championships;
CREATE POLICY "tchamp_delete" ON public.team_championships
FOR DELETE TO authenticated
USING (public.is_team_coach(auth.uid(), team_id));

-- =====================================================================
-- 2. events.championship_id
-- =====================================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS championship_id uuid NULL
  REFERENCES public.team_championships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_championship_id_idx ON public.events(championship_id);

-- Attach the delete-blocking trigger after events.championship_id exists
DROP TRIGGER IF EXISTS team_championships_block_delete ON public.team_championships;
CREATE TRIGGER team_championships_block_delete
BEFORE DELETE ON public.team_championships
FOR EACH ROW EXECUTE FUNCTION public.team_championships_block_delete_if_referenced();

-- Deprecation note
COMMENT ON COLUMN public.teams.championship IS
  'DEPRECATED: kept for backward compatibility. Use public.team_championships instead. Do not write to this column from new code.';

COMMENT ON COLUMN public.events.competition_name IS
  'Historical snapshot of the championship/competition name at event creation time. Do NOT overwrite when a championship is renamed.';

COMMENT ON COLUMN public.events.championship_id IS
  'Stable reference to public.team_championships. NULL for friendly/cup or historical events with ambiguous mapping.';

-- =====================================================================
-- 3. Data migration
-- =====================================================================

-- Step B: create a team_championships row for each team with a non-empty legacy championship
INSERT INTO public.team_championships (club_id, team_id, name, is_active)
SELECT t.club_id, t.id, trim(t.championship), true
FROM public.teams t
WHERE t.championship IS NOT NULL
  AND length(trim(t.championship)) > 0
ON CONFLICT (team_id, name) DO NOTHING;

-- Step C: link existing events only when unambiguous
-- (same team + case-insensitive/trim-equivalent name + exactly one candidate)
WITH candidates AS (
  SELECT
    e.id AS event_id,
    tc.id AS championship_id,
    COUNT(*) OVER (PARTITION BY e.id) AS n_matches
  FROM public.events e
  JOIN public.team_championships tc
    ON tc.team_id = e.team_id
   AND lower(trim(tc.name)) = lower(trim(e.competition_name))
  WHERE e.championship_id IS NULL
    AND e.type = 'match'
    AND e.competition_type = 'championship'
    AND e.team_id IS NOT NULL
    AND e.competition_name IS NOT NULL
    AND length(trim(e.competition_name)) > 0
)
UPDATE public.events e
SET championship_id = c.championship_id
FROM candidates c
WHERE c.event_id = e.id
  AND c.n_matches = 1;

-- =====================================================================
-- 4. Migration report (raised as NOTICE for logs)
-- =====================================================================
DO $$
DECLARE
  v_teams_with_legacy int;
  v_champs_created int;
  v_events_linked int;
  v_events_champ_null int;
  v_cross_club int;
BEGIN
  SELECT count(*) INTO v_teams_with_legacy
  FROM public.teams WHERE championship IS NOT NULL AND length(trim(championship)) > 0;

  SELECT count(*) INTO v_champs_created FROM public.team_championships;

  SELECT count(*) INTO v_events_linked
  FROM public.events WHERE championship_id IS NOT NULL;

  SELECT count(*) INTO v_events_champ_null
  FROM public.events
  WHERE type = 'match' AND competition_type = 'championship' AND championship_id IS NULL;

  SELECT count(*) INTO v_cross_club
  FROM public.team_championships tc
  JOIN public.teams t ON t.id = tc.team_id
  WHERE tc.club_id <> t.club_id;

  RAISE NOTICE 'team_championships migration report:';
  RAISE NOTICE '  teams with legacy championship: %', v_teams_with_legacy;
  RAISE NOTICE '  championships in table: %', v_champs_created;
  RAISE NOTICE '  events linked to a championship: %', v_events_linked;
  RAISE NOTICE '  championship events still NULL (ambiguous or unmatched): %', v_events_champ_null;
  RAISE NOTICE '  cross-club inconsistencies (should be 0): %', v_cross_club;
END;
$$;
