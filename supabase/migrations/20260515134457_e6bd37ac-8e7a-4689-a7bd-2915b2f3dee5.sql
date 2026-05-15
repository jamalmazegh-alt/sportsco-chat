CREATE TABLE public.wall_post_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX idx_wall_post_reads_post ON public.wall_post_reads(post_id);
CREATE INDEX idx_wall_post_reads_user ON public.wall_post_reads(user_id);

ALTER TABLE public.wall_post_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wall_post_reads_insert_self"
ON public.wall_post_reads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.wall_posts p
    WHERE p.id = wall_post_reads.post_id
      AND public.is_club_member(auth.uid(), p.club_id)
  )
);

CREATE POLICY "wall_post_reads_select_clubmate"
ON public.wall_post_reads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.wall_posts p
    WHERE p.id = wall_post_reads.post_id
      AND public.is_club_member(auth.uid(), p.club_id)
  )
);
