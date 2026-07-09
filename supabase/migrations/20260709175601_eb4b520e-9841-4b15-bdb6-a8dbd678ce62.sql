CREATE OR REPLACE FUNCTION public.admin_build_clubero_responses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT coalesce(public.has_super_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY started_at DESC), '[]'::jsonb)
  INTO v
  FROM (
    SELECT
      r.started_at,
      jsonb_build_object(
        'id', r.id,
        'session_id', r.session_id,
        'status', r.status,
        'locale', r.locale,
        'first_name', r.first_name,
        'last_name', r.last_name,
        'email', r.email,
        'phone', r.phone,
        'club', r.club,
        'newsletter_opt_in', r.newsletter_opt_in,
        'beta_opt_in', r.beta_opt_in,
        'started_at', r.started_at,
        'completed_at', r.completed_at,
        'answers', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'question_key', a.question_key,
              'question_type', a.question_type,
              'value', a.value,
              'created_at', a.created_at
            )
            ORDER BY a.created_at ASC
          )
          FROM public.build_clubero_answers a
          WHERE a.response_id = r.id
        ), '[]'::jsonb)
      ) AS item
    FROM public.build_clubero_responses r
    ORDER BY r.started_at DESC
    LIMIT 500
  ) s;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_build_clubero_responses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_build_clubero_responses() TO authenticated;