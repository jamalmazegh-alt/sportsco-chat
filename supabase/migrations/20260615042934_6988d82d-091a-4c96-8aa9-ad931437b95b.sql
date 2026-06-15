REVOKE SELECT ON public.club_social_connections FROM authenticated, anon;
GRANT SELECT (
  id,
  club_id,
  network,
  token_expires_at,
  account_name,
  account_id,
  is_active,
  last_synced_at,
  last_sync_error,
  connected_at,
  updated_at
) ON public.club_social_connections TO authenticated;
GRANT SELECT ON public.club_social_connections TO service_role;

REVOKE SELECT ON public.tournament_passes FROM authenticated, anon;
GRANT SELECT (
  id,
  email,
  user_id,
  amount_total,
  currency,
  status,
  tournament_id,
  paid_at,
  used_at,
  expires_at,
  created_at,
  updated_at
) ON public.tournament_passes TO authenticated;
GRANT SELECT ON public.tournament_passes TO service_role;