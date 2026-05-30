
-- 1. Table
CREATE TABLE public.player_availabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('vacation','injury','school','family','work','other')),
  comment text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_player_availabilities_player_dates
  ON public.player_availabilities(player_id, start_date);
CREATE INDEX idx_player_availabilities_dates
  ON public.player_availabilities(start_date, end_date);
CREATE INDEX idx_player_availabilities_status
  ON public.player_availabilities(status);

-- 2. Grants (auth-only, scoped by RLS to player/parent/club staff)
GRANT SELECT, INSERT, UPDATE ON public.player_availabilities TO authenticated;
GRANT ALL ON public.player_availabilities TO service_role;

-- 3. RLS
ALTER TABLE public.player_availabilities ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "availabilities_select"
ON public.player_availabilities
FOR SELECT
TO authenticated
USING (
  -- Player himself
  EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = auth.uid())
  OR public.is_parent_of_player(auth.uid(), player_id)
  OR public.is_player_team_coach(auth.uid(), player_id)
  OR public.is_player_club_admin(auth.uid(), player_id)
);

-- INSERT
CREATE POLICY "availabilities_insert"
ON public.player_availabilities
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = auth.uid())
    OR public.is_parent_of_player(auth.uid(), player_id)
    OR public.is_player_team_coach(auth.uid(), player_id)
    OR public.is_player_club_admin(auth.uid(), player_id)
  )
);

-- UPDATE
CREATE POLICY "availabilities_update"
ON public.player_availabilities
FOR UPDATE
TO authenticated
USING (
  created_by_user_id = auth.uid()
  OR public.is_player_club_admin(auth.uid(), player_id)
)
WITH CHECK (
  created_by_user_id = auth.uid()
  OR public.is_player_club_admin(auth.uid(), player_id)
);

-- 4. Updated_at trigger
CREATE TRIGGER trg_player_availabilities_updated
BEFORE UPDATE ON public.player_availabilities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Maintenance helper: mark expired active availabilities as completed
CREATE OR REPLACE FUNCTION public.mark_expired_availabilities_completed()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.player_availabilities
       SET status = 'completed'
     WHERE status = 'active' AND end_date < CURRENT_DATE
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM updated;
$$;

GRANT EXECUTE ON FUNCTION public.mark_expired_availabilities_completed() TO authenticated;
