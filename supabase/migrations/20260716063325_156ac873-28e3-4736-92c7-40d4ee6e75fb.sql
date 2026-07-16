-- Remove the overly-permissive SELECT policy on convocations that bypassed
-- the call-up visibility gate. Two permissive SELECT policies are OR-ed by
-- Postgres, so `convocations_select` (can_view_team) was letting any team
-- member read every convocation even when the call-up list is masked.
-- The remaining `convocations_visibility_gate` already covers all legitimate
-- read cases: staff of the event, non-staff when visibility is ON, and the
-- player / parent seeing their own row regardless.
DROP POLICY IF EXISTS convocations_select ON public.convocations;