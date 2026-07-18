# Checklist RLS — leçons de la matinée du 16/07

Ce doc capture les règles apprises à froid après une cascade de cinq bugs
de sécurité tous nés du même geste : une policy modifiée en essai-erreur,
un `OR` permissif oublié, une suite de tests verte qui prouvait le mauvais
cas.

## §3 — Rédiger / modifier une policy SELECT

Avant de merger une migration qui touche une policy `SELECT` :

1. **Diff des policies SELECT avant/après.**
   C'est là qu'un `OR` permissif oublié neutralise tout le reste. Colle le
   `USING` complet des deux côtés, pas juste le nom de la policy.

2. **Une `RESTRICTIVE` seule ne suffit jamais.**
   Il lui faut une `PERMISSIVE` de base qui accorde, sinon elle bloque
   tout. C'est le bug de 8h30 : le gate restrictif filtrait correctement,
   mais aucune base permissive ne donnait l'accès au staff hors gate.
   → Toute nouvelle `RESTRICTIVE` doit être introduite en même temps que
   la `PERMISSIVE` de base, dans la même migration.

3. **La base permissive doit couvrir _tous_ les chemins d'accès légitimes.**
   Pas juste le plus évident (équipe / club). Sur `convocations` la base
   avait `can_view_team` mais oubliait `self` et `parent-lié` — le
   parent-pur passait uniquement par le gate restrictif, qui ne peut pas
   accorder d'accès. Enumère explicitement : équipe, self, parent, invité,
   staff.

4. **Modifier une fonction d'accès partagée a un rayon.**
   Resserrer `can_view_team` a cassé `teams`, `carpools*`, `event_goals`
   à trois surfaces de distance. Avant de durcir une fonction utilisée en
   base de policy :
   - `rg <fn_name>` sur les migrations pour lister tous les consommateurs
   - décide policy par policy si le resserrement est voulu ou s'il faut un
     fallback local (voir `has_convocation_in_team`)
   - ajoute un test négatif _et_ positif pour chaque policy touchée avant
     de merger

## Durcissement d'une nouvelle fonction `SECURITY DEFINER`

Systématique, sans exception :

- `LANGUAGE sql|plpgsql STABLE SECURITY DEFINER SET search_path = public`
- `REVOKE EXECUTE ... FROM PUBLIC;`
- `REVOKE EXECUTE ... FROM anon;` (sauf si sciemment public via token)
- `GRANT EXECUTE ... TO authenticated;` (scope minimum)
- Si la fonction prend un `_team_id` / `_club_id` / `_event_id` en
  paramètre, elle doit **dériver la relation** par jointure sur la table
  parente (`events.team_id = _team_id`), jamais faire confiance à un
  champ dénormalisé qui pourrait diverger.

## Tests RLS — deux cas séparés, pas un seul

Pour chaque policy qui accorde l'accès à un rôle "invité" (non-membre) :

- **Isolation entre membres** : membre du club A ne voit pas les données
  du club B.
- **Exclusion des non-membres** : un authentifié sans lien (autre club,
  ou parent non-lié) ne voit rien, _même sur ressource visible=true_.

Ce sont deux cas distincts. Un seul des deux passe souvent en vert sans
prouver la fermeture. Les deux tests sont obligatoires sur chaque policy
modifiée.

## Post-mortem — RPC directe sur `SECURITY DEFINER`

Toute fonction `SECURITY DEFINER` exposée en RPC (GRANT EXECUTE à
`authenticated`) **est elle-même une policy**. La RLS des tables qu'elle
lit ne la protège pas (le definer bypasse), et une garde applicative
placée dans la server function TypeScript ne suffit pas : PostgREST
permet d'appeler la RPC directement depuis un client authentifié.

Règle systématique pour chaque definer accessible à `authenticated` :

- **Garde d'appelant interne** en **première instruction** de la fonction,
  utilisant `auth.uid()` + un helper de rôle (`is_club_staff`,
  `is_club_member`, `has_role`, …) et acceptant `service_role` via
  `coalesce(auth.jwt()->>'role','') = 'service_role'` si le chemin serveur
  privilégié doit rester ouvert.
- **Refus SILENCIEUX** (`RETURN;` sans ligne, ou `RETURN NULL`) : ne pas
  distinguer « interdit » de « vide », sinon la fonction devient un oracle
  d'énumération.
- **Test par appel RPC direct** (`supabase.rpc(...)`) pour chaque rôle
  non autorisé — pas seulement pour le rôle attendu. Les tests via table
  passent à côté de la surface : c'est la classe de test à ajouter.
- **Volatilité** : si la fonction alloue de l'état local mutable
  (tableaux plpgsql, TEMP TABLE), la marquer `VOLATILE` — un appel en
  transaction read-only peut échouer sur un `STABLE` mal étiqueté.
