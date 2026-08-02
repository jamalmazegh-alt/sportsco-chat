-- The child_phone overload (9 args) was created without EXECUTE for
-- authenticated, then the previous 8-arg signature (which had the grant)
-- was dropped. Without this, redeem_club_invite_v2 is unusable by clients.
REVOKE ALL ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date, text) TO authenticated;
