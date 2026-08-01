-- Accès plateforme d'un mineur : attestation et trace rendues inévitables.
--
-- État corrigé ici :
--   1. La policy `players_parent_media_update` accorde l'UPDATE sur TOUTE la
--      ligne `players` malgré son nom. Un parent lié pouvait donc écrire
--      directement `child_platform_access = true` via PostgREST. Le trigger
--      existant le laissait passer — il est bien le parent — mais l'attestation
--      n'existe que dans l'entrée de la server fn : elle n'atteignait jamais la
--      base. Accès activé, aucune attestation, aucune trace.
--   2. Côté server fn, l'insertion dans `user_consents` n'était ni vérifiée ni
--      bloquante : un échec d'écriture renvoyait quand même un succès. Pour un
--      contrôle dont l'objet est de produire une trace auditable, c'est le
--      défaut de fond — on pouvait rapporter un consentement jamais enregistré.
--
-- Principe retenu : un seul chemin d'écriture, la RPC ci-dessous, qui écrit le
-- drapeau ET le consentement dans la même transaction. Tout autre chemin est
-- refusé par le trigger via un jeton de session transactionnel — le motif déjà
-- retenu dans `docs/specs/offre-equipe-lot-0-bis.md` (§1.1) pour le même besoin.
--
-- Pourquoi pas un REVOKE de privilège de colonne : `authenticated` détient
-- l'UPDATE au niveau table, qui couvre toutes les colonnes. Le retirer
-- imposerait de ré-accorder colonne par colonne, et toute colonne ajoutée plus
-- tard deviendrait silencieusement non modifiable. Le jeton de session ne
-- souffre pas de cette dérive.

-- 1. Le trigger exige désormais le passage par la RPC, en plus du lien parental.
CREATE OR REPLACE FUNCTION public.enforce_child_access_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Les flux service_role (auth.uid() IS NULL) restent permis : imports,
  -- purges et migrations n'ont pas de session applicative.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.child_platform_access IS DISTINCT FROM OLD.child_platform_access THEN
    IF coalesce(current_setting('clubero.child_access', true), '') <> 'on' THEN
      RAISE EXCEPTION 'use_rpc_required'
        USING HINT = 'Use set_child_platform_access() so the parental consent is recorded.';
    END IF;

    -- Défense en profondeur : même par la RPC, l'activation reste réservée au
    -- représentant légal. La désactivation reste ouverte (action protectrice).
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

-- 2. Chemin unique : drapeau + trace, ou rien.
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
    -- L'attestation est vérifiée ICI, donc côté base : c'est ce qui la rend
    -- incontournable, quel que soit le client.
    IF _attestation IS NOT TRUE THEN
      RAISE EXCEPTION 'attestation_required';
    END IF;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'parent_required';
    END IF;
  ELSE
    -- Désactiver protège l'enfant : le staff du club le peut aussi.
    IF NOT (v_is_parent OR public.is_club_staff(auth.uid(), v_club)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Version du document au moment du consentement. On prend la version la plus
  -- récente, en préférant la langue de l'utilisateur quand elle est fournie —
  -- sans quoi la trace pointait vers une locale arbitraire parmi les sept.
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
    -- Fail-closed : sans document de référence, il n'y a pas de consentement
    -- opposable. On refuse plutôt que d'accorder l'accès sans trace.
    RAISE EXCEPTION 'consent_version_missing';
  END IF;

  -- Jeton transactionnel : autorise le trigger pour cette transaction seulement.
  PERFORM set_config('clubero.child_access', 'on', true);

  UPDATE public.players
  SET child_platform_access = _enabled
  WHERE id = _player_id;

  -- Même transaction que l'UPDATE : si la trace ne s'écrit pas, l'accès n'est
  -- pas accordé. C'est tout l'objet du correctif.
  INSERT INTO public.user_consents (
    user_id, version_id, kind, granted, on_behalf_of_player_id
  )
  VALUES (auth.uid(), v_version, 'parental_consent', _enabled, _player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_child_platform_access(uuid, boolean, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_child_platform_access(uuid, boolean, boolean, text) TO authenticated;
