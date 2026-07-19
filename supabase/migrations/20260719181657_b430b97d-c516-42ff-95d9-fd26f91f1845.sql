
-- ============================================================================
-- 1. Audit schema
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS audit;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON SCHEMA audit FROM anon, authenticated;
GRANT USAGE ON SCHEMA audit TO service_role;

-- 2. Enums
DO $$ BEGIN CREATE TYPE publication_type AS ENUM ('message','poll'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE poll_visibility AS ENUM ('staff_visible','anonymous'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE publication_audience_type AS ENUM (
    'joueurs_convoques','parents_convoques','joueurs_equipe','parents_equipe',
    'joueurs_categorie','parents_categorie','educateurs','dirigeants',
    'groupe_personnalise','selection_manuelle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE publication_dispatch_kind AS ENUM ('publish','audience_refresh','manual_resend'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE poll_vote_action AS ENUM ('vote','change','retrait'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public._set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 3. club_publications (table only; recipient policy added later)
CREATE TABLE public.club_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  publication_type publication_type NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  poll_visibility poll_visibility,
  publish_to_wall BOOLEAN NOT NULL DEFAULT TRUE,
  send_email BOOLEAN NOT NULL DEFAULT FALSE,
  email_body TEXT,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  closes_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT publications_delivery_chk CHECK (publish_to_wall = TRUE OR send_email = TRUE),
  CONSTRAINT publications_email_body_chk CHECK (email_body IS NULL OR send_email = TRUE),
  CONSTRAINT publications_poll_visibility_chk CHECK (
    (publication_type = 'poll' AND poll_visibility IS NOT NULL) OR
    (publication_type <> 'poll' AND poll_visibility IS NULL)
  ),
  CONSTRAINT publications_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 200)
);
CREATE INDEX idx_publications_club_published ON public.club_publications(club_id, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_publications_event ON public.club_publications(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_publications_author ON public.club_publications(author_id);
CREATE TRIGGER trg_publications_updated_at BEFORE UPDATE ON public.club_publications
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
GRANT SELECT, INSERT, UPDATE ON public.club_publications TO authenticated;
GRANT ALL ON public.club_publications TO service_role;
ALTER TABLE public.club_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY publications_staff_all ON public.club_publications
  FOR ALL TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id))
  WITH CHECK (public.is_club_staff(auth.uid(), club_id));

-- 4. dispatches
CREATE TABLE public.club_publication_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  dispatch_id UUID NOT NULL,
  kind publication_dispatch_kind NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipients_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pub_dispatches_pub ON public.club_publication_dispatches(publication_id, created_at DESC);
GRANT SELECT, INSERT ON public.club_publication_dispatches TO authenticated;
GRANT ALL ON public.club_publication_dispatches TO service_role;
ALTER TABLE public.club_publication_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_dispatches_staff ON public.club_publication_dispatches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));

-- 5. audiences
CREATE TABLE public.club_publication_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  audience_type publication_audience_type NOT NULL,
  group_id UUID REFERENCES public.club_groups(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  category_label TEXT,
  season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pub_aud_shape_chk CHECK (
    (audience_type = 'groupe_personnalise' AND group_id IS NOT NULL AND team_id IS NULL AND category_label IS NULL AND event_id IS NULL) OR
    (audience_type IN ('joueurs_equipe','parents_equipe') AND team_id IS NOT NULL AND group_id IS NULL AND category_label IS NULL AND event_id IS NULL) OR
    (audience_type IN ('joueurs_categorie','parents_categorie') AND category_label IS NOT NULL AND group_id IS NULL AND team_id IS NULL AND event_id IS NULL) OR
    (audience_type IN ('joueurs_convoques','parents_convoques') AND event_id IS NOT NULL AND group_id IS NULL AND team_id IS NULL AND category_label IS NULL) OR
    (audience_type IN ('educateurs','dirigeants','selection_manuelle') AND group_id IS NULL AND team_id IS NULL AND category_label IS NULL AND event_id IS NULL)
  )
);
CREATE INDEX idx_pub_aud_pub ON public.club_publication_audiences(publication_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_publication_audiences TO authenticated;
GRANT ALL ON public.club_publication_audiences TO service_role;
ALTER TABLE public.club_publication_audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_aud_staff ON public.club_publication_audiences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));

