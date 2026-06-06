CREATE OR REPLACE FUNCTION public.update_player_review_content(
  _id uuid,
  _content text,
  _model text
)
RETURNS TABLE(
  id uuid,
  kind text,
  period_start date,
  period_end date,
  content text,
  visibility feedback_visibility,
  model text,
  created_at timestamptz,
  author_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_review public.player_reviews%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_review FROM public.player_reviews WHERE player_reviews.id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_not_found';
  END IF;

  IF NOT public.can_author_player_feedback(v_user, v_review.player_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.player_reviews
  SET content = _content,
      model = COALESCE(_model, model)
  WHERE player_reviews.id = _id;

  RETURN QUERY
  SELECT pr.id, pr.kind::text, pr.period_start, pr.period_end, pr.content,
         pr.visibility, pr.model, pr.created_at, pr.author_user_id
  FROM public.player_reviews pr
  WHERE pr.id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_player_review_content(uuid, text, text) TO authenticated;