
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS child_platform_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.players.child_platform_access IS
  'Whether a minor player has been granted access to the platform by their parent. Defaults to false.';
