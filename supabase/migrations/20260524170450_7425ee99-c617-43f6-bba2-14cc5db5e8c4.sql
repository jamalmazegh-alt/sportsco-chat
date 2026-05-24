CREATE OR REPLACE FUNCTION public.can_validate_match(_user_id uuid, _match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_matches m
    WHERE m.id = _match_id
      AND (
        public.can_manage_tournament(_user_id, m.tournament_id)
        OR public.is_match_referee(_user_id, _match_id)
        OR public.is_tournament_referee_for_match(_user_id, _match_id)
      )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.can_validate_match(uuid, uuid) TO authenticated;