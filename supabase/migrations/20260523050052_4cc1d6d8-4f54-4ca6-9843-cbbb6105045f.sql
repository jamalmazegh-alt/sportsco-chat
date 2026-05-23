
-- Coach Insights table
CREATE TABLE public.coach_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  insight_type text NOT NULL CHECK (insight_type IN (
    'pending_convocations',
    'consecutive_absences',
    'missing_score',
    'missing_guardian'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_fr text NOT NULL,
  message_en text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  action_type text CHECK (action_type IN ('send_reminder','view_event','view_player')),
  action_payload jsonb,
  dismissed_by uuid[] NOT NULL DEFAULT '{}'::uuid[],
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  dedup_key text UNIQUE
);

CREATE INDEX idx_insights_club ON public.coach_insights(club_id, resolved_at, expires_at);
CREATE INDEX idx_insights_dedup ON public.coach_insights(dedup_key);

ALTER TABLE public.coach_insights ENABLE ROW LEVEL SECURITY;

-- Only admins/coaches of the club can view
CREATE POLICY coach_insights_select_staff
ON public.coach_insights
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = coach_insights.club_id
      AND cm.user_id = auth.uid()
      AND ('admin' = ANY(cm.roles) OR 'coach' = ANY(cm.roles) OR 'assistant_coach' = ANY(cm.roles))
  )
);

-- Allow update of dismissed_by by the user themselves (server function uses service role anyway,
-- but we permit a narrow client update for dismiss action)
CREATE POLICY coach_insights_update_dismiss
ON public.coach_insights
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = coach_insights.club_id
      AND cm.user_id = auth.uid()
      AND ('admin' = ANY(cm.roles) OR 'coach' = ANY(cm.roles) OR 'assistant_coach' = ANY(cm.roles))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = coach_insights.club_id
      AND cm.user_id = auth.uid()
      AND ('admin' = ANY(cm.roles) OR 'coach' = ANY(cm.roles) OR 'assistant_coach' = ANY(cm.roles))
  )
);
