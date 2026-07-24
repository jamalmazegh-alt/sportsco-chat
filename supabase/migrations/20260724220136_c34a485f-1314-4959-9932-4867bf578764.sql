
-- Defense-in-depth: convert 6 superadmin observability RPCs into plpgsql
-- wrappers that RAISE 'forbidden' at entry when the caller is not a super
-- admin. The existing WHERE has_super_admin() filters returned empty
-- rowsets instead of an explicit denial, and there was no hard block.

CREATE OR REPLACE FUNCTION public.superadmin_invite_batches(
  _template text DEFAULT NULL, _club_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit int DEFAULT 100)
RETURNS TABLE(batch_id text, bucket_start timestamptz, template_name text, club_id uuid, club_name text,
  total int, sent int, failed int, pending int, suppressed int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_super_admin((select auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (message_id) l.* FROM public.email_send_log l
    WHERE message_id IS NOT NULL
      AND (_template IS NULL OR l.template_name = _template)
      AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
    ORDER BY message_id, created_at DESC
  ),
  bucketed AS (
    SELECT l.*, NULLIF(l.metadata->>'club_id','')::uuid AS bclub,
      date_trunc('minute', l.created_at) - ((EXTRACT(minute FROM l.created_at)::int) % 2) * INTERVAL '1 minute' AS bucket
    FROM latest l
  )
  SELECT md5(b.bucket::text || ':' || b.template_name || ':' || COALESCE(b.bclub::text,'null')) AS batch_id,
    b.bucket AS bucket_start, b.template_name, b.bclub AS club_id,
    (SELECT c.name FROM public.clubs c WHERE c.id = b.bclub) AS club_name,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE b.status IN ('sent','delivered'))::int AS sent,
    COUNT(*) FILTER (WHERE b.status IN ('failed','dlq','bounced','complained'))::int AS failed,
    COUNT(*) FILTER (WHERE b.status IN ('pending','processing'))::int AS pending,
    COUNT(*) FILTER (WHERE b.status = 'suppressed')::int AS suppressed
  FROM bucketed b WHERE _club_id IS NULL OR b.bclub = _club_id
  GROUP BY b.bucket, b.template_name, b.bclub ORDER BY b.bucket DESC LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_invite_batch_rows(_batch_id text)
RETURNS TABLE(id uuid, created_at timestamptz, template_name text, recipient_email text,
  status text, error_message text, attempt_count int, message_id text, dispatch_id uuid, metadata jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_super_admin((select auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (message_id) l.* FROM public.email_send_log l
    WHERE message_id IS NOT NULL
    ORDER BY message_id, created_at DESC
  ),
  bucketed AS (
    SELECT l.*, NULLIF(l.metadata->>'club_id','')::uuid AS bclub,
      date_trunc('minute', l.created_at) - ((EXTRACT(minute FROM l.created_at)::int) % 2) * INTERVAL '1 minute' AS bucket
    FROM latest l
  )
  SELECT b.id, b.created_at, b.template_name, b.recipient_email, b.status, b.error_message,
    b.attempt_count, b.message_id, b.dispatch_id, b.metadata
  FROM bucketed b
  WHERE md5(b.bucket::text || ':' || b.template_name || ':' || COALESCE(b.bclub::text,'null')) = _batch_id
  ORDER BY b.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_notifications_emails(
  _template text DEFAULT NULL, _status text DEFAULT NULL,
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL, _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, created_at timestamptz, template_name text, recipient_email text,
  status text, error_message text, attempt_count int, message_id text, metadata jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_super_admin((select auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (message_id) l.* FROM public.email_send_log l
    WHERE message_id IS NOT NULL
      AND (_template IS NULL OR l.template_name = _template)
      AND (_status IS NULL OR l.status = _status)
      AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
      AND (_search IS NULL OR l.recipient_email ILIKE '%'||_search||'%')
    ORDER BY message_id, created_at DESC
  )
  SELECT l.id, l.created_at, l.template_name, l.recipient_email, l.status, l.error_message,
    l.attempt_count, l.message_id, l.metadata
  FROM latest l ORDER BY l.created_at DESC LIMIT _limit OFFSET _offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_notifications_push(
  _kind text DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, dispatched_at timestamptz, kind text, ref_id uuid,
  targets_count int, sent_count int, opened_count int, first_opened_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_super_admin((select auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.dispatched_at, p.kind, p.ref_id, p.targets_count, p.sent_count, p.opened_count, p.first_opened_at
  FROM public.push_dispatch_log p
  WHERE (_kind IS NULL OR p.kind = _kind)
    AND (_from IS NULL OR p.dispatched_at >= _from) AND (_to IS NULL OR p.dispatched_at <= _to)
  ORDER BY p.dispatched_at DESC LIMIT _limit OFFSET _offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_club_roster(_club_id uuid)
RETURNS TABLE(team_id uuid, team_name text, team_age_group text,
  player_id uuid, player_first_name text, player_last_name text, player_birth_date date,
  player_email text, player_phone text, player_user_id uuid,
  player_last_sign_in_at timestamptz, player_last_invite_at timestamptz,
  player_child_platform_access boolean, parents jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.has_super_admin((select auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH au AS (SELECT u.id, u.email, u.last_sign_in_at, u.created_at FROM auth.users u),
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
  WHERE t.club_id = _club_id AND tm.role = 'player' AND p.deleted_at IS NULL
  ORDER BY t.name, p.last_name, p.first_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_player_audit(_player_id uuid, _limit int DEFAULT 500)
RETURNS TABLE(occurred_at timestamptz, source text, action text,
  actor_user_id uuid, actor_name text, details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_super_admin((select auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT x.occurred_at, x.source, x.action, x.actor_user_id, x.actor_name, x.details FROM (
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
  ORDER BY x.occurred_at DESC LIMIT _limit;
END;
$$;
