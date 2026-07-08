
-- ============================================================================
-- « Construisons Clubero » — schéma feedback public + dashboard superadmin
-- ============================================================================

-- 1. Tables -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.build_clubero_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text NOT NULL UNIQUE,
  locale        text NOT NULL DEFAULT 'fr',
  status        text NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','completed')),
  first_name           text,
  email                text,
  phone                text,
  club                 text,
  newsletter_opt_in    boolean NOT NULL DEFAULT false,
  newsletter_consent_at timestamptz,
  beta_opt_in          boolean NOT NULL DEFAULT false,
  beta_consent_at      timestamptz,
  utm           jsonb,
  device        text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.build_clubero_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   uuid NOT NULL
                  REFERENCES public.build_clubero_responses(id) ON DELETE CASCADE,
  question_key  text NOT NULL,
  question_type text NOT NULL
                  CHECK (question_type IN
                    ('single','multi','icon','rating','slider','rank','text')),
  value         jsonb NOT NULL,
  answer_number  numeric,
  answer_text    text,
  answer_options text[],
  answer_ranking text[],
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_key)
);

-- Deny-all: aucun GRANT sur les tables, seules les RPC sont autorisées.
GRANT ALL ON public.build_clubero_responses TO service_role;
GRANT ALL ON public.build_clubero_answers   TO service_role;

ALTER TABLE public.build_clubero_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_clubero_answers   ENABLE ROW LEVEL SECURITY;
-- Volontairement aucune policy → deny-all pour anon et authenticated.

CREATE INDEX IF NOT EXISTS idx_bca_response ON public.build_clubero_answers (response_id);
CREATE INDEX IF NOT EXISTS idx_bca_qkey     ON public.build_clubero_answers (question_key);
CREATE INDEX IF NOT EXISTS idx_bca_qtype    ON public.build_clubero_answers (question_type);
CREATE INDEX IF NOT EXISTS idx_bcr_status   ON public.build_clubero_responses (status);
CREATE INDEX IF NOT EXISTS idx_bcr_created  ON public.build_clubero_responses (started_at);

