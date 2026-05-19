ALTER TABLE public.player_feedback
DROP CONSTRAINT IF EXISTS player_feedback_rating_check;

ALTER TABLE public.player_feedback
ADD CONSTRAINT player_feedback_rating_check
CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10));