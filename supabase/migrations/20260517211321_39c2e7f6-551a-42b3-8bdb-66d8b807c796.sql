CREATE OR REPLACE FUNCTION public.prevent_past_convocation_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starts_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT starts_at INTO v_starts_at FROM public.events WHERE id = NEW.event_id;
    IF v_starts_at IS NOT NULL AND v_starts_at < (now() - interval '3 hours') THEN
      RAISE EXCEPTION 'past_event_locked'
        USING HINT = 'Les réponses ne peuvent plus être modifiées pour un événement passé.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_past_convocation_changes ON public.convocations;
CREATE TRIGGER trg_prevent_past_convocation_changes
  BEFORE UPDATE ON public.convocations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_past_convocation_changes();