-- 2. RPC publiques ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_build_clubero_response(
  p_session_id text,
  p_locale     text DEFAULT 'fr',
  p_utm        jsonb DEFAULT NULL,
  p_device     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  -- Rate-limit best-effort par session_id (l'IP n'est pas dispo côté RPC direct).
  -- TODO(prod): proxifier via /api/public si un rate-limit dur est requis.
  PERFORM public.increment_rate_limit(
    coalesce(p_session_id, 'unknown'),
    'build_clubero_start',
    date_trunc('hour', now()),
    120
  );

  INSERT INTO public.build_clubero_responses (session_id, locale, utm, device)
  VALUES (p_session_id, coalesce(p_locale, 'fr'), p_utm, p_device)
  ON CONFLICT (session_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

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
  v_response_id uuid;
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

  SELECT id INTO v_response_id
    FROM public.build_clubero_responses WHERE session_id = p_session_id;
  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
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
  v_news boolean := coalesce((p_contact ->> 'newsletter')::boolean, false);
  v_beta boolean := coalesce((p_contact ->> 'beta')::boolean, false);
BEGIN
  UPDATE public.build_clubero_responses SET
    status                = 'completed',
    completed_at          = coalesce(completed_at, now()),
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

REVOKE ALL ON FUNCTION public.start_build_clubero_response(text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_build_clubero_answer(text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_build_clubero_response(text,jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_build_clubero_response(text,text,jsonb,text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_build_clubero_answer(text,text,text,jsonb)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_build_clubero_response(text,jsonb)         TO anon, authenticated;

-- 3. Vues d'analyse (usage interne / service_role) --------------------------

CREATE OR REPLACE VIEW public.v_build_clubero_options AS
SELECT a.question_key,
       a.question_type,
       opt AS option_key,
       count(*)::int AS n
FROM public.build_clubero_answers a
CROSS JOIN LATERAL unnest(a.answer_options) AS opt
WHERE a.answer_options IS NOT NULL
GROUP BY a.question_key, a.question_type, opt
ORDER BY a.question_key, n DESC;

CREATE OR REPLACE VIEW public.v_build_clubero_ranking AS
SELECT a.question_key,
       item AS option_key,
       round(avg(pos), 2) AS avg_position,
       count(*)::int      AS votes
FROM public.build_clubero_answers a
CROSS JOIN LATERAL unnest(a.answer_ranking) WITH ORDINALITY AS r(item, pos)
WHERE a.answer_ranking IS NOT NULL
GROUP BY a.question_key, item
ORDER BY a.question_key, avg_position ASC;

CREATE OR REPLACE VIEW public.v_build_clubero_numeric AS
SELECT question_key,
       question_type,
       round(avg(answer_number), 2)                                        AS moyenne,
       min(answer_number)                                                  AS min,
       max(answer_number)                                                  AS max,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY answer_number)          AS mediane,
       count(*)::int                                                       AS n
FROM public.build_clubero_answers
WHERE answer_number IS NOT NULL
GROUP BY question_key, question_type;

CREATE OR REPLACE VIEW public.v_build_clubero_funnel AS
SELECT count(*)                                          AS sessions,
       count(*) FILTER (WHERE status = 'completed')      AS terminees,
       count(*) FILTER (WHERE newsletter_opt_in)         AS newsletter_leads,
       count(*) FILTER (WHERE beta_opt_in)               AS beta_leads,
       round(avg(extract(epoch FROM (completed_at - started_at)))
             FILTER (WHERE status = 'completed') / 60.0, 1) AS duree_min_moyenne
FROM public.build_clubero_responses;

CREATE OR REPLACE VIEW public.v_build_clubero_leads AS
SELECT id, first_name, email, phone, club,
       newsletter_opt_in, newsletter_consent_at,
       beta_opt_in, beta_consent_at, completed_at
FROM public.build_clubero_responses
WHERE email IS NOT NULL AND (newsletter_opt_in OR beta_opt_in)
ORDER BY completed_at DESC;

CREATE OR REPLACE VIEW public.v_build_clubero_verbatims AS
SELECT a.question_key, a.answer_text, r.club, a.created_at
FROM public.build_clubero_answers a
JOIN public.build_clubero_responses r ON r.id = a.response_id
WHERE a.question_type = 'text' AND a.answer_text IS NOT NULL AND a.answer_text <> ''
ORDER BY a.created_at DESC;

-- Vues verrouillées côté anon/authenticated (héritent du deny-all des tables sous-jacentes).
REVOKE ALL ON public.v_build_clubero_options   FROM anon, authenticated;
REVOKE ALL ON public.v_build_clubero_ranking   FROM anon, authenticated;
REVOKE ALL ON public.v_build_clubero_numeric   FROM anon, authenticated;
REVOKE ALL ON public.v_build_clubero_funnel    FROM anon, authenticated;
REVOKE ALL ON public.v_build_clubero_leads     FROM anon, authenticated;
REVOKE ALL ON public.v_build_clubero_verbatims FROM anon, authenticated;
GRANT SELECT ON public.v_build_clubero_options   TO service_role;
GRANT SELECT ON public.v_build_clubero_ranking   TO service_role;
GRANT SELECT ON public.v_build_clubero_numeric   TO service_role;
GRANT SELECT ON public.v_build_clubero_funnel    TO service_role;
GRANT SELECT ON public.v_build_clubero_leads     TO service_role;
GRANT SELECT ON public.v_build_clubero_verbatims TO service_role;

-- 4. Dashboard superadmin ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_build_clubero_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT coalesce(public.has_super_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'overview',  (SELECT to_jsonb(f) FROM public.v_build_clubero_funnel f),
    'options',   coalesce((SELECT jsonb_agg(o) FROM public.v_build_clubero_options o),   '[]'::jsonb),
    'ranking',   coalesce((SELECT jsonb_agg(r) FROM public.v_build_clubero_ranking r),   '[]'::jsonb),
    'numeric',   coalesce((SELECT jsonb_agg(n) FROM public.v_build_clubero_numeric n),   '[]'::jsonb),
    'verbatims', coalesce((SELECT jsonb_agg(vb) FROM public.v_build_clubero_verbatims vb),'[]'::jsonb),
    'leads',     coalesce((SELECT jsonb_agg(l) FROM public.v_build_clubero_leads l),     '[]'::jsonb)
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_build_clubero_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_build_clubero_dashboard() TO authenticated;
