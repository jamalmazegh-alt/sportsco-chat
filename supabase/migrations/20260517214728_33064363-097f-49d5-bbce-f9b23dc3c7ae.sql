-- Remove duplicate team_members rows keeping the oldest one
DELETE FROM public.team_members a
USING public.team_members b
WHERE a.ctid > b.ctid
  AND a.team_id = b.team_id
  AND a.player_id = b.player_id
  AND a.role = b.role;

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_player_role_unique
  ON public.team_members (team_id, player_id, role);