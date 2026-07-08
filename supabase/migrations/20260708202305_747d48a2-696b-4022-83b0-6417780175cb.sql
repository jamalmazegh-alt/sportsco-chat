
CREATE OR REPLACE FUNCTION public.admin_build_clubero_responses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT coalesce(public.has_super_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_jsonb(t) ORDER BY t.started_at DESC), '[]'::jsonb)
  INTO v
  FROM (
    SELECT
      r.id,
      r.session_id,
      r.status,
      r.locale,
      r.first_name,
      r.email,
      r.club,
      r.newsletter_opt_in,
      r.beta_opt_in,
      r.started_at,
      r.completed_at,
      coalesce((
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
      ), '[]'::jsonb) AS answers
    FROM public.build_clubero_responses r
    ORDER BY r.started_at DESC
    LIMIT 500
  ) t;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_build_clubero_responses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_build_clubero_responses() TO authenticated;
