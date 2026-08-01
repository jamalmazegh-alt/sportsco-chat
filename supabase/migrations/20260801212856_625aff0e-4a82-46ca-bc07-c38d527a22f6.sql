CREATE OR REPLACE FUNCTION public.enforce_child_access_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.child_platform_access IS DISTINCT FROM OLD.child_platform_access THEN
    IF coalesce(current_setting('clubero.child_access', true), '') <> 'on' THEN
      RAISE EXCEPTION 'use_rpc_required'
        USING HINT = 'Use set_child_platform_access() so the parental consent is recorded.';
    END IF;

    IF NEW.child_platform_access = true
       AND NOT EXISTS (
         SELECT 1 FROM public.player_parents pp
         WHERE pp.player_id = NEW.id
           AND pp.parent_user_id = auth.uid()
       )
    THEN
      RAISE EXCEPTION 'parent_required'
        USING HINT = 'Only a linked parent/legal guardian can enable child platform access.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_child_access_parent_guard ON public.players;
CREATE TRIGGER players_child_access_parent_guard
BEFORE UPDATE OF child_platform_access ON public.players
FOR EACH ROW EXECUTE FUNCTION public.enforce_child_access_parent();

CREATE OR REPLACE FUNCTION public.set_child_platform_access(
  _player_id uuid,
  _enabled boolean,
  _attestation boolean DEFAULT false,
  _locale text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_is_parent boolean;
  v_version uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT club_id INTO v_club FROM public.players WHERE id = _player_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  v_is_parent := EXISTS (
    SELECT 1 FROM public.player_parents pp
    WHERE pp.player_id = _player_id AND pp.parent_user_id = auth.uid()
  );

  IF _enabled THEN
    IF _attestation IS NOT TRUE THEN
      RAISE EXCEPTION 'attestation_required';
    END IF;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'parent_required';
    END IF;
  ELSE
    IF NOT (v_is_parent OR public.is_club_staff(auth.uid(), v_club)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT id INTO v_version
  FROM public.consent_versions
  WHERE kind = 'parental_consent'
  ORDER BY
    version DESC,
    (locale = coalesce(_locale, 'fr')) DESC,
    (locale = 'fr') DESC,
    locale ASC
  LIMIT 1;

  IF v_version IS NULL THEN
    RAISE EXCEPTION 'consent_version_missing';
  END IF;

  PERFORM set_config('clubero.child_access', 'on', true);

  UPDATE public.players
  SET child_platform_access = _enabled
  WHERE id = _player_id;

  INSERT INTO public.user_consents (
    user_id, version_id, kind, granted, on_behalf_of_player_id
  )
  VALUES (auth.uid(), v_version, 'parental_consent', _enabled, _player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_child_platform_access(uuid, boolean, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_child_platform_access(uuid, boolean, boolean, text) TO authenticated;