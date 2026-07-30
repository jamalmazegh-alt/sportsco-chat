CREATE TABLE public.wall_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.wall_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX idx_wall_comment_reactions_comment ON public.wall_comment_reactions(comment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wall_comment_reactions TO authenticated;
GRANT ALL ON public.wall_comment_reactions TO service_role;

ALTER TABLE public.wall_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wall_comment_reactions_select" ON public.wall_comment_reactions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.wall_comments c
  JOIN public.wall_posts p ON p.id = c.post_id
  WHERE c.id = wall_comment_reactions.comment_id
    AND public.is_club_member(auth.uid(), p.club_id)
));

CREATE POLICY "wall_comment_reactions_insert_self" ON public.wall_comment_reactions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.wall_comments c
  JOIN public.wall_posts p ON p.id = c.post_id
  WHERE c.id = wall_comment_reactions.comment_id
    AND public.is_club_member(auth.uid(), p.club_id)
));

CREATE POLICY "wall_comment_reactions_update_self" ON public.wall_comment_reactions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.wall_comments c
  JOIN public.wall_posts p ON p.id = c.post_id
  WHERE c.id = wall_comment_reactions.comment_id
    AND public.is_club_member(auth.uid(), p.club_id)
));

CREATE POLICY "wall_comment_reactions_delete_self" ON public.wall_comment_reactions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.wall_comment_reactions;