CREATE OR REPLACE FUNCTION public.email_exists(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon, authenticated;