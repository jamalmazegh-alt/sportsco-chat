ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS clubs_archived_at_idx ON public.clubs (archived_at);

DROP POLICY IF EXISTS clubs_select_member ON public.clubs;
CREATE POLICY clubs_select_member ON public.clubs
  FOR SELECT
  TO authenticated
  USING (
    has_super_admin(auth.uid())
    OR (
      archived_at IS NULL
      AND (is_club_member(auth.uid(), id) OR created_by = auth.uid())
    )
  );