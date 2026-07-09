
ALTER TABLE public.build_clubero_responses ADD COLUMN IF NOT EXISTS last_name text;

CREATE OR REPLACE FUNCTION public.complete_build_clubero_response(
  p_session_id text,
  p_contact    jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_at timestamptz;
  v_news boolean := coalesce((p_contact ->> 'newsletter')::boolean, false);
  v_beta boolean := coalesce((p_contact ->> 'beta')::boolean, false);
BEGIN
  SELECT completed_at INTO v_completed_at
    FROM public.build_clubero_responses WHERE session_id = p_session_id;

  IF v_completed_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.build_clubero_responses SET
    status                = 'completed',
    completed_at          = now(),
    updated_at            = now(),
    first_name            = coalesce(p_contact ->> 'first_name', first_name),
    last_name             = coalesce(p_contact ->> 'last_name', last_name),
    email                 = coalesce(p_contact ->> 'email', email),
    phone                 = coalesce(p_contact ->> 'phone', phone),
    club                  = coalesce(p_contact ->> 'club', club),
    newsletter_opt_in     = v_news,
    newsletter_consent_at = CASE WHEN v_news THEN now() ELSE newsletter_consent_at END,
    beta_opt_in           = v_beta,
    beta_consent_at       = CASE WHEN v_beta THEN now() ELSE beta_consent_at END
  WHERE session_id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_build_clubero_response(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_build_clubero_response(text,jsonb) TO service_role;

DROP VIEW IF EXISTS public.v_build_clubero_leads;
CREATE VIEW public.v_build_clubero_leads AS
SELECT id, first_name, last_name, email, phone, club,
       newsletter_opt_in, newsletter_consent_at,
       beta_opt_in, beta_consent_at, completed_at
FROM public.build_clubero_responses
WHERE email IS NOT NULL AND (newsletter_opt_in OR beta_opt_in)
ORDER BY completed_at DESC;

REVOKE ALL ON public.v_build_clubero_leads FROM anon, authenticated;
GRANT SELECT ON public.v_build_clubero_leads TO service_role;

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
      r.last_name,
      r.email,
      r.phone,
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
