
CREATE TABLE public.event_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX event_staff_assignments_event_idx ON public.event_staff_assignments(event_id);
CREATE INDEX event_staff_assignments_user_idx ON public.event_staff_assignments(user_id);

GRANT SELECT, INSERT, DELETE ON public.event_staff_assignments TO authenticated;
GRANT ALL ON public.event_staff_assignments TO service_role;

ALTER TABLE public.event_staff_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT : staff de l'équipe OU admin/dirigeant du club de l'événement
CREATE POLICY "event_staff_assignments_select"
ON public.event_staff_assignments
FOR SELECT
TO authenticated
USING (
  public.is_team_staff_of_event(event_id, auth.uid())
  OR public.has_club_role_any(
       auth.uid(),
       (SELECT t.club_id FROM public.events e JOIN public.teams t ON t.id = e.team_id WHERE e.id = event_staff_assignments.event_id),
       ARRAY['admin','dirigeant']
     )
);

-- INSERT : le manager doit être staff de l'équipe ou admin/dirigeant du club,
--         ET l'assigné doit être coach/assistant_coach du club de l'événement
CREATE POLICY "event_staff_assignments_insert"
ON public.event_staff_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.is_team_staff_of_event(event_id, auth.uid())
    OR public.has_club_role_any(
         auth.uid(),
         (SELECT t.club_id FROM public.events e JOIN public.teams t ON t.id = e.team_id WHERE e.id = event_staff_assignments.event_id),
         ARRAY['admin','dirigeant']
       )
  )
  AND public.has_club_role_any(
        user_id,
        (SELECT t.club_id FROM public.events e JOIN public.teams t ON t.id = e.team_id WHERE e.id = event_staff_assignments.event_id),
        ARRAY['coach','assistant_coach']
      )
);

-- DELETE : mêmes prédicats côté "qui gère"
CREATE POLICY "event_staff_assignments_delete"
ON public.event_staff_assignments
FOR DELETE
TO authenticated
USING (
  public.is_team_staff_of_event(event_id, auth.uid())
  OR public.has_club_role_any(
       auth.uid(),
       (SELECT t.club_id FROM public.events e JOIN public.teams t ON t.id = e.team_id WHERE e.id = event_staff_assignments.event_id),
       ARRAY['admin','dirigeant']
     )
);
