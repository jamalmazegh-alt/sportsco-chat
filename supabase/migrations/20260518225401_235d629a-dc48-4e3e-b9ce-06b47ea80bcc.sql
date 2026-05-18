CREATE OR REPLACE FUNCTION public.can_view_player_feedback(_user_id uuid, _feedback_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_feedback f
    JOIN public.players p ON p.id = f.player_id
    WHERE f.id = _feedback_id
      AND f.deleted_at IS NULL
      AND (
        public.can_author_player_feedback(_user_id, f.player_id)
        OR public.has_super_admin(_user_id)
        OR (f.visibility IN ('parent_summary','share_summary')
            AND public.is_parent_of_player(_user_id, f.player_id))
        OR (f.visibility IN ('player_summary','share_summary')
            AND p.user_id = _user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_player_review(_user_id uuid, _review_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_reviews r
    JOIN public.players p ON p.id = r.player_id
    WHERE r.id = _review_id
      AND (
        public.can_author_player_feedback(_user_id, r.player_id)
        OR public.has_super_admin(_user_id)
        OR (r.visibility IN ('parent_summary','share_summary')
            AND public.is_parent_of_player(_user_id, r.player_id))
        OR (r.visibility IN ('player_summary','share_summary')
            AND p.user_id = _user_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_player_feedback(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_player_review(uuid, uuid) TO authenticated;