-- 6. manual_members
CREATE TABLE public.club_publication_manual_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (publication_id, member_id)
);
CREATE INDEX idx_pub_manual_pub ON public.club_publication_manual_members(publication_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_publication_manual_members TO authenticated;
GRANT ALL ON public.club_publication_manual_members TO service_role;
ALTER TABLE public.club_publication_manual_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_manual_staff ON public.club_publication_manual_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));

-- 7. recipients (snapshot)
CREATE TABLE public.club_publication_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  first_dispatch_id UUID REFERENCES public.club_publication_dispatches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (publication_id, member_id)
);
CREATE INDEX idx_pub_recipients_member ON public.club_publication_recipients(member_id);
CREATE INDEX idx_pub_recipients_pub ON public.club_publication_recipients(publication_id);
GRANT SELECT, INSERT ON public.club_publication_recipients TO authenticated;
GRANT ALL ON public.club_publication_recipients TO service_role;
ALTER TABLE public.club_publication_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_recipients_staff ON public.club_publication_recipients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));
CREATE POLICY pub_recipients_self_read ON public.club_publication_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = member_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid())
        )
    )
  );

-- Now that recipients exists, add recipient-facing policy on club_publications
CREATE POLICY publications_recipient_read ON public.club_publications
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = club_publications.id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid())
        )
    )
  );

-- 8. documents + media
CREATE TABLE public.club_publication_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pub_docs_pub ON public.club_publication_documents(publication_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_publication_documents TO authenticated;
GRANT ALL ON public.club_publication_documents TO service_role;
ALTER TABLE public.club_publication_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_docs_staff ON public.club_publication_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));
CREATE POLICY pub_docs_recipient_read ON public.club_publication_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = club_publication_documents.publication_id
        AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    )
  );

CREATE TABLE public.club_publication_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pub_media_pub ON public.club_publication_media(publication_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_publication_media TO authenticated;
GRANT ALL ON public.club_publication_media TO service_role;
ALTER TABLE public.club_publication_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_media_staff ON public.club_publication_media
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));
CREATE POLICY pub_media_recipient_read ON public.club_publication_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = club_publication_media.publication_id
        AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    )
  );

-- 9. poll options
CREATE TABLE public.club_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT poll_option_label_len CHECK (char_length(btrim(label)) BETWEEN 1 AND 120)
);
CREATE INDEX idx_poll_options_pub ON public.club_poll_options(publication_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_poll_options TO authenticated;
GRANT ALL ON public.club_poll_options TO service_role;
ALTER TABLE public.club_poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY poll_options_staff ON public.club_poll_options
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_publications p WHERE p.id = publication_id AND public.is_club_staff(auth.uid(), p.club_id)));
CREATE POLICY poll_options_recipient_read ON public.club_poll_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = club_poll_options.publication_id
        AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    )
  );

-- 10. poll votes
CREATE TABLE public.club_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.club_publications(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.club_poll_options(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  cast_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (publication_id, member_id)
);
CREATE INDEX idx_poll_votes_option ON public.club_poll_votes(option_id);
CREATE INDEX idx_poll_votes_member ON public.club_poll_votes(member_id);
CREATE TRIGGER trg_poll_votes_updated_at BEFORE UPDATE ON public.club_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
GRANT SELECT ON public.club_poll_votes TO authenticated;
GRANT ALL ON public.club_poll_votes TO service_role;
ALTER TABLE public.club_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY poll_votes_own_read ON public.club_poll_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = member_id
        AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    )
  );
CREATE POLICY poll_votes_staff_read ON public.club_poll_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_publications p
      WHERE p.id = publication_id AND p.poll_visibility = 'staff_visible' AND public.is_club_staff(auth.uid(), p.club_id)
    )
  );

-- 11. audit table
CREATE TABLE audit.club_poll_vote_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL,
  option_id UUID NOT NULL,
  member_id UUID NOT NULL,
  cast_by_user_id UUID NOT NULL,
  action poll_vote_action NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_poll_pub ON audit.club_poll_vote_log(publication_id);
REVOKE ALL ON audit.club_poll_vote_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON audit.club_poll_vote_log TO service_role;

CREATE OR REPLACE FUNCTION audit._reject_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit log is append-only'; END $$;
CREATE TRIGGER audit_poll_no_update BEFORE UPDATE ON audit.club_poll_vote_log
  FOR EACH ROW EXECUTE FUNCTION audit._reject_mutation();
CREATE TRIGGER audit_poll_no_delete BEFORE DELETE ON audit.club_poll_vote_log
  FOR EACH ROW EXECUTE FUNCTION audit._reject_mutation();

