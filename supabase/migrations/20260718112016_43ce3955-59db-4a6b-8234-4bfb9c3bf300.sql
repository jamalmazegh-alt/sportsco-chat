
CREATE OR REPLACE FUNCTION public.resolve_audience_members(_club_id uuid, _spec jsonb)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sel jsonb;
  sel_type text;
  uids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_club_staff(auth.uid(), _club_id))
  ) THEN
    RETURN;
  END IF;

  IF _club_id IS NULL OR _spec IS NULL OR jsonb_typeof(_spec) <> 'array' THEN
    RETURN;
  END IF;

  FOR sel IN SELECT * FROM jsonb_array_elements(_spec)
  LOOP
    sel_type := sel->>'type';

    IF sel_type = 'team_players' THEN
      -- Joueurs uniquement : comptes joueur actifs, aucun fallback parent.
      uids := uids || ARRAY(
        SELECT DISTINCT p.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.players p ON p.id = tm.player_id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NOT NULL
      );

    ELSIF sel_type = 'team_parents' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        JOIN public.player_parents pp ON pp.player_id = tm.player_id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND pp.parent_user_id IS NOT NULL
      );

    ELSIF sel_type = 'team_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE t.id = (sel->>'team_id')::uuid
          AND t.club_id = _club_id
          AND tm.user_id IS NOT NULL
          AND tm.role::text = ANY (ARRAY['coach','assistant_coach'])
      );

    ELSIF sel_type = 'category_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE t.club_id = _club_id
          AND t.age_group = (sel->>'category')
          AND tm.user_id IS NOT NULL
          AND tm.role::text = ANY (ARRAY['coach','assistant_coach'])
      );

    ELSIF sel_type = 'club_educators' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND (cm.roles && ARRAY['coach','assistant_coach']::text[])
      );

    ELSIF sel_type = 'club_staff' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND (cm.roles && ARRAY['admin','coach','assistant_coach','staff','tournament_manager','dirigeant']::text[])
      );

    ELSIF sel_type = 'club_admins' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND (cm.roles && ARRAY['admin']::text[])
      );

    ELSIF sel_type = 'club_members' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT cm.user_id
        FROM public.club_members cm
        WHERE cm.club_id = _club_id
          AND cm.user_id IS NOT NULL
      );

    ELSIF sel_type = 'convoked_players' THEN
      uids := uids || ARRAY(
        SELECT DISTINCT p.user_id
        FROM public.convocations c
        JOIN public.events e ON e.id = c.event_id
        JOIN public.teams t ON t.id = e.team_id
        JOIN public.players p ON p.id = c.player_id
        WHERE e.id = (sel->>'event_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NOT NULL
      );
      uids := uids || ARRAY(
        SELECT DISTINCT pp.parent_user_id
        FROM public.convocations c
        JOIN public.events e ON e.id = c.event_id
        JOIN public.teams t ON t.id = e.team_id
        JOIN public.players p ON p.id = c.player_id
        JOIN public.player_parents pp ON pp.player_id = p.id
        WHERE e.id = (sel->>'event_id')::uuid
          AND t.club_id = _club_id
          AND p.user_id IS NULL
          AND pp.parent_user_id IS NOT NULL
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT DISTINCT u FROM unnest(uids) AS u WHERE u IS NOT NULL;
END;
$function$;
