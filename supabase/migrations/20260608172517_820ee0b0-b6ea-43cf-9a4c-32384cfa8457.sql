CREATE OR REPLACE FUNCTION public.user_can_email_recipient(_user_id uuid, _email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (SELECT lower(_email) AS e),
  caller_clubs AS (
    SELECT club_id FROM public.club_members WHERE user_id = _user_id
  ),
  caller_tournaments AS (
    SELECT tournament_id FROM public.tournament_collaborators WHERE user_id = _user_id
    UNION
    SELECT id FROM public.tournaments WHERE created_by = _user_id
  )
  SELECT EXISTS (
    SELECT 1 FROM auth.users u, norm WHERE u.id = _user_id AND lower(u.email) = norm.e
  ) OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    JOIN auth.users u ON u.id = cm.user_id
    CROSS JOIN norm
    WHERE cm.club_id IN (SELECT club_id FROM caller_clubs)
      AND lower(u.email) = norm.e
  ) OR EXISTS (
    SELECT 1 FROM public.players p, norm
    WHERE p.club_id IN (SELECT club_id FROM caller_clubs)
      AND lower(p.email) = norm.e
  ) OR EXISTS (
    SELECT 1
    FROM public.player_parents pp
    JOIN public.players p ON p.id = pp.player_id
    CROSS JOIN norm
    WHERE p.club_id IN (SELECT club_id FROM caller_clubs)
      AND lower(pp.email) = norm.e
  ) OR EXISTS (
    SELECT 1 FROM public.member_invites mi, norm
    WHERE mi.club_id IN (SELECT club_id FROM caller_clubs)
      AND lower(mi.email) = norm.e
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_members tm, norm
    WHERE tm.tournament_id IN (SELECT tournament_id FROM caller_tournaments)
      AND lower(tm.email) = norm.e
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_collaborators tc, norm
    WHERE tc.tournament_id IN (SELECT tournament_id FROM caller_tournaments)
      AND lower(tc.email) = norm.e
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_registrations tr, norm
    WHERE tr.tournament_id IN (SELECT tournament_id FROM caller_tournaments)
      AND lower(tr.contact_email) = norm.e
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_email_recipient(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_email_recipient(uuid, text) TO authenticated, service_role;
