
REVOKE EXECUTE ON FUNCTION public.is_club_staff(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.player_belongs_to_user(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_is_in_team(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_read_challenge(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.challenge_passage_check_event() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.challenges_set_updated_at() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_club_staff(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_belongs_to_user(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_in_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_challenge(uuid, uuid) TO authenticated, service_role;
