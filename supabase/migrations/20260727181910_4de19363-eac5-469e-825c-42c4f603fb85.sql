-- 1) tournament_teams : masquer les coordonnées de contact au client (anon + authenticated)
REVOKE ALL ON public.tournament_teams FROM anon;
REVOKE ALL ON public.tournament_teams FROM authenticated;

GRANT SELECT (
  id, tournament_id, team_id, name, short_name, logo_url, seed, group_id,
  notes, created_at, payment_status, amount_paid_cents, payment_currency,
  payment_method, payment_note, paid_at, marked_paid_by
) ON public.tournament_teams TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.tournament_teams TO authenticated;
GRANT ALL ON public.tournament_teams TO service_role;

-- 2) tournament_team_players : plus d'accès public (dates de naissance / licences de mineurs)
DROP POLICY IF EXISTS "ttp_select_public" ON public.tournament_team_players;
REVOKE ALL ON public.tournament_team_players FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_team_players TO authenticated;
GRANT ALL ON public.tournament_team_players TO service_role;

-- 3) tournament_flights : les pages publiques passent par le serveur, pas besoin d'accès anon
REVOKE ALL ON public.tournament_flights FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_flights TO authenticated;
GRANT ALL ON public.tournament_flights TO service_role;

DROP POLICY IF EXISTS "flights_select_public_or_member" ON public.tournament_flights;
CREATE POLICY "flights_select_member" ON public.tournament_flights
FOR SELECT TO authenticated
USING (public.can_view_tournament(auth.uid(), tournament_id));

-- 4) club_camp_required_documents : ne plus dépendre uniquement du flag saisi par le staff
CREATE OR REPLACE FUNCTION public.club_camp_required_docs_auto_sensitive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.document_type IN ('medical','health_form','license','authorization','insurance') THEN
    NEW.is_sensitive := true;
  END IF;

  -- Filet de sécurité : un intitulé évoquant une donnée personnelle sensible
  -- force le marquage, même si le staff a oublié de cocher la case.
  IF unaccent_immutable_or_lower(NEW.title) ~ '(medic|sanitaire|sante|health|licence|license|identit|identity|passeport|passport|carte d''identite|cni|assuranc|insurance|autorisation|authorization|parental|vaccin|allerg|ordonnance|handicap|rib|iban|securite sociale|social security)'
  THEN
    NEW.is_sensitive := true;
  END IF;

  RETURN NEW;
END;
$function$;
