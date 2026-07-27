CREATE OR REPLACE FUNCTION public.club_camp_required_docs_auto_sensitive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  norm text;
BEGIN
  IF NEW.document_type IN ('medical','health_form','license','authorization','insurance') THEN
    NEW.is_sensitive := true;
  END IF;

  norm := lower(coalesce(NEW.title, ''));
  norm := translate(norm, 'àâäáãçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaceeeeiiiinooooouuuuyy');

  IF norm ~ '(medic|sanitaire|sante|health|licence|license|identit|identity|passeport|passport|cni|assuranc|insurance|autorisation|authorization|parental|vaccin|allerg|ordonnance|handicap|rib|iban|securite sociale|social security)'
  THEN
    NEW.is_sensitive := true;
  END IF;

  RETURN NEW;
END;
$function$;
