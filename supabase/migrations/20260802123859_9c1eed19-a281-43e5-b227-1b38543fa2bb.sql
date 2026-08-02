-- Docuthèque du mur : l'onglet Documents ne lit que les publications porteuses
-- de pièces jointes, sur tout l'historique du club (le feed, lui, s'arrête aux
-- 50 dernières publications). Sans index dédié, la pagination scanne tous les
-- posts du club pour n'en retenir qu'une minorité.
--
-- Index partiel : seules les lignes réellement listées par la docuthèque y
-- entrent, ce qui le garde nettement plus compact que idx_wall_posts_club.
CREATE INDEX IF NOT EXISTS idx_wall_posts_with_attachments
  ON public.wall_posts (club_id, created_at DESC)
  WHERE deleted_at IS NULL AND jsonb_array_length(attachments) > 0;