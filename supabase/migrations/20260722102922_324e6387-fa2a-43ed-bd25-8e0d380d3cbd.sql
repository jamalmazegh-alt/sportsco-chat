-- Allow anyone who can see the event to see its staff assignments (read-only).
-- Parents/players of the event's team need this to render the read-only "Encadrement" card.
CREATE POLICY "event_staff_assignments_select_event_readers"
ON public.event_staff_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_staff_assignments.event_id)
);