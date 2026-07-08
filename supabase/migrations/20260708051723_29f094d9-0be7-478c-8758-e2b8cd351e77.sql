-- ============================================================================
-- Build Clubero — hardening for public diffusion (S2-style)
-- - Retire GRANT EXECUTE anon/authenticated ⇒ Worker (service_role) seule porte
-- - Bornes défensives dans les RPC (post-complete guard, plafond réponses,
--   complete idempotent)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.start_build_clubero_response(text,text,jsonb,text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_build_clubero_answer(text,text,text,jsonb)     FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_build_clubero_response(text,jsonb)         FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_build_clubero_response(text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_build_clubero_answer(text,text,text,jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_build_clubero_response(text,jsonb)         TO service_role;

CREATE OR REPLACE FUNCTION public.save_build_clubero_answer(
  p_session_id    text,
  p_question_key  text,
  p_question_type text,
  p_value         jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_ANSWERS_PER_RESPONSE constant int := 100;
  v_response_id uuid;
  v_completed_at timestamptz;
  v_count int;
  v_exists boolean;
  v_number  numeric;
  v_text    text;
  v_options text[];
  v_ranking text[];
BEGIN
  PERFORM public.increment_rate_limit(
    coalesce(p_session_id, 'unknown'),
    'build_clubero_save',
    date_trunc('hour', now()),
    600
  );

  SELECT id, completed_at INTO v_response_id, v_completed_at
    FROM public.build_clubero_responses WHERE session_id = p_session_id;
  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'build_clubero: session_not_found';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'build_clubero: response_completed';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.build_clubero_answers
    WHERE response_id = v_response_id AND question_key = p_question_key
  ) INTO v_exists;

  IF NOT v_exists THEN
    SELECT count(*) INTO v_count
      FROM public.build_clubero_answers WHERE response_id = v_response_id;
    IF v_count >= MAX_ANSWERS_PER_RESPONSE THEN
      RAISE EXCEPTION 'build_clubero: answers_limit_exceeded';
    END IF;
  END IF;

  IF p_question_type IN ('slider','rating') THEN
    v_number := (p_value #>> '{}')::numeric;
  ELSIF p_question_type = 'text' THEN
    v_text := left(p_value #>> '{}', 500);
  ELSIF p_question_type IN ('single','icon') THEN
    v_options := ARRAY[p_value #>> '{}'];
  ELSIF p_question_type = 'multi' THEN
    v_options := ARRAY(SELECT jsonb_array_elements_text(p_value));
  ELSIF p_question_type = 'rank' THEN
    v_ranking := ARRAY(SELECT jsonb_array_elements_text(p_value));
  END IF;

  INSERT INTO public.build_clubero_answers
    (response_id, question_key, question_type, value,
     answer_number, answer_text, answer_options, answer_ranking)
  VALUES
    (v_response_id, p_question_key, p_question_type, p_value,
     v_number, v_text, v_options, v_ranking)
  ON CONFLICT (response_id, question_key) DO UPDATE SET
    question_type  = excluded.question_type,
    value          = excluded.value,
    answer_number  = excluded.answer_number,
    answer_text    = excluded.answer_text,
    answer_options = excluded.answer_options,
    answer_ranking = excluded.answer_ranking,
    updated_at     = now();

  UPDATE public.build_clubero_responses SET updated_at = now() WHERE id = v_response_id;
END;
$$;

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

REVOKE ALL ON FUNCTION public.save_build_clubero_answer(text,text,text,jsonb)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_build_clubero_response(text,jsonb)         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_build_clubero_answer(text,text,text,jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_build_clubero_response(text,jsonb)         TO service_role;