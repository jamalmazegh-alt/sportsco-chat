
REVOKE SELECT (response_token) ON public.convocations FROM authenticated, anon;
REVOKE SELECT (token) ON public.member_invites FROM authenticated, anon;
REVOKE SELECT (invitation_token) ON public.tournament_collaborators FROM authenticated, anon;
REVOKE SELECT (invite_token) ON public.tournament_members FROM authenticated, anon;
REVOKE SELECT (stripe_session_id, stripe_payment_intent_id) ON public.tournament_passes FROM authenticated, anon;
REVOKE SELECT (stripe_payment_intent_id, stripe_charge_id, stripe_session_id, payment_intent_id, platform_fee, roster_token) ON public.tournament_registrations FROM authenticated, anon;

ALTER FUNCTION public.gen_player_public_slug() SET search_path = public;
ALTER FUNCTION public.gen_player_public_slug(text, text, date) SET search_path = public;
ALTER FUNCTION public.gen_coach_public_slug(text, text) SET search_path = public;
ALTER FUNCTION public.unaccent_compat(text) SET search_path = public;
ALTER FUNCTION public.set_event_is_official_default() SET search_path = public;
ALTER FUNCTION public.touch_player_suspension() SET search_path = public;
ALTER FUNCTION public.compute_season_label(date) SET search_path = public;
