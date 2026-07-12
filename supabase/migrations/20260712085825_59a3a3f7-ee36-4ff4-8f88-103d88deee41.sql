CREATE OR REPLACE FUNCTION public.delete_player_smart(_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_club uuid;
  v_deps bigint := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT club_id INTO v_club FROM public.players WHERE id = _id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;

  IF NOT (has_club_role(v_user, v_club, 'admin'::app_role)
          OR has_club_role(v_user, v_club, 'coach'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Historical dependencies (everything referencing players(id) EXCEPT
  -- team_members and player_parents which are membership/contact).
  SELECT
    (SELECT count(*) FROM public.convocations WHERE player_id = _id)
    + (SELECT count(*) FROM public.member_invites WHERE player_id = _id OR parent_for_player_id = _id)
    + (SELECT count(*) FROM public.player_feedback WHERE player_id = _id)
    + (SELECT count(*) FROM public.player_reviews WHERE player_id = _id)
    + (SELECT count(*) FROM public.player_suspensions WHERE player_id = _id)
    + (SELECT count(*) FROM public.player_achievements WHERE player_id = _id)
    + (SELECT count(*) FROM public.player_seasons WHERE player_id = _id)
    + (SELECT count(*) FROM public.player_timeline_events WHERE player_id = _id)
    + (SELECT count(*) FROM public.follows WHERE followed_player_id = _id)
    + (SELECT count(*) FROM public.feed_events WHERE actor_player_id = _id)
    + (SELECT count(*) FROM public.player_availabilities WHERE player_id = _id)
    + (SELECT count(*) FROM public.player_guardians WHERE player_id = _id)
    + (SELECT count(*) FROM public.payment_assignments WHERE target_player_id = _id)
    + (SELECT count(*) FROM public.payment_obligations WHERE player_id = _id)
    + (SELECT count(*) FROM public.challenge_results WHERE player_id = _id)
  INTO v_deps;

  IF v_deps = 0 THEN
    DELETE FROM public.players WHERE id = _id;
    RETURN 'hard';
  END IF;

  UPDATE public.players SET deleted_at = now() WHERE id = _id;
  RETURN 'soft';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_player_smart(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_player_smart(uuid) TO authenticated;