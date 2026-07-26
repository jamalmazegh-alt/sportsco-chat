-- Fix infinite recursion between club_publications and club_publication_recipients policies.
CREATE OR REPLACE FUNCTION public.viewer_is_publication_recipient(_publication_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_publication_recipients r
    WHERE r.publication_id = _publication_id
      AND (
        (r.subject_kind = 'user' AND r.subject_user_id = _user_id)
        OR (
          r.subject_kind = 'player'
          AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = r.member_id
              AND (
                p.user_id = _user_id
                OR EXISTS (
                  SELECT 1 FROM public.player_parents pp
                  WHERE pp.player_id = p.id AND pp.parent_user_id = _user_id
                )
              )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.viewer_is_publication_recipient(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS publications_recipient_read ON public.club_publications;
CREATE POLICY publications_recipient_read ON public.club_publications
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.viewer_is_publication_recipient(id, auth.uid())
  );