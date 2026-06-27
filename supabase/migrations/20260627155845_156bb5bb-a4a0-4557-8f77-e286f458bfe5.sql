CREATE OR REPLACE FUNCTION public.current_user_has_tournament_collab()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_collaborators tc
    JOIN auth.users u ON lower(u.email) = lower(tc.email)
    WHERE u.id = auth.uid()
      AND tc.revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_tournament_collab() TO authenticated;