-- Fix PL/pgSQL RETURNS TABLE column-name clash with email_send_log.message_id
-- (and created_at). Unqualified references in DISTINCT ON / WHERE / ORDER BY
-- raised: column reference "message_id" is ambiguous — seen on
-- /superadmin/notifications (Emails tab).

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
    SELECT DISTINCT ON (l.message_id) l.* FROM public.email_send_log l
    WHERE l.message_id IS NOT NULL
      AND (_template IS NULL OR l.template_name = _template)
      AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
    ORDER BY l.message_id, l.created_at DESC
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
    SELECT DISTINCT ON (l.message_id) l.* FROM public.email_send_log l
    WHERE l.message_id IS NOT NULL
    ORDER BY l.message_id, l.created_at DESC
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
    SELECT DISTINCT ON (l.message_id) l.* FROM public.email_send_log l
    WHERE l.message_id IS NOT NULL
      AND (_template IS NULL OR l.template_name = _template)
      AND (_status IS NULL OR l.status = _status)
      AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
      AND (_search IS NULL OR l.recipient_email ILIKE '%'||_search||'%')
    ORDER BY l.message_id, l.created_at DESC
  )
  SELECT l.id, l.created_at, l.template_name, l.recipient_email, l.status, l.error_message,
    l.attempt_count, l.message_id, l.metadata
  FROM latest l ORDER BY l.created_at DESC LIMIT _limit OFFSET _offset;
END;
$$;
