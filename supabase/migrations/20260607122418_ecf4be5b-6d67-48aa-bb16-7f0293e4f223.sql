
CREATE TABLE IF NOT EXISTS public.tournament_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  name text NOT NULL,
  short_name text,
  color text,
  qualification_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  enable_third_place boolean NOT NULL DEFAULT true,
  enable_fifth_place boolean NOT NULL DEFAULT false,
  enable_seventh_place boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_tournament_flights_tournament
  ON public.tournament_flights(tournament_id);

GRANT SELECT ON public.tournament_flights TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_flights TO authenticated;
GRANT ALL ON public.tournament_flights TO service_role;

ALTER TABLE public.tournament_flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flights_select_public_or_member"
  ON public.tournament_flights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id
        AND t.status IN ('published','in_progress','completed')
    )
    OR (auth.uid() IS NOT NULL AND public.can_view_tournament(auth.uid(), tournament_id))
  );

CREATE POLICY "flights_manage_organizers"
  ON public.tournament_flights
  FOR ALL
  TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE OR REPLACE FUNCTION public.tournament_flights_touch_updated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_flights_updated_at ON public.tournament_flights;
CREATE TRIGGER trg_tournament_flights_updated_at
  BEFORE UPDATE ON public.tournament_flights
  FOR EACH ROW EXECUTE FUNCTION public.tournament_flights_touch_updated();

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS flight_id uuid REFERENCES public.tournament_flights(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS placement_kind text;

ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_placement_kind_check;
ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_placement_kind_check
  CHECK (
    placement_kind IS NULL
    OR placement_kind = ANY (ARRAY['final','third_place','fifth_place','seventh_place','semi','quarter','round_of_16','round_of_32'])
  );

CREATE INDEX IF NOT EXISTS idx_tournament_matches_flight
  ON public.tournament_matches(flight_id);

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS min_rest_minutes integer NOT NULL DEFAULT 15;
