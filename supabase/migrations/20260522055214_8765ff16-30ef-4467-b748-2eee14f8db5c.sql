CREATE TYPE public.tournament_pass_status AS ENUM ('pending', 'paid', 'used', 'refunded');

CREATE TABLE public.tournament_passes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  user_id UUID,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_total INTEGER,
  currency TEXT,
  status public.tournament_pass_status NOT NULL DEFAULT 'pending',
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournament_passes_email ON public.tournament_passes(email);
CREATE INDEX idx_tournament_passes_user_id ON public.tournament_passes(user_id);
CREATE INDEX idx_tournament_passes_status ON public.tournament_passes(status);

ALTER TABLE public.tournament_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tournament passes"
ON public.tournament_passes
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all tournament passes"
ON public.tournament_passes
FOR SELECT
TO authenticated
USING (public.has_super_admin(auth.uid()));

CREATE TRIGGER trg_tournament_passes_updated_at
BEFORE UPDATE ON public.tournament_passes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();