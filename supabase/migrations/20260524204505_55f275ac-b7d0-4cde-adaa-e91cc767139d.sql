ALTER TABLE public.tournament_payment_events
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tournament_payment_events_actor_id_idx
  ON public.tournament_payment_events(actor_id);