-- 1) Colonne archived_at (additive)
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_teams_archived_at ON public.teams (archived_at) WHERE archived_at IS NOT NULL;

-- 2) team_has_history : true si l'équipe a une activité sportive réelle
CREATE OR REPLACE FUNCTION public.team_has_history(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club uuid;
BEGIN
  SELECT club_id INTO _club FROM public.teams WHERE id = _id;
  IF _club IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF NOT public.is_club_member(auth.uid(), _club) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN
    EXISTS (SELECT 1 FROM public.events WHERE team_id = _id AND deleted_at IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.convocations c
      JOIN public.events e ON e.id = c.event_id
      WHERE e.team_id = _id
    )
    OR EXISTS (SELECT 1 FROM public.challenges WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.training_series WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.coach_insights WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.player_feedback WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.player_suspensions WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.team_championships WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.payment_items WHERE team_id = _id)
    OR EXISTS (SELECT 1 FROM public.payment_assignments WHERE target_team_id = _id);
END;
$$;

REVOKE ALL ON FUNCTION public.team_has_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_has_history(uuid) TO authenticated;

-- 3) delete_team_if_empty : soft-delete si aucun historique sportif
CREATE OR REPLACE FUNCTION public.delete_team_if_empty(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club uuid;
BEGIN
  SELECT club_id INTO _club FROM public.teams WHERE id = _id;
  IF _club IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF NOT public.has_club_role(auth.uid(), _club, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF public.team_has_history(_id) THEN
    RAISE EXCEPTION 'team_has_history';
  END IF;
  UPDATE public.teams SET deleted_at = now() WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_team_if_empty(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_team_if_empty(uuid) TO authenticated;

-- 4) archive_team / unarchive_team (admin-only)
CREATE OR REPLACE FUNCTION public.archive_team(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club uuid;
BEGIN
  SELECT club_id INTO _club FROM public.teams WHERE id = _id;
  IF _club IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF NOT public.has_club_role(auth.uid(), _club, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.teams SET archived_at = now() WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_team(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club uuid;
BEGIN
  SELECT club_id INTO _club FROM public.teams WHERE id = _id;
  IF _club IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF NOT public.has_club_role(auth.uid(), _club, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.teams SET archived_at = NULL WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.unarchive_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unarchive_team(uuid) TO authenticated;

-- 5) Trigger BEFORE INSERT sur events : refuser si l'équipe cible est archivée
CREATE OR REPLACE FUNCTION public.prevent_event_on_archived_team()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _archived timestamptz;
BEGIN
  IF NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT archived_at INTO _archived FROM public.teams WHERE id = NEW.team_id;
  IF _archived IS NOT NULL THEN
    RAISE EXCEPTION 'team_archived';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_on_archived_team ON public.events;
CREATE TRIGGER trg_prevent_event_on_archived_team
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_event_on_archived_team();