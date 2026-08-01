-- Docuthèque : retirer un document de la liste SANS toucher à la publication.
--
-- `delete_wall_document` faisait l'inverse de ce qu'il fallait : il amputait la
-- publication d'origine (tous ceux qui la relisent perdent la pièce jointe)
-- tout en laissant le fichier publiquement téléchargeable dans le bucket, qui
-- est public. Destructif là où il ne fallait pas, sans effet là où ça compte.
--
-- Le besoin réel est du rangement : sortir un calendrier périmé ou un doublon
-- de la docuthèque. C'est réversible et ça ne réécrit pas l'historique du mur.
--
-- ATTENTION — ce drapeau est de la CURATION, pas de la confidentialité : le
-- document reste visible et téléchargeable depuis sa publication sur le mur.
-- Pour retirer réellement un contenu, c'est la publication qu'il faut
-- supprimer (`soft_delete_entity`).

-- 1. Le chemin d'origine, destructif et trompeur, disparaît.
DROP FUNCTION IF EXISTS public.delete_wall_document(uuid, text);

-- 2. Garde commune : le post existe, et l'appelant a le droit d'y toucher.
--    Auteur du post, ou encadrement du club — même règle que le renommage.
CREATE OR REPLACE FUNCTION public.assert_can_edit_wall_attachment(_post_id uuid, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_author uuid;
BEGIN
  SELECT club_id, author_user_id INTO v_club, v_author
  FROM public.wall_posts
  WHERE id = _post_id AND deleted_at IS NULL;

  IF v_club IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  IF NOT (
    v_author = auth.uid()
    OR public.has_club_role(auth.uid(), v_club, 'admin'::app_role)
    OR public.has_club_role(auth.uid(), v_club, 'dirigeant'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Sans cette vérification, un chemin erroné produisait un succès silencieux :
  -- la base ne changeait pas, mais l'interface annonçait l'action faite.
  IF NOT EXISTS (
    SELECT 1
    FROM public.wall_posts p,
         LATERAL jsonb_array_elements(p.attachments) AS elem
    WHERE p.id = _post_id
      AND jsonb_typeof(p.attachments) = 'array'
      AND elem->>'path' = _path
  ) THEN
    RAISE EXCEPTION 'attachment_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_can_edit_wall_attachment(uuid, text) FROM public;

-- 3. Retirer / remettre un document dans la docuthèque.
CREATE OR REPLACE FUNCTION public.set_wall_document_excluded(
  _post_id uuid,
  _path text,
  _excluded boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_can_edit_wall_attachment(_post_id, _path);

  UPDATE public.wall_posts p
  SET attachments = COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'path' = _path THEN
          CASE
            WHEN _excluded THEN jsonb_set(elem, '{excludedFromLibrary}', 'true'::jsonb)
            -- Remettre en ligne retire la clé plutôt que d'écrire `false` :
            -- l'absence est l'état par défaut de toutes les pièces jointes.
            ELSE elem - 'excludedFromLibrary'
          END
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.attachments) WITH ORDINALITY AS a(elem, ord)
  ), '[]'::jsonb)
  WHERE p.id = _post_id
    AND jsonb_typeof(p.attachments) = 'array';
END;
$$;

REVOKE ALL ON FUNCTION public.set_wall_document_excluded(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_wall_document_excluded(uuid, text, boolean) TO authenticated;

-- 4. Renommage : mêmes gardes, et surtout `COALESCE` sur le résultat de
--    `jsonb_agg`. Sur un post à `attachments = '[]'`, l'agrégat renvoie NULL et
--    l'UPDATE violait la contrainte NOT NULL de la colonne — la version
--    suppression avait ce COALESCE, pas celle-ci.
CREATE OR REPLACE FUNCTION public.rename_wall_document(_post_id uuid, _path text, _label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := nullif(btrim(_label), '');
BEGIN
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'label_required';
  END IF;
  IF length(v_label) > 80 THEN
    RAISE EXCEPTION 'label_too_long';
  END IF;

  PERFORM public.assert_can_edit_wall_attachment(_post_id, _path);

  UPDATE public.wall_posts p
  SET attachments = COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'path' = _path THEN jsonb_set(elem, '{label}', to_jsonb(v_label))
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(p.attachments) WITH ORDINALITY AS a(elem, ord)
  ), '[]'::jsonb)
  WHERE p.id = _post_id
    AND jsonb_typeof(p.attachments) = 'array';
END;
$$;

REVOKE ALL ON FUNCTION public.rename_wall_document(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rename_wall_document(uuid, text, text) TO authenticated;
