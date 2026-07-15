-- Lot B — RPC unifiée d'écriture de la config de visibilité (staff-gated)
--
-- Miroir strict de get_call_up_visibility_config : même bloc de garde par
-- scope, même dérivation du club_id (jamais depuis un paramètre entrant),
-- même messages d'erreur. Ferme le trou d'un .update() client direct sur
-- events/teams/clubs qui s'appuyait sur les policies UPDATE génériques.
--
-- Mapping UI → colonne (identique côté TS, cf. src/hooks/use-call-up-visibility.ts) :
--   'inherit' → NULL   (interdit pour scope='club')
--   'visible' → TRUE
--   'masked'  → FALSE

CREATE OR REPLACE FUNCTION public.set_call_up_visibility(
  _scope text,
  _id uuid,
  _choice text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _team_id uuid;
  _club_id uuid;
  _value_nullable boolean;
  _value_strict boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF _scope NOT IN ('event', 'team', 'club') THEN
    RAISE EXCEPTION 'invalid scope: %', _scope USING ERRCODE = '22023';
  END IF;

  IF _choice NOT IN ('inherit', 'visible', 'masked') THEN
    RAISE EXCEPTION 'invalid choice: %', _choice USING ERRCODE = '22023';
  END IF;

  -- Résolution du (team_id, club_id) et garde staff — copie exacte du bloc
  -- de get_call_up_visibility_config. Aucune divergence n'est tolérée : si
  -- la lecture change, l'écriture doit changer en même temps.
  IF _scope = 'event' THEN
    SELECT e.team_id, t.club_id INTO _team_id, _club_id
    FROM public.events e
    JOIN public.teams t ON t.id = e.team_id
    WHERE e.id = _id;

    IF _team_id IS NULL THEN
      RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_team_staff_of_event(_id, _uid) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    _value_nullable := CASE _choice
      WHEN 'inherit' THEN NULL
      WHEN 'visible' THEN TRUE
      ELSE FALSE
    END;

    UPDATE public.events
    SET show_called_up_players_override = _value_nullable
    WHERE id = _id;

  ELSIF _scope = 'team' THEN
    SELECT t.club_id INTO _club_id
    FROM public.teams t
    WHERE t.id = _id;

    IF _club_id IS NULL THEN
      RAISE EXCEPTION 'team not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (
      public.is_team_coach(_uid, _id)
      OR public.has_club_role(_uid, _club_id, 'admin'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    _value_nullable := CASE _choice
      WHEN 'inherit' THEN NULL
      WHEN 'visible' THEN TRUE
      ELSE FALSE
    END;

    UPDATE public.teams
    SET show_called_up_players_override = _value_nullable
    WHERE id = _id;

  ELSE -- 'club' : racine de la cascade, colonne NOT NULL, pas d'inherit
    IF _choice = 'inherit' THEN
      RAISE EXCEPTION 'club scope has no inherit option' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _id) THEN
      RAISE EXCEPTION 'club not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_club_staff(_uid, _id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    _value_strict := (_choice = 'visible');

    UPDATE public.clubs
    SET show_called_up_players_default = _value_strict
    WHERE id = _id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_call_up_visibility(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_call_up_visibility(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_call_up_visibility(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_call_up_visibility(text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.set_call_up_visibility(text, uuid, text) IS
  'Lot B — RPC unifiée d''écriture de la config de visibilité. Miroir strict du bloc de garde de get_call_up_visibility_config. Seul chemin d''écriture autorisé depuis le client ; toute mutation directe des colonnes show_called_up_players_* via .update() PostgREST est un bug — les policies UPDATE de events/teams/clubs ne gèrent pas le gating colonne.';