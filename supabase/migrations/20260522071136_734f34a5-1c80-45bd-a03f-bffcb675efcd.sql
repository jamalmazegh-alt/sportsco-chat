DROP POLICY IF EXISTS club_members_insert_admin ON public.club_members;

CREATE POLICY club_members_insert_admin
ON public.club_members
FOR INSERT
TO public
WITH CHECK (
  has_club_role(auth.uid(), club_id, 'admin'::app_role)
  OR (
    user_id = auth.uid()
    AND role = ANY (ARRAY['player'::app_role, 'parent'::app_role])
  )
  OR (
    user_id = auth.uid()
    AND role = 'admin'::app_role
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_members.club_id
        AND c.created_by = auth.uid()
    )
  )
);