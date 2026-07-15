-- Lot B — RPC de lecture de la config de visibilité (staff-gated)
--
-- Retourne les trois valeurs raw (event_override, team_override, club_default),
-- la valeur effective résolue (cascade event → team → club, fallback true),
-- et la source réelle ('event' | 'team' | 'club') : un override présent est
-- toujours reporté comme la source, même s'il est identique au parent.
--
-- Réservée au staff de l'équipe propriétaire de l'événement (vérifié via
-- is_team_staff_of_event). Non exposée à anon. SECURITY DEFINER avec
-- search_path vide pour éviter l'injection de schéma.

CREATE OR REPLACE FUNCTION public.get_call_up_visibility_config(_event_id uuid)
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
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT e.team_id INTO _team_id
  FROM public.events e
  WHERE e.id = _event_id;

  IF _team_id IS NULL THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_team_staff_of_event(_event_id, _uid) THEN
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
  WHERE e.id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_call_up_visibility_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_call_up_visibility_config(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_call_up_visibility_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_call_up_visibility_config(uuid) TO service_role;

COMMENT ON FUNCTION public.get_call_up_visibility_config(uuid) IS
  'Lot B — Config de visibilité de la liste des convoqués pour un événement. Staff-gated (is_team_staff_of_event). Retourne les 3 raw + effective + source réelle (override présent = source, même si identique au parent). N''EST PAS un check de gating : pour décider si un non-staff peut voir la liste, utiliser call_up_list_visible(event_id).';