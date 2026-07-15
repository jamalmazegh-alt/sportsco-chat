
-- ============================================================================
-- Lot A — Visibilité liste des convoqués (héritage Club → Équipe → Événement)
-- ============================================================================

-- 1) Colonnes de configuration
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS show_called_up_players_default boolean NOT NULL DEFAULT true;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS show_called_up_players_override boolean NULL DEFAULT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS show_called_up_players_override boolean NULL DEFAULT NULL;

-- 2) Fonction source de vérité unique — cascade Club → Équipe → Événement
CREATE OR REPLACE FUNCTION public.call_up_list_visible(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(
        e.show_called_up_players_override,
        t.show_called_up_players_override,
        c.show_called_up_players_default
      )
      FROM public.events e
      JOIN public.teams t ON t.id = e.team_id
      JOIN public.clubs c ON c.id = t.club_id
      WHERE e.id = p_event_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.call_up_list_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.call_up_list_visible(uuid) TO authenticated, anon, service_role;

-- 3) Helper: staff (admin du club propriétaire OU coach de l'équipe) d'un événement
--    Dérivation stricte events.team_id → teams.club_id (jamais events.club_id).
CREATE OR REPLACE FUNCTION public.is_team_staff_of_event(p_event_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.teams t ON t.id = e.team_id
    WHERE e.id = p_event_id
      AND (
        public.is_team_coach(p_user_id, t.id)
        OR public.has_club_role(p_user_id, t.club_id, 'admin'::public.app_role)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_team_staff_of_event(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_staff_of_event(uuid, uuid) TO authenticated, service_role;

-- 4) Policy RESTRICTIVE sur convocations (SELECT)
--    Combinée en AND avec la policy permissive existante convocations_select.
--    Laisse passer : staff club/équipe, liste visible, joueur lui-même, parent lié.
DROP POLICY IF EXISTS "convocations_visibility_gate" ON public.convocations;

CREATE POLICY "convocations_visibility_gate"
ON public.convocations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_team_staff_of_event(event_id, (SELECT auth.uid()))
  OR public.call_up_list_visible(event_id)
  OR player_id IN (
    SELECT id FROM public.players WHERE user_id = (SELECT auth.uid())
  )
  OR player_id IN (
    SELECT player_id FROM public.player_parents WHERE parent_user_id = (SELECT auth.uid())
  )
);

-- 5) Policy RESTRICTIVE sur event_lineups (SELECT)
--    Miroir strict : quand la liste est masquée, aucune ligne de compo n'est retournée.
--    Le joueur voit toujours sa convocation individuelle (table convocations).
DROP POLICY IF EXISTS "event_lineups_visibility_gate" ON public.event_lineups;

CREATE POLICY "event_lineups_visibility_gate"
ON public.event_lineups
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_team_staff_of_event(event_id, (SELECT auth.uid()))
  OR public.call_up_list_visible(event_id)
);
