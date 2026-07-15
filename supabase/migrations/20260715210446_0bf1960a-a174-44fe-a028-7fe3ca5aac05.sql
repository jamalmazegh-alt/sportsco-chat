-- Lot B — RPC unifiée de lecture de la config de visibilité (staff-gated)
--
-- Un seul chemin de lecture pour les 3 formulaires (event/team/club).
-- Interdit tout select raw sur events/teams/clubs pour le réglage
-- show_called_up_players_* dans l'UI.
--
-- Retour :
--   scope='club'  → event_override=NULL, team_override=NULL, club_default=<v>,
--                   effective=<v>, source='club'
--   scope='team'  → event_override=NULL, team_override=<t>, club_default=<c>,
--                   effective=COALESCE(t,c), source='team' si t IS NOT NULL sinon 'club'
--   scope='event' → cascade complète, source='event'|'team'|'club'
--
-- Un override présent est toujours reporté comme source de son niveau,
-- même s'il est identique au parent (spec cadrage B, décision 2 : "défini ici"
-- honnête plutôt que "hérité" trompeur).

-- Suppression de l'ancienne fonction event-only
DROP FUNCTION IF EXISTS public.get_call_up_visibility_config(uuid);

CREATE OR REPLACE FUNCTION public.get_call_up_visibility_config(
  _scope text,
  _id uuid
)
RETURNS TABLE(
  event_override boolean,
  team_override boolean,
  club_default boolean,
  effective boolean,
  source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _team_id uuid;
  _club_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF _scope NOT IN ('event', 'team', 'club') THEN
    RAISE EXCEPTION 'invalid scope: %', _scope USING ERRCODE = '22023';
  END IF;

  IF _scope = 'event' THEN
    SELECT e.team_id, t.club_id INTO _team_id, _club_id
    FROM public.events e
    JOIN public.teams t ON t.id = e.team_id
    WHERE e.id = _id;

    IF _team_id IS NULL THEN
      RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_team_staff_of_event(_id, _uid) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      e.show_called_up_players_override,
      t.show_called_up_players_override,
      c.show_called_up_players_default,
      COALESCE(
        e.show_called_up_players_override,
        t.show_called_up_players_override,
        c.show_called_up_players_default,
        true
      ),
      CASE
        WHEN e.show_called_up_players_override IS NOT NULL THEN 'event'
        WHEN t.show_called_up_players_override IS NOT NULL THEN 'team'
        ELSE 'club'
      END
    FROM public.events e
    JOIN public.teams t ON t.id = e.team_id
    JOIN public.clubs c ON c.id = t.club_id
    WHERE e.id = _id;

  ELSIF _scope = 'team' THEN
    SELECT t.club_id INTO _club_id
    FROM public.teams t
    WHERE t.id = _id;

    IF _club_id IS NULL THEN
      RAISE EXCEPTION 'team not found' USING ERRCODE = 'P0002';
    END IF;

    -- Staff de l'équipe = coach de l'équipe OU admin du club propriétaire
    IF NOT (
      public.is_team_coach(_uid, _id)
      OR public.has_club_role(_uid, _club_id, 'admin'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      NULL::boolean,
      t.show_called_up_players_override,
      c.show_called_up_players_default,
      COALESCE(
        t.show_called_up_players_override,
        c.show_called_up_players_default,
        true
      ),
      CASE
        WHEN t.show_called_up_players_override IS NOT NULL THEN 'team'
        ELSE 'club'
      END
    FROM public.teams t
    JOIN public.clubs c ON c.id = t.club_id
    WHERE t.id = _id;

  ELSE -- 'club'
    IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _id) THEN
      RAISE EXCEPTION 'club not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_club_staff(_uid, _id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      NULL::boolean,
      NULL::boolean,
      c.show_called_up_players_default,
      c.show_called_up_players_default, -- club = racine, NOT NULL DEFAULT true
      'club'::text
    FROM public.clubs c
    WHERE c.id = _id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_call_up_visibility_config(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_call_up_visibility_config(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_call_up_visibility_config(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_call_up_visibility_config(text, uuid) TO service_role;

COMMENT ON FUNCTION public.get_call_up_visibility_config(text, uuid) IS
  'Lot B — RPC unifiée de lecture de la config de visibilité (event/team/club). Staff-gated par niveau. Chemin unique pour les 3 formulaires ; aucun select raw autorisé côté client sur show_called_up_players_*. Ne PAS l''utiliser pour gater l''affichage : pour ça, call_up_list_visible(event_id).';