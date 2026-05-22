
-- =========================================================================
-- Tournament matches: validation, dispute, overtime, penalty shootout
-- =========================================================================
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS dispute_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalty_score_a integer,
  ADD COLUMN IF NOT EXISTS penalty_score_b integer,
  ADD COLUMN IF NOT EXISTS overtime_score_a integer,
  ADD COLUMN IF NOT EXISTS overtime_score_b integer;

-- =========================================================================
-- Tournament match events (cards, goals, fair-play sources)
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE public.tournament_event_kind AS ENUM (
    'goal','own_goal','assist','yellow_card','red_card','second_yellow','penalty','foul'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tournament_match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  player_name text,
  kind public.tournament_event_kind NOT NULL,
  minute integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_match_events_tournament ON public.tournament_match_events(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_events_match ON public.tournament_match_events(match_id);

ALTER TABLE public.tournament_match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_match_events_select ON public.tournament_match_events;
CREATE POLICY tournament_match_events_select ON public.tournament_match_events
  FOR SELECT TO anon, authenticated
  USING (public.can_view_tournament(auth.uid(), tournament_id));

DROP POLICY IF EXISTS tournament_match_events_write ON public.tournament_match_events;
CREATE POLICY tournament_match_events_write ON public.tournament_match_events
  FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

-- =========================================================================
-- Tournament documents (generated PDFs: rules, etc.)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tournament_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind text NOT NULL,
  language text NOT NULL DEFAULT 'fr',
  file_url text NOT NULL,
  storage_path text,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_documents_tournament ON public.tournament_documents(tournament_id);

ALTER TABLE public.tournament_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_documents_select ON public.tournament_documents;
CREATE POLICY tournament_documents_select ON public.tournament_documents
  FOR SELECT TO anon, authenticated
  USING (public.can_view_tournament(auth.uid(), tournament_id));

DROP POLICY IF EXISTS tournament_documents_write ON public.tournament_documents;
CREATE POLICY tournament_documents_write ON public.tournament_documents
  FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

-- =========================================================================
-- Storage bucket for tournament documents
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('tournament-documents', 'tournament-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tournament_documents_public_read" ON storage.objects;
CREATE POLICY "tournament_documents_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tournament-documents');

DROP POLICY IF EXISTS "tournament_documents_manager_write" ON storage.objects;
CREATE POLICY "tournament_documents_manager_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tournament-documents'
    AND public.can_manage_tournament(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS "tournament_documents_manager_update" ON storage.objects;
CREATE POLICY "tournament_documents_manager_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tournament-documents'
    AND public.can_manage_tournament(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS "tournament_documents_manager_delete" ON storage.objects;
CREATE POLICY "tournament_documents_manager_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tournament-documents'
    AND public.can_manage_tournament(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid
    )
  );
