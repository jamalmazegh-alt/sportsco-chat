CREATE TABLE public.waitlist_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  features text[] NOT NULL,
  role text,
  marketing_consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  source text DEFAULT 'landing',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.waitlist_interest TO service_role;
-- Intentionally NO grants to anon/authenticated: writes go via service_role
-- inside the /api/public/waitlist server route; no client read access.

ALTER TABLE public.waitlist_interest ENABLE ROW LEVEL SECURITY;
-- No policies = locked. Service role bypasses RLS.

CREATE INDEX waitlist_interest_email_idx ON public.waitlist_interest (lower(email));
CREATE INDEX waitlist_interest_created_at_idx ON public.waitlist_interest (created_at DESC);