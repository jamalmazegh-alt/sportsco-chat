REVOKE EXECUTE ON FUNCTION public.has_convocation_in_team(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_convocation_in_team(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_convocation_in_team(uuid, uuid) TO authenticated;