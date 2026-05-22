CREATE TYPE public.tournament_registration_status AS ENUM (
  'pending', 'approved', 'rejected', 'cancelled'
);

CREATE TABLE public.tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_name text NOT NULL,
  short_name text,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status public.tournament_registration_status NOT NULL DEFAULT 'pending',
  tournament_team_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  decision_note text,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tr_tournament ON public.tournament_registrations(tournament_id);
CREATE INDEX idx_tr_status ON public.tournament_registrations(tournament_id, status);

ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

-- Organizers full access; submissions go through the public API (service role)
CREATE POLICY "tournament_registrations_manager_all"
  ON public.tournament_registrations FOR ALL
  TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE TRIGGER trg_tr_updated
  BEFORE UPDATE ON public.tournament_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
