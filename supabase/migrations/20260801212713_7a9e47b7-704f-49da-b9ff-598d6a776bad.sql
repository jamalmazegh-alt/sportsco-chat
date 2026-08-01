CREATE OR REPLACE FUNCTION public.set_wall_document_excluded(_post_id uuid, _path text, _excluded boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club uuid;
  v_author uuid;
  v_found boolean;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.wall_posts p,
         LATERAL jsonb_array_elements(p.attachments) AS elem
    WHERE p.id = _post_id
      AND jsonb_typeof(p.attachments) = 'array'
      AND elem->>'path' = _path
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'attachment_not_found';
  END IF;

  UPDATE public.wall_posts p
  SET attachments = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'path' = _path THEN
          CASE
            WHEN _excluded THEN jsonb_set(elem, '{excludedFromLibrary}', 'true'::jsonb)
            ELSE elem - 'excludedFromLibrary'
          END
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.attachments) WITH ORDINALITY AS a(elem, ord)
  )
  WHERE p.id = _post_id
    AND jsonb_typeof(p.attachments) = 'array';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_wall_document_excluded(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_wall_document_excluded(uuid, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.delete_wall_document(uuid, text);