-- L'activation de l'accès plateforme d'un mineur est réservée au représentant
-- légal : seul un parent lié (player_parents) peut passer
-- child_platform_access à true. Le staff peut toujours le désactiver
-- (action protectrice). Garde-fou au niveau base : la RLS de players autorise
-- le staff à modifier la ligne, ce trigger empêche spécifiquement l'activation
-- par quelqu'un d'autre qu'un parent — y compris via l'API directe.
-- Les flux service_role (auth.uid() IS NULL) restent permis.
CREATE OR REPLACE FUNCTION public.enforce_child_access_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.child_platform_access = true
     AND OLD.child_platform_access IS DISTINCT FROM true
     AND auth.uid() IS NOT NULL
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.player_parents pp
      WHERE pp.player_id = NEW.id
        AND pp.parent_user_id = auth.uid()
    ) THEN
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
