-- Fix: ne pas écraser l'email d'invitation lors de l'acceptation
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_invite public.tournament_collaborators%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_invite FROM public.tournament_collaborators
   WHERE invitation_token = _token AND revoked_at IS NULL LIMIT 1;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or revoked invitation'; END IF;
  IF v_invite.accepted_at IS NOT NULL AND v_invite.user_id IS NOT NULL AND v_invite.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Invitation already accepted by another user';
  END IF;
  -- N'écrase PAS l'email cible de l'invitation (source de vérité pour l'organisateur).
  UPDATE public.tournament_collaborators
     SET user_id = v_user_id,
         accepted_at = COALESCE(accepted_at, now())
   WHERE id = v_invite.id;
  RETURN jsonb_build_object('tournament_id', v_invite.tournament_id, 'role', v_invite.role);
END;
$function$;

-- Restaurer la ligne Mr COLINA : remettre l'email invité, retirer le faux user_id/accepted_at
UPDATE public.tournament_collaborators
   SET email = 'gcolina2@yopmail.com',
       user_id = NULL,
       accepted_at = NULL
 WHERE id = 'c896bae3-674d-4103-b7c9-377698c9b5c5';