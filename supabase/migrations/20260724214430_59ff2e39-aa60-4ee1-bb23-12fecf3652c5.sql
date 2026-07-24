
CREATE OR REPLACE FUNCTION public.jsonb_diff(_old jsonb, _new jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(key, jsonb_build_object('old', _old -> key, 'new', _new -> key)), '{}'::jsonb)
  FROM (SELECT key FROM jsonb_object_keys(COALESCE(_old, '{}'::jsonb) || COALESCE(_new, '{}'::jsonb)) AS t(key)) k
  WHERE _old -> key IS DISTINCT FROM _new -> key;
$$;

CREATE OR REPLACE FUNCTION public.audit_players_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_new jsonb; v_diff jsonb;
  v_tracked text[] := ARRAY['first_name','last_name','birth_date','position','preferred_position','jersey_number','phone','email','photo_url','license_number','can_respond','media_consent_status','child_platform_access','public_profile_enabled','deleted_at'];
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
    VALUES (auth.uid(), 'player', NEW.id, 'player.created',
      jsonb_build_object('first_name', NEW.first_name, 'last_name', NEW.last_name, 'club_id', NEW.club_id), NEW.club_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
    VALUES (auth.uid(), 'player', OLD.id, 'player.deleted',
      jsonb_build_object('first_name', OLD.first_name, 'last_name', OLD.last_name), OLD.club_id);
    RETURN OLD;
  ELSE
    v_old := '{}'::jsonb; v_new := '{}'::jsonb;
    FOREACH k IN ARRAY v_tracked LOOP
      IF (to_jsonb(OLD) ? k) THEN v_old := v_old || jsonb_build_object(k, to_jsonb(OLD) -> k); END IF;
      IF (to_jsonb(NEW) ? k) THEN v_new := v_new || jsonb_build_object(k, to_jsonb(NEW) -> k); END IF;
    END LOOP;
    v_diff := public.jsonb_diff(v_old, v_new);
    IF v_diff <> '{}'::jsonb THEN
      INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
      VALUES (auth.uid(), 'player', NEW.id, 'player.updated', v_diff, NEW.club_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_players ON public.players;
CREATE TRIGGER trg_audit_players AFTER INSERT OR UPDATE OR DELETE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.audit_players_changes();

CREATE OR REPLACE FUNCTION public.audit_player_parents_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club_id uuid; v_player uuid;
BEGIN
  v_player := COALESCE(NEW.player_id, OLD.player_id);
  SELECT club_id INTO v_club_id FROM public.players WHERE id = v_player;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
    VALUES (auth.uid(), 'player', NEW.player_id, 'player.parent_linked',
      jsonb_build_object('parent_user_id', NEW.parent_user_id, 'full_name', NEW.full_name, 'email', NEW.email, 'phone', NEW.phone), v_club_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
    VALUES (auth.uid(), 'player', OLD.player_id, 'player.parent_unlinked',
      jsonb_build_object('parent_user_id', OLD.parent_user_id, 'full_name', OLD.full_name, 'email', OLD.email), v_club_id);
    RETURN OLD;
  ELSE
    INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
    VALUES (auth.uid(), 'player', NEW.player_id, 'player.parent_updated',
      public.jsonb_diff(to_jsonb(OLD) - 'created_at', to_jsonb(NEW) - 'created_at'), v_club_id);
    RETURN NEW;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_player_parents ON public.player_parents;
CREATE TRIGGER trg_audit_player_parents AFTER INSERT OR UPDATE OR DELETE ON public.player_parents
  FOR EACH ROW EXECUTE FUNCTION public.audit_player_parents_changes();

CREATE OR REPLACE FUNCTION public.audit_parent_profile_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_diff jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  v_diff := public.jsonb_diff(
    jsonb_build_object('full_name', OLD.full_name, 'first_name', OLD.first_name, 'last_name', OLD.last_name, 'phone', OLD.phone),
    jsonb_build_object('full_name', NEW.full_name, 'first_name', NEW.first_name, 'last_name', NEW.last_name, 'phone', NEW.phone)
  );
  IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
  FOR r IN
    SELECT pp.player_id, p.club_id FROM public.player_parents pp
    JOIN public.players p ON p.id = pp.player_id WHERE pp.parent_user_id = NEW.id
  LOOP
    INSERT INTO public.audit_logs(actor_user_id, entity_type, entity_id, action, changes, club_id)
    VALUES (auth.uid(), 'player', r.player_id, 'parent.profile_updated',
      v_diff || jsonb_build_object('parent_user_id', NEW.id), r.club_id);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_parent_profile ON public.profiles;
CREATE TRIGGER trg_audit_parent_profile AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_parent_profile_changes();

CREATE OR REPLACE FUNCTION public.superadmin_invite_batches(
  _template text DEFAULT NULL, _club_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit int DEFAULT 100)
RETURNS TABLE(batch_id text, bucket_start timestamptz, template_name text, club_id uuid, club_name text,
  total int, sent int, failed int, pending int, suppressed int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (message_id) l.* FROM public.email_send_log l
    WHERE public.has_super_admin(auth.uid()) AND message_id IS NOT NULL
      AND (_template IS NULL OR l.template_name = _template)
      AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
    ORDER BY message_id, created_at DESC
  ),
  bucketed AS (
    SELECT l.*, NULLIF(l.metadata->>'club_id','')::uuid AS bclub,
      date_trunc('minute', l.created_at) - ((EXTRACT(minute FROM l.created_at)::int) % 2) * INTERVAL '1 minute' AS bucket
    FROM latest l
  )
  SELECT md5(bucket::text || ':' || template_name || ':' || COALESCE(bclub::text,'null')) AS batch_id,
    bucket AS bucket_start, template_name, bclub AS club_id,
    (SELECT c.name FROM public.clubs c WHERE c.id = bclub) AS club_name,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::int AS sent,
    COUNT(*) FILTER (WHERE status IN ('failed','dlq','bounced','complained'))::int AS failed,
    COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS pending,
    COUNT(*) FILTER (WHERE status = 'suppressed')::int AS suppressed
  FROM bucketed WHERE _club_id IS NULL OR bclub = _club_id
  GROUP BY bucket, template_name, bclub ORDER BY bucket DESC LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_invite_batch_rows(_batch_id text)
RETURNS TABLE(id uuid, created_at timestamptz, template_name text, recipient_email text,
  status text, error_message text, attempt_count int, message_id text, dispatch_id uuid, metadata jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (message_id) l.* FROM public.email_send_log l
    WHERE public.has_super_admin(auth.uid()) AND message_id IS NOT NULL
    ORDER BY message_id, created_at DESC
  ),
  bucketed AS (
    SELECT l.*, NULLIF(l.metadata->>'club_id','')::uuid AS bclub,
      date_trunc('minute', l.created_at) - ((EXTRACT(minute FROM l.created_at)::int) % 2) * INTERVAL '1 minute' AS bucket
    FROM latest l
  )
  SELECT id, created_at, template_name, recipient_email, status, error_message, attempt_count, message_id, dispatch_id, metadata
  FROM bucketed
  WHERE md5(bucket::text || ':' || template_name || ':' || COALESCE(bclub::text,'null')) = _batch_id
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_notifications_emails(
  _template text DEFAULT NULL, _status text DEFAULT NULL,
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL, _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, created_at timestamptz, template_name text, recipient_email text,
  status text, error_message text, attempt_count int, message_id text, metadata jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (message_id) l.* FROM public.email_send_log l
    WHERE public.has_super_admin(auth.uid()) AND message_id IS NOT NULL
      AND (_template IS NULL OR l.template_name = _template)
      AND (_status IS NULL OR l.status = _status)
      AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
      AND (_search IS NULL OR l.recipient_email ILIKE '%'||_search||'%')
    ORDER BY message_id, created_at DESC
  )
  SELECT id, created_at, template_name, recipient_email, status, error_message, attempt_count, message_id, metadata
  FROM latest ORDER BY created_at DESC LIMIT _limit OFFSET _offset;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_notifications_push(
  _kind text DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, dispatched_at timestamptz, kind text, ref_id uuid,
  targets_count int, sent_count int, opened_count int, first_opened_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, dispatched_at, kind, ref_id, targets_count, sent_count, opened_count, first_opened_at
  FROM public.push_dispatch_log
  WHERE public.has_super_admin(auth.uid())
    AND (_kind IS NULL OR kind = _kind)
    AND (_from IS NULL OR dispatched_at >= _from) AND (_to IS NULL OR dispatched_at <= _to)
  ORDER BY dispatched_at DESC LIMIT _limit OFFSET _offset;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_club_roster(_club_id uuid)
RETURNS TABLE(team_id uuid, team_name text, team_age_group text,
  player_id uuid, player_first_name text, player_last_name text, player_birth_date date,
  player_email text, player_phone text, player_user_id uuid,
  player_last_sign_in_at timestamptz, player_last_invite_at timestamptz,
  player_child_platform_access boolean, parents jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  WITH au AS (SELECT id, email, last_sign_in_at, created_at FROM auth.users),
  parent_agg AS (
    SELECT pp.player_id, jsonb_agg(jsonb_build_object(
        'id', pp.id, 'parent_user_id', pp.parent_user_id,
        'full_name', COALESCE(pp.full_name, pr.full_name),
        'email', COALESCE(pp.email, au.email),
        'phone', COALESCE(pp.phone, pr.phone),
        'last_sign_in_at', au.last_sign_in_at,
        'account_active', pp.parent_user_id IS NOT NULL,
        'account_created_at', au.created_at,
        'last_invite_at', (SELECT MAX(mi.created_at) FROM public.member_invites mi
          WHERE mi.parent_for_player_id = pp.player_id
            AND (mi.email = pp.email OR mi.email = au.email))
      ) ORDER BY pp.created_at) AS parents
    FROM public.player_parents pp
    LEFT JOIN public.profiles pr ON pr.id = pp.parent_user_id
    LEFT JOIN au ON au.id = pp.parent_user_id
    GROUP BY pp.player_id
  )
  SELECT tm.team_id, t.name, t.age_group, p.id, p.first_name, p.last_name, p.birth_date,
    COALESCE(p.email, pau.email), p.phone, p.user_id, pau.last_sign_in_at,
    (SELECT MAX(mi.created_at) FROM public.member_invites mi WHERE mi.player_id = p.id),
    p.child_platform_access, COALESCE(pa.parents, '[]'::jsonb)
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  JOIN public.players p ON p.id = tm.player_id
  LEFT JOIN au pau ON pau.id = p.user_id
  LEFT JOIN parent_agg pa ON pa.player_id = p.id
  WHERE public.has_super_admin(auth.uid())
    AND t.club_id = _club_id AND tm.role = 'player' AND p.deleted_at IS NULL
  ORDER BY t.name, p.last_name, p.first_name;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_player_audit(_player_id uuid, _limit int DEFAULT 500)
RETURNS TABLE(occurred_at timestamptz, source text, action text,
  actor_user_id uuid, actor_name text, details jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT occurred_at, source, action, actor_user_id, actor_name, details FROM (
    SELECT al.created_at AS occurred_at, 'audit_logs'::text AS source, al.action, al.actor_user_id,
      (SELECT full_name FROM public.profiles WHERE id = al.actor_user_id) AS actor_name, al.changes AS details
    FROM public.audit_logs al WHERE al.entity_type = 'player' AND al.entity_id = _player_id
    UNION ALL
    SELECT c.created_at, 'convocation'::text, 'convocation.'||COALESCE(c.status::text,'created'),
      NULL::uuid, NULL::text, jsonb_build_object('event_id', c.event_id, 'status', c.status)
    FROM public.convocations c WHERE c.player_id = _player_id
    UNION ALL
    SELECT f.created_at, 'feedback'::text, 'feedback.created', f.author_user_id,
      (SELECT full_name FROM public.profiles WHERE id = f.author_user_id),
      jsonb_build_object('event_id', f.event_id, 'rating', f.rating)
    FROM public.player_feedback f WHERE f.player_id = _player_id
    UNION ALL
    SELECT s.created_at, 'suspension'::text, 'suspension.'||s.status, s.created_by,
      (SELECT full_name FROM public.profiles WHERE id = s.created_by),
      jsonb_build_object('reason', s.suspension_reason, 'matches', s.matches_to_serve)
    FROM public.player_suspensions s WHERE s.player_id = _player_id
    UNION ALL
    SELECT a.created_at, 'availability'::text, 'availability.'||a.status, a.created_by_user_id,
      (SELECT full_name FROM public.profiles WHERE id = a.created_by_user_id),
      jsonb_build_object('status', a.status, 'from', a.start_date, 'to', a.end_date, 'reason', a.reason)
    FROM public.player_availabilities a WHERE a.player_id = _player_id
    UNION ALL
    SELECT ach.created_at, 'achievement'::text, 'achievement.'||ach.achievement_type,
      NULL::uuid, NULL::text, jsonb_build_object('title', ach.title, 'status', ach.status)
    FROM public.player_achievements ach WHERE ach.player_id = _player_id
    UNION ALL
    SELECT t.created_at, 'timeline'::text, COALESCE(t.event_type,'timeline'), t.created_by,
      (SELECT full_name FROM public.profiles WHERE id = t.created_by),
      jsonb_build_object('title', t.title, 'description', t.description)
    FROM public.player_timeline_events t WHERE t.player_id = _player_id
  ) x
  WHERE public.has_super_admin(auth.uid())
  ORDER BY occurred_at DESC LIMIT _limit;
$$;

DROP POLICY IF EXISTS "push_dispatch_log_select_superadmin" ON public.push_dispatch_log;
CREATE POLICY "push_dispatch_log_select_superadmin"
  ON public.push_dispatch_log FOR SELECT TO authenticated
  USING (public.has_super_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.superadmin_invite_batches(text, uuid, timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_invite_batch_rows(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_notifications_emails(text, text, timestamptz, timestamptz, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_notifications_push(text, timestamptz, timestamptz, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_club_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_player_audit(uuid, int) TO authenticated;
