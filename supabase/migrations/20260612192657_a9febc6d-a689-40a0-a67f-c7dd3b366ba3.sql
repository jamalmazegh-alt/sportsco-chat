
CREATE TABLE public.training_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  location text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_official boolean NOT NULL DEFAULT true,
  excluded_dates date[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_series TO authenticated;
GRANT ALL ON public.training_series TO service_role;
ALTER TABLE public.training_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View training series" ON public.training_series FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = training_series.team_id AND tm.user_id = auth.uid()));

CREATE POLICY "Coaches manage training series" ON public.training_series FOR ALL TO authenticated
  USING (public.is_team_coach(auth.uid(), team_id))
  WITH CHECK (public.is_team_coach(auth.uid(), team_id));

CREATE TABLE public.training_series_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.training_series(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  meeting_time time,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_series_slots TO authenticated;
GRANT ALL ON public.training_series_slots TO service_role;
ALTER TABLE public.training_series_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View series slots" ON public.training_series_slots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_series s JOIN public.team_members tm ON tm.team_id = s.team_id WHERE s.id = series_id AND tm.user_id = auth.uid()));

CREATE POLICY "Coaches manage series slots" ON public.training_series_slots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_series s WHERE s.id = series_id AND public.is_team_coach(auth.uid(), s.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_series s WHERE s.id = series_id AND public.is_team_coach(auth.uid(), s.team_id)));

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.training_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_slot_id uuid REFERENCES public.training_series_slots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_detached boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS events_series_id_starts_at_idx ON public.events(series_id, starts_at);

CREATE OR REPLACE FUNCTION public.training_series_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER training_series_updated_at
  BEFORE UPDATE ON public.training_series
  FOR EACH ROW EXECUTE FUNCTION public.training_series_set_updated_at();
