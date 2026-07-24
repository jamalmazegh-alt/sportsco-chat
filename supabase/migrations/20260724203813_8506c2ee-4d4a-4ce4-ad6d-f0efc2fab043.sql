-- Backfill parent_user_id on player_parents by matching parent email to auth.users
UPDATE public.player_parents pp
SET parent_user_id = u.id
FROM auth.users u
WHERE pp.parent_user_id IS NULL
  AND pp.email IS NOT NULL
  AND lower(u.email) = lower(pp.email);
