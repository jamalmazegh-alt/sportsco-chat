CREATE OR REPLACE FUNCTION public.get_camps_due_for_document_purge()
RETURNS TABLE(id uuid, end_date date, document_retention_months integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.end_date, c.document_retention_months
  FROM public.club_camps c
  WHERE c.end_date IS NOT NULL
    AND (c.end_date + make_interval(months => GREATEST(1, COALESCE(c.document_retention_months, 6)))) <= (now() AT TIME ZONE 'UTC')::date;
$$;

REVOKE ALL ON FUNCTION public.get_camps_due_for_document_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_camps_due_for_document_purge() TO service_role;