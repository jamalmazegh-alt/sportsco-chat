CREATE OR REPLACE FUNCTION public.delete_wall_document(_post_id uuid, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_author uuid;
BEGIN
  SELECT club_id, author_user_id INTO v_club, v_author
  FROM public.wall_posts
  WHERE id = _post_id AND deleted_at IS NULL;

  IF v_club IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  IF NOT (
    v_author = auth.uid()
    OR public.has_club_role(auth.uid(), v_club, 'admin'::app_role)
    OR public.has_club_role(auth.uid(), v_club, 'dirigeant'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.wall_posts p
  SET attachments = COALESCE((
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM jsonb_array_elements(p.attachments) WITH ORDINALITY AS a(elem, ord)
    WHERE elem->>'path' IS DISTINCT FROM _path
  ), '[]'::jsonb)
  WHERE p.id = _post_id
    AND jsonb_typeof(p.attachments) = 'array';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_wall_document(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_wall_document(uuid, text) TO authenticated;