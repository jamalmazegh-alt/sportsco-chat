CREATE OR REPLACE FUNCTION public.decrement_suspensions_on_event_complete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 'completed' is not a valid status in this project; treat as no-op.
  RETURN NEW;
END;
$$;

UPDATE public.events
SET status = 'published'
WHERE status = 'draft'
  AND convocations_sent = true
  AND deleted_at IS NULL;