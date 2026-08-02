REVOKE ALL ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_club_invite_v2(text, text, date, text, text, text, text, date, text) TO authenticated;