REVOKE EXECUTE ON FUNCTION public.redeem_member_invite(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.redeem_member_invite(text) TO authenticated;