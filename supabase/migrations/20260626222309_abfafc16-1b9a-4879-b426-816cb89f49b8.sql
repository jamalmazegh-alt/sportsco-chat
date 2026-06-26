CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  _ip text,
  _route text,
  _window timestamptz,
  _limit int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO public.public_rate_limits (ip, route, window_start, count)
  VALUES (_ip, _route, _window, 1)
  ON CONFLICT (ip, route, window_start)
  DO UPDATE SET count = public.public_rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_rate_limit(text, text, timestamptz, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz, int) TO service_role;