-- 1) Backfill parent_user_id sur les liens parent↔enfant existants
UPDATE public.player_parents pp
SET parent_user_id = u.id
FROM auth.users u
WHERE pp.parent_user_id IS NULL
  AND pp.email IS NOT NULL
  AND lower(u.email) = lower(pp.email);

-- 2) Re-seed anti-doublon: marquer tous les liens actuels comme "déjà notifiés"
--    pour que notifyNewlyLinkedChildren ne renvoie pas d'email sur les liens historiques.
INSERT INTO public.parent_link_notifications (parent_user_id, player_id)
SELECT DISTINCT pp.parent_user_id, pp.player_id
FROM public.player_parents pp
WHERE pp.parent_user_id IS NOT NULL
ON CONFLICT (parent_user_id, player_id) DO NOTHING;
