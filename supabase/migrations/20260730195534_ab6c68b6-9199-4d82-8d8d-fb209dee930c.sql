DELETE FROM public.wall_post_reactions older
USING public.wall_post_reactions newer
WHERE older.post_id = newer.post_id
  AND older.user_id = newer.user_id
  AND (
    older.created_at < newer.created_at
    OR (older.created_at = newer.created_at AND older.id < newer.id)
  );

ALTER TABLE public.wall_post_reactions
  DROP CONSTRAINT wall_post_reactions_post_id_user_id_emoji_key;

ALTER TABLE public.wall_post_reactions
  ADD CONSTRAINT wall_post_reactions_post_id_user_id_key UNIQUE (post_id, user_id);

GRANT UPDATE ON public.wall_post_reactions TO authenticated;

CREATE POLICY "wall_post_reactions_update_self" ON public.wall_post_reactions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.wall_posts p
    WHERE p.id = wall_post_reactions.post_id
      AND public.is_club_member(auth.uid(), p.club_id)
  )
);