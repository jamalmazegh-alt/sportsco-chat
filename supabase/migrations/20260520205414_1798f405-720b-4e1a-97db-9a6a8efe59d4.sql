-- Length limits
ALTER TABLE public.player_reviews
  ADD CONSTRAINT player_reviews_content_length_chk
  CHECK (content IS NULL OR length(content) <= 50000);

ALTER TABLE public.player_feedback
  ADD CONSTRAINT player_feedback_comment_length_chk
  CHECK (comment IS NULL OR length(comment) <= 10000);
ALTER TABLE public.player_feedback
  ADD CONSTRAINT player_feedback_dev_notes_length_chk
  CHECK (dev_notes IS NULL OR length(dev_notes) <= 10000);
ALTER TABLE public.player_feedback
  ADD CONSTRAINT player_feedback_strengths_length_chk
  CHECK (strengths IS NULL OR length(strengths) <= 10000);
ALTER TABLE public.player_feedback
  ADD CONSTRAINT player_feedback_improvements_length_chk
  CHECK (improvements IS NULL OR length(improvements) <= 10000);
ALTER TABLE public.player_feedback
  ADD CONSTRAINT player_feedback_shared_summary_length_chk
  CHECK (shared_summary IS NULL OR length(shared_summary) <= 10000);

-- Tag validation trigger (subqueries are not allowed in CHECK constraints)
CREATE OR REPLACE FUNCTION public.validate_player_feedback_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tag text;
BEGIN
  IF NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  IF array_length(NEW.tags, 1) > 20 THEN
    RAISE EXCEPTION 'too_many_tags'
      USING HINT = 'A feedback entry cannot have more than 20 tags.';
  END IF;
  FOREACH v_tag IN ARRAY NEW.tags LOOP
    IF v_tag !~ '^[a-z0-9_]{1,64}$' THEN
      RAISE EXCEPTION 'invalid_tag_format: %', v_tag
        USING HINT = 'Tags must be snake_case (lowercase letters, digits, underscores), 1-64 characters.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_player_feedback_tags_trg ON public.player_feedback;
CREATE TRIGGER validate_player_feedback_tags_trg
  BEFORE INSERT OR UPDATE OF tags ON public.player_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_player_feedback_tags();