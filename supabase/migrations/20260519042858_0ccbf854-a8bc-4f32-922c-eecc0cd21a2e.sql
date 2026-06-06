CREATE OR REPLACE FUNCTION public.save_player_feedback(
  _id uuid,
  _player_id uuid,
  _event_id uuid,
  _rating smallint,
  _comment text,
  _dev_notes text,
  _strengths text,
  _improvements text,
  _tags text[],
  _visibility feedback_visibility,
  _shared_summary text
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_player public.players%ROWTYPE;
  v_team_id uuid;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_player
  FROM public.players
  WHERE players.id = _player_id
    AND players.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  IF NOT public.can_author_player_feedback(v_user, _player_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _event_id IS NOT NULL THEN
    SELECT team_id INTO v_team_id
    FROM public.events
    WHERE events.id = _event_id;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.player_feedback (
      club_id,
      team_id,
      player_id,
      event_id,
      author_user_id,
      rating,
      comment,
      dev_notes,
      strengths,
      improvements,
      tags,
      visibility,
      shared_summary
    ) VALUES (
      v_player.club_id,
      v_team_id,
      _player_id,
      _event_id,
      v_user,
      _rating,
      NULLIF(_comment, ''),
      NULLIF(_dev_notes, ''),
      NULLIF(_strengths, ''),
      NULLIF(_improvements, ''),
      COALESCE(_tags, ARRAY[]::text[]),
      COALESCE(_visibility, 'coach_only'::feedback_visibility),
      NULLIF(_shared_summary, '')
    )
    RETURNING player_feedback.id INTO v_id;
  ELSE
    UPDATE public.player_feedback
    SET rating = _rating,
        comment = NULLIF(_comment, ''),
        dev_notes = NULLIF(_dev_notes, ''),
        strengths = NULLIF(_strengths, ''),
        improvements = NULLIF(_improvements, ''),
        tags = COALESCE(_tags, ARRAY[]::text[]),
        visibility = COALESCE(_visibility, 'coach_only'::feedback_visibility),
        shared_summary = NULLIF(_shared_summary, '')
    WHERE player_feedback.id = _id
      AND player_feedback.player_id = _player_id
      AND player_feedback.deleted_at IS NULL
      AND (
        player_feedback.author_user_id = v_user
        OR public.has_club_role(v_user, player_feedback.club_id, 'admin'::app_role)
      )
    RETURNING player_feedback.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'feedback_not_found_or_forbidden';
    END IF;
  END IF;

  RETURN QUERY SELECT v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_player_review(
  _player_id uuid,
  _kind text,
  _period_start date,
  _period_end date,
  _content text,
  _visibility feedback_visibility,
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
  v_player public.players%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_player
  FROM public.players
  WHERE players.id = _player_id
    AND players.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  IF NOT public.can_author_player_feedback(v_user, _player_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.player_reviews (
    club_id,
    player_id,
    author_user_id,
    kind,
    period_start,
    period_end,
    content,
    visibility,
    model
  ) VALUES (
    v_player.club_id,
    _player_id,
    v_user,
    _kind,
    _period_start,
    _period_end,
    _content,
    COALESCE(_visibility, 'coach_only'::feedback_visibility),
    _model
  )
  RETURNING player_reviews.id INTO v_id;

  RETURN QUERY
  SELECT r.id, r.kind, r.period_start, r.period_end, r.content, r.visibility, r.model, r.created_at, r.author_user_id
  FROM public.player_reviews r
  WHERE r.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_player_feedback(uuid, uuid, uuid, smallint, text, text, text, text, text[], feedback_visibility, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_player_feedback(uuid, uuid, uuid, smallint, text, text, text, text, text[], feedback_visibility, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_player_review(uuid, text, date, date, text, feedback_visibility, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_player_review(uuid, text, date, date, text, feedback_visibility, text) TO authenticated;