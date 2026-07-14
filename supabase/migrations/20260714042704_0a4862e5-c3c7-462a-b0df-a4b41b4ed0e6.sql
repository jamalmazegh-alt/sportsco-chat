-- ===== superadmin_product_activity =====
CREATE OR REPLACE FUNCTION public.superadmin_product_activity(
  _club_id uuid DEFAULT NULL,
  _category text DEFAULT NULL,
  _status text DEFAULT NULL,
  _actor uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _cursor_ts timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  club_id uuid,
  club_name text,
  actor_user_id uuid,
  actor_full_name text,
  actor_role text,
  category text,
  action_type text,
  resource_type text,
  resource_id uuid,
  status text,
  error_code text,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.created_at, l.club_id, c.name AS club_name,
    l.actor_user_id, p.full_name AS actor_full_name, l.actor_role,
    l.category, l.action_type, l.resource_type, l.resource_id,
    l.status, l.error_code, l.metadata
  FROM public.product_activity_log l
  LEFT JOIN public.clubs c ON c.id = l.club_id
  LEFT JOIN public.profiles p ON p.id = l.actor_user_id
  WHERE public.has_super_admin(auth.uid())
    AND (_club_id  IS NULL OR l.club_id = _club_id)
    AND (_category IS NULL OR l.category = _category)
    AND (_status   IS NULL OR l.status = _status)
    AND (_actor    IS NULL OR l.actor_user_id = _actor)
    AND (_from     IS NULL OR l.created_at >= _from)
    AND (_to       IS NULL OR l.created_at <= _to)
    AND (
      _cursor_ts IS NULL
      OR l.created_at < _cursor_ts
      OR (l.created_at = _cursor_ts AND l.id < _cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.superadmin_product_activity(uuid,text,text,uuid,timestamptz,timestamptz,timestamptz,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_product_activity(uuid,text,text,uuid,timestamptz,timestamptz,timestamptz,uuid,int) TO authenticated;

-- ===== superadmin_watchlist_social_failures =====
CREATE OR REPLACE FUNCTION public.superadmin_watchlist_social_failures()
RETURNS TABLE (
  connection_id uuid,
  club_id uuid,
  club_name text,
  network text,
  account_name text,
  last_sync_error text,
  last_synced_at timestamptz,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.club_id, c.name, s.network, s.account_name,
         s.last_sync_error, s.last_synced_at, s.is_active
  FROM public.club_social_connections s
  LEFT JOIN public.clubs c ON c.id = s.club_id
  WHERE public.has_super_admin(auth.uid())
    AND s.last_sync_error IS NOT NULL
  ORDER BY s.last_synced_at DESC NULLS LAST
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.superadmin_watchlist_social_failures() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_watchlist_social_failures() TO authenticated;

-- ===== superadmin_watchlist_failed_imports =====
CREATE OR REPLACE FUNCTION public.superadmin_watchlist_failed_imports()
RETURNS TABLE (
  id uuid,
  club_id uuid,
  club_name text,
  imported_by uuid,
  importer_full_name text,
  import_type text,
  file_name text,
  status text,
  rows_total int,
  rows_imported int,
  error_log jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.club_id, c.name, i.imported_by, p.full_name,
         i.import_type, i.file_name, i.status,
         i.rows_total, i.rows_imported, i.error_log, i.created_at
  FROM public.superadmin_imports i
  LEFT JOIN public.clubs c ON c.id = i.club_id
  LEFT JOIN public.profiles p ON p.id = i.imported_by
  WHERE public.has_super_admin(auth.uid())
    AND i.status IN ('failed','partial')
  ORDER BY i.created_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.superadmin_watchlist_failed_imports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_watchlist_failed_imports() TO authenticated;