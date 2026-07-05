-- Unicité partielle des passages "Défis & Tests"
-- Cas rattaché à une séance : un seul passage par (challenge, event)
CREATE UNIQUE INDEX IF NOT EXISTS challenge_passages_uniq_event
  ON public.challenge_passages (challenge_id, event_id)
  WHERE event_id IS NOT NULL;

-- Cas standalone (event_id NULL) : un seul passage par (challenge, date)
CREATE UNIQUE INDEX IF NOT EXISTS challenge_passages_uniq_standalone
  ON public.challenge_passages (challenge_id, passage_date)
  WHERE event_id IS NULL;