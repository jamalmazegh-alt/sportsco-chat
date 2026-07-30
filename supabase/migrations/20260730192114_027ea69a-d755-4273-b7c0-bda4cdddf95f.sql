CREATE TABLE public.wall_post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.wall_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, emoji)
);

CREATE INDEX idx_wall_post_reactions_post ON public.wall_post_reactions(post_id);

GRANT SELECT, INSERT, DELETE ON public.wall_post_reactions TO authenticated;
GRANT ALL ON public.wall_post_reactions TO service_role;

ALTER TABLE public.wall_post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wall_post_reactions_select" ON public.wall_post_reactions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.wall_posts p
  WHERE p.id = wall_post_reactions.post_id
    AND public.is_club_member(auth.uid(), p.club_id)
));

CREATE POLICY "wall_post_reactions_insert_self" ON public.wall_post_reactions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.wall_posts p
    WHERE p.id = wall_post_reactions.post_id
      AND public.is_club_member(auth.uid(), p.club_id)
  )
);

CREATE POLICY "wall_post_reactions_delete_self" ON public.wall_post_reactions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.wall_post_reactions;