CREATE TABLE public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.conversion_events TO authenticated, anon;
GRANT ALL ON public.conversion_events TO service_role;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone inserts conversion events" ON public.conversion_events FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "superadmin reads conversion events" ON public.conversion_events FOR SELECT TO authenticated USING (public.has_super_admin(auth.uid()));
CREATE INDEX conversion_events_event_created_idx ON public.conversion_events (event_name, created_at DESC);
CREATE INDEX conversion_events_user_idx ON public.conversion_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;