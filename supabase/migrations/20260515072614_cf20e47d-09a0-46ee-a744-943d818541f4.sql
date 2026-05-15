-- Helper trigger function defined first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.match_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  home_score INTEGER NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score INTEGER NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  notes TEXT,
  recorded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_results_event ON public.match_results(event_id);

ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_results_select"
ON public.match_results FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = match_results.event_id
      AND public.can_view_team(auth.uid(), e.team_id)
  )
);

CREATE POLICY "match_results_coach_write"
ON public.match_results FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = match_results.event_id
      AND public.is_team_coach(auth.uid(), e.team_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = match_results.event_id
      AND public.is_team_coach(auth.uid(), e.team_id)
  )
);

CREATE TRIGGER trg_match_results_updated_at
BEFORE UPDATE ON public.match_results
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.event_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  scorer_player_id UUID NOT NULL,
  assist_player_id UUID,
  minute INTEGER CHECK (minute IS NULL OR (minute >= 0 AND minute <= 200)),
  kind TEXT NOT NULL DEFAULT 'goal' CHECK (kind IN ('goal','own_goal','penalty')),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_goals_event ON public.event_goals(event_id);
CREATE INDEX idx_event_goals_scorer ON public.event_goals(scorer_player_id);
CREATE INDEX idx_event_goals_assist ON public.event_goals(assist_player_id) WHERE assist_player_id IS NOT NULL;

ALTER TABLE public.event_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_goals_select"
ON public.event_goals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_goals.event_id
      AND public.can_view_team(auth.uid(), e.team_id)
  )
);

CREATE POLICY "event_goals_coach_write"
ON public.event_goals FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_goals.event_id
      AND public.is_team_coach(auth.uid(), e.team_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_goals.event_id
      AND public.is_team_coach(auth.uid(), e.team_id)
  )
);