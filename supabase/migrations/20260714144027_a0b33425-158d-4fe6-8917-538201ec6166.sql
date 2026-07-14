CREATE OR REPLACE FUNCTION public.get_player_coparents(_player_id uuid)
RETURNS TABLE(id uuid, full_name text, has_account boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.id,
         COALESCE(NULLIF(TRIM(pp.full_name), ''),
                  NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''),
                  pr.full_name) AS full_name,
         (pp.parent_user_id IS NOT NULL) AS has_account
  FROM public.player_parents pp
  LEFT JOIN public.profiles pr ON pr.id = pp.parent_user_id
  WHERE pp.player_id = _player_id
    AND EXISTS (
      SELECT 1 FROM public.player_parents me
      WHERE me.player_id = _player_id AND me.parent_user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_player_coparents(uuid) TO authenticated;