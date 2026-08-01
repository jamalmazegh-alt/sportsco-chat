CREATE OR REPLACE FUNCTION public.rename_wall_document(_post_id uuid, _path text, _label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_author uuid;
  v_label text := nullif(btrim(_label), '');
BEGIN
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'label_required';
  END IF;
  IF length(v_label) > 80 THEN
    RAISE EXCEPTION 'label_too_long';
  END IF;

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
  SET attachments = (
    SELECT jsonb_agg(
      CASE WHEN elem->>'path' = _path THEN jsonb_set(elem, '{label}', to_jsonb(v_label)) ELSE elem END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.attachments) WITH ORDINALITY AS a(elem, ord)
  )
  WHERE p.id = _post_id
    AND jsonb_typeof(p.attachments) = 'array';
END;
$$;

REVOKE ALL ON FUNCTION public.rename_wall_document(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rename_wall_document(uuid, text, text) TO authenticated;