-- 12. guards
CREATE OR REPLACE FUNCTION public._guard_poll_option_edit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.club_poll_votes v WHERE v.option_id = OLD.id) THEN
      RAISE EXCEPTION 'poll_option_has_votes' USING ERRCODE='check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.label <> NEW.label THEN
    IF EXISTS (SELECT 1 FROM public.club_poll_votes v WHERE v.option_id = OLD.id) THEN
      RAISE EXCEPTION 'poll_option_has_votes' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_poll_option_guard BEFORE UPDATE OR DELETE ON public.club_poll_options
  FOR EACH ROW EXECUTE FUNCTION public._guard_poll_option_edit();

CREATE OR REPLACE FUNCTION public._guard_publication_visibility()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.poll_visibility IS DISTINCT FROM NEW.poll_visibility THEN
    IF EXISTS (SELECT 1 FROM public.club_poll_votes v WHERE v.publication_id = OLD.id) THEN
      RAISE EXCEPTION 'poll_visibility_locked_with_votes' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_publication_visibility_guard BEFORE UPDATE ON public.club_publications
  FOR EACH ROW EXECUTE FUNCTION public._guard_publication_visibility();

-- 13. RPC: resolve_publication_audience
CREATE OR REPLACE FUNCTION public.resolve_publication_audience(_publication_id UUID)
RETURNS TABLE(member_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _club_id UUID;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_publications WHERE id = _publication_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  WITH aud AS (SELECT * FROM public.club_publication_audiences WHERE publication_id = _publication_id),
  members AS (
    SELECT p.id AS mid FROM public.players p
    JOIN aud a ON a.audience_type = 'joueurs_equipe'
    JOIN public.team_members tm ON tm.team_id = a.team_id AND tm.player_id = p.id
    WHERE p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN aud a ON a.audience_type = 'parents_equipe'
    JOIN public.team_members tm ON tm.team_id = a.team_id AND tm.player_id = p.id
    WHERE p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN public.player_seasons ps ON ps.player_id = p.id AND ps.club_id = _club_id
    JOIN aud a ON a.audience_type = 'joueurs_categorie' AND lower(a.category_label) = lower(ps.category)
    JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id AND s.label = ps.season_label
    WHERE p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN public.player_seasons ps ON ps.player_id = p.id AND ps.club_id = _club_id
    JOIN aud a ON a.audience_type = 'parents_categorie' AND lower(a.category_label) = lower(ps.category)
    JOIN public.seasons s ON s.id = a.season_id AND s.club_id = _club_id AND s.label = ps.season_label
    WHERE p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN aud a ON a.audience_type = 'joueurs_convoques'
    JOIN public.convocations c ON c.event_id = a.event_id AND c.player_id = p.id
    WHERE p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN aud a ON a.audience_type = 'parents_convoques'
    JOIN public.convocations c ON c.event_id = a.event_id AND c.player_id = p.id
    WHERE p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN aud a ON a.audience_type = 'educateurs'
    JOIN public.teams t ON t.club_id = _club_id
    JOIN public.team_members tm ON tm.team_id = t.id AND tm.player_id = p.id AND tm.role IN ('coach','assistant_coach')
    WHERE p.deleted_at IS NULL
    UNION
    SELECT p.id FROM public.players p
    JOIN aud a ON a.audience_type = 'dirigeants'
    JOIN public.club_members cm ON cm.club_id = _club_id AND cm.user_id = p.user_id AND cm.role IN ('admin','dirigeant')
    WHERE p.deleted_at IS NULL
    UNION
    SELECT cgm.player_id FROM public.club_group_members cgm
    JOIN aud a ON a.audience_type = 'groupe_personnalise' AND a.group_id = cgm.group_id
    JOIN public.players p ON p.id = cgm.player_id
    WHERE p.club_id = _club_id AND p.deleted_at IS NULL
    UNION
    SELECT mm.member_id FROM public.club_publication_manual_members mm
    JOIN aud a ON a.audience_type = 'selection_manuelle'
    JOIN public.players p ON p.id = mm.member_id
    WHERE mm.publication_id = _publication_id AND p.club_id = _club_id AND p.deleted_at IS NULL
  )
  SELECT DISTINCT m.mid FROM members m;
END $$;
REVOKE ALL ON FUNCTION public.resolve_publication_audience(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_publication_audience(UUID) TO authenticated, service_role;

-- 14. RPC: publish_publication_atomic
CREATE OR REPLACE FUNCTION public.publish_publication_atomic(
  _publication_id UUID,
  _kind publication_dispatch_kind,
  _dispatch_id UUID DEFAULT NULL
)
RETURNS TABLE(dispatch_row_id UUID, recipients_count INT, new_recipient_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _club_id UUID;
  _dispatch_row UUID;
  _resolved_count INT;
  _delta_count INT;
  _final_dispatch UUID := COALESCE(_dispatch_id, gen_random_uuid());
BEGIN
  SELECT club_id INTO _club_id FROM public.club_publications WHERE id = _publication_id AND deleted_at IS NULL;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'publication_not_found_or_deleted'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  CREATE TEMP TABLE _resolved(member_id UUID PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _resolved(member_id)
    SELECT member_id FROM public.resolve_publication_audience(_publication_id);
  SELECT count(*) INTO _resolved_count FROM _resolved;

  INSERT INTO public.club_publication_dispatches(publication_id, dispatch_id, kind, created_by, recipients_count)
    VALUES(_publication_id, _final_dispatch, _kind, auth.uid(), 0)
    RETURNING id INTO _dispatch_row;

  WITH inserted AS (
    INSERT INTO public.club_publication_recipients(publication_id, member_id, first_dispatch_id)
    SELECT _publication_id, r.member_id, _dispatch_row
      FROM _resolved r
     WHERE NOT EXISTS (SELECT 1 FROM public.club_publication_recipients rr
                         WHERE rr.publication_id = _publication_id AND rr.member_id = r.member_id)
    RETURNING member_id
  )
  SELECT count(*) INTO _delta_count FROM inserted;

  UPDATE public.club_publication_dispatches
     SET recipients_count = CASE
       WHEN _kind = 'audience_refresh' THEN _delta_count
       ELSE _resolved_count
     END
   WHERE id = _dispatch_row;

  RETURN QUERY SELECT _dispatch_row, _resolved_count, _delta_count;
END $$;
REVOKE ALL ON FUNCTION public.publish_publication_atomic(UUID, publication_dispatch_kind, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_publication_atomic(UUID, publication_dispatch_kind, UUID) TO authenticated, service_role;

-- 15. RPC: cast_poll_vote
CREATE OR REPLACE FUNCTION public.cast_poll_vote(_publication_id UUID, _option_id UUID, _member_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, audit AS $$
DECLARE
  _pub RECORD; _opt_pub UUID; _authorized BOOLEAN;
  _vote_id UUID; _prev_option UUID; _action poll_vote_action;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT id, club_id, publication_type, closed_at, closes_at, deleted_at
    INTO _pub FROM public.club_publications WHERE id = _publication_id;
  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  IF _pub.closed_at IS NOT NULL OR (_pub.closes_at IS NOT NULL AND _pub.closes_at < now()) THEN
    RAISE EXCEPTION 'poll_closed';
  END IF;
  SELECT publication_id INTO _opt_pub FROM public.club_poll_options WHERE id = _option_id;
  IF _opt_pub IS NULL OR _opt_pub <> _publication_id THEN RAISE EXCEPTION 'option_mismatch'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.club_publication_recipients r
    JOIN public.players p ON p.id = r.member_id
    WHERE r.publication_id = _publication_id AND r.member_id = _member_id
      AND (p.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid() AND pp.can_respond = TRUE))
  ) INTO _authorized;
  IF NOT _authorized THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT option_id INTO _prev_option FROM public.club_poll_votes
    WHERE publication_id = _publication_id AND member_id = _member_id;
  IF _prev_option IS NULL THEN
    _action := 'vote';
    INSERT INTO public.club_poll_votes(publication_id, option_id, member_id, cast_by_user_id)
      VALUES(_publication_id, _option_id, _member_id, auth.uid()) RETURNING id INTO _vote_id;
  ELSIF _prev_option = _option_id THEN
    SELECT id INTO _vote_id FROM public.club_poll_votes
      WHERE publication_id = _publication_id AND member_id = _member_id;
    RETURN _vote_id;
  ELSE
    _action := 'change';
    UPDATE public.club_poll_votes
       SET option_id = _option_id, cast_by_user_id = auth.uid(), updated_at = now()
     WHERE publication_id = _publication_id AND member_id = _member_id RETURNING id INTO _vote_id;
  END IF;
  INSERT INTO audit.club_poll_vote_log(publication_id, option_id, member_id, cast_by_user_id, action)
    VALUES(_publication_id, _option_id, _member_id, auth.uid(), _action);
  RETURN _vote_id;
END $$;
REVOKE ALL ON FUNCTION public.cast_poll_vote(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(UUID, UUID, UUID) TO authenticated;

-- 16. RPC: get_poll_results
CREATE OR REPLACE FUNCTION public.get_poll_results(_publication_id UUID)
RETURNS TABLE(option_id UUID, label TEXT, sort_order INT, vote_count INT,
              total_voters INT, below_threshold BOOLEAN, is_anonymous BOOLEAN, is_closed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pub RECORD; _is_recipient BOOLEAN; _is_staff BOOLEAN; _total INT; _threshold_hit BOOLEAN;
BEGIN
  SELECT id, club_id, publication_type, poll_visibility, closed_at, closes_at, deleted_at
    INTO _pub FROM public.club_publications WHERE id = _publication_id;
  IF _pub.id IS NULL OR _pub.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF _pub.publication_type <> 'poll' THEN RAISE EXCEPTION 'not_a_poll'; END IF;
  _is_staff := public.is_club_staff(auth.uid(), _pub.club_id);
  IF NOT _is_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_publication_recipients r
      JOIN public.players p ON p.id = r.member_id
      WHERE r.publication_id = _publication_id
        AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
    ) INTO _is_recipient;
    IF NOT _is_recipient THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;
  SELECT count(*)::INT INTO _total FROM public.club_poll_votes v WHERE v.publication_id = _publication_id;
  _threshold_hit := (_pub.poll_visibility = 'anonymous' AND _total < 3);
  RETURN QUERY
  SELECT o.id, o.label, o.sort_order,
    COALESCE((SELECT count(*)::INT FROM public.club_poll_votes v WHERE v.option_id = o.id), 0),
    _total, _threshold_hit,
    (_pub.poll_visibility = 'anonymous'),
    (_pub.closed_at IS NOT NULL OR (_pub.closes_at IS NOT NULL AND _pub.closes_at < now()))
  FROM public.club_poll_options o
  WHERE o.publication_id = _publication_id
  ORDER BY o.sort_order, o.created_at;
END $$;
REVOKE ALL ON FUNCTION public.get_poll_results(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_poll_results(UUID) TO authenticated, service_role;

-- 17. close + soft delete
CREATE OR REPLACE FUNCTION public.close_publication(_publication_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _club UUID;
BEGIN
  SELECT club_id INTO _club FROM public.club_publications WHERE id = _publication_id AND deleted_at IS NULL;
  IF _club IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.club_publications SET closed_at = COALESCE(closed_at, now()) WHERE id = _publication_id;
END $$;
REVOKE ALL ON FUNCTION public.close_publication(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_publication(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.soft_delete_publication(_publication_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _club UUID;
BEGIN
  SELECT club_id INTO _club FROM public.club_publications WHERE id = _publication_id AND deleted_at IS NULL;
  IF _club IS NULL THEN RAISE EXCEPTION 'publication_not_found'; END IF;
  IF NOT public.is_club_staff(auth.uid(), _club) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.club_publications SET deleted_at = now() WHERE id = _publication_id;
END $$;
REVOKE ALL ON FUNCTION public.soft_delete_publication(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_publication(UUID) TO authenticated, service_role;

-- 18. Storage policies for publication-media
DO $$ BEGIN
  CREATE POLICY publication_media_staff_all ON storage.objects
    FOR ALL TO authenticated
    USING (
      bucket_id = 'publication-media'
      AND EXISTS (SELECT 1 FROM public.clubs c WHERE c.id::text = split_part(name, '/', 1) AND public.is_club_staff(auth.uid(), c.id))
    )
    WITH CHECK (
      bucket_id = 'publication-media'
      AND EXISTS (SELECT 1 FROM public.clubs c WHERE c.id::text = split_part(name, '/', 1) AND public.is_club_staff(auth.uid(), c.id))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY publication_media_recipient_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'publication-media'
      AND EXISTS (
        SELECT 1 FROM public.club_publication_recipients r
        JOIN public.players p ON p.id = r.member_id
        WHERE r.publication_id::text = split_part(name, '/', 2)
          AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.player_parents pp WHERE pp.player_id = p.id AND pp.parent_user_id = auth.uid()))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
