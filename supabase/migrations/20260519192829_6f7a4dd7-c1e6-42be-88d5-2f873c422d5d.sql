
DO $$ BEGIN
  CREATE TYPE public.lineup_visibility AS ENUM ('draft','staff','selected_players','team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  team_id uuid NOT NULL,
  club_id uuid NOT NULL,
  formation text NOT NULL DEFAULT '4-4-2',
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  bench jsonb NOT NULL DEFAULT '[]'::jsonb,
  captain_player_id uuid,
  gk_player_id uuid,
  visibility public.lineup_visibility NOT NULL DEFAULT 'draft',
  include_in_convocation boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_lineups_team_idx ON public.event_lineups(team_id);
CREATE INDEX IF NOT EXISTS event_lineups_club_idx ON public.event_lineups(club_id);

ALTER TABLE public.event_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_lineups_coach_write ON public.event_lineups
  FOR ALL TO authenticated
  USING (is_team_coach(auth.uid(), team_id) OR has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (is_team_coach(auth.uid(), team_id) OR has_club_role(auth.uid(), club_id, 'admin'::app_role));

CREATE POLICY event_lineups_select_viewer ON public.event_lineups
  FOR SELECT TO authenticated
  USING (
    published_at IS NOT NULL
    AND can_view_team(auth.uid(), team_id)
    AND (
      visibility = 'team'
      OR (
        visibility = 'selected_players'
        AND EXISTS (
          SELECT 1 FROM public.convocations c
          JOIN public.players p ON p.id = c.player_id
          WHERE c.event_id = event_lineups.event_id
            AND (
              p.user_id = auth.uid()
              OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid())
            )
            AND c.status <> 'absent'
        )
      )
    )
  );

CREATE TRIGGER update_event_lineups_updated_at
  BEFORE UPDATE ON public.event_lineups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
