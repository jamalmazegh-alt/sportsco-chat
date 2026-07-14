# Observabilité bêta — Dashboard superadmin

Objectif : voir en un coup d'œil (1) ce que font les clubs/utilisateurs et (2) ce qui échoue ou bloque. Hors périmètre : croissance, conversion, rétention, health scores.

## Principes

- **Un journal produit unifié** alimenté au fil de l'eau (`product_activity_log`), plutôt qu'agréger 10 tables à chaque chargement.
- Ne pas toucher aux systèmes existants : `superadmin_audit_logs` (sécurité) reste séparé, `audit_logs` (diff entités) n'est pas réutilisé, `/superadmin/logs` reste le journal sécurité.
- Écriture **fire-and-forget** côté serveur uniquement — une trace ratée ne casse jamais l'action métier.
- **Assainissement obligatoire** des messages d'erreur avant stockage (les réponses Meta/Graph peuvent contenir `access_token=…`, les imports peuvent contenir des e-mails).

## Étape 0 — Socle

Migration :
- Table `public.product_activity_log` (club_id, actor_user_id, actor_role, category, action_type, resource_type, resource_id, status ∈ success/warning/failure, error_code, metadata jsonb, created_at).
- Index sur `(club_id, created_at desc)`, `(category, created_at desc)`, `(status, created_at desc) where status <> 'success'`, `(action_type, created_at desc)`, `(actor_user_id, created_at desc)`.
- RLS : SELECT réservé `has_super_admin(auth.uid())`. Aucune policy INSERT/UPDATE/DELETE → seul `service_role` écrit. Insertion seule (pas d'update/delete côté app).
- GRANT SELECT à `authenticated`, ALL à `service_role`.

Code (`src/lib/observability/`) :
- Enum TS des `action_type` (`event.created`, `convocation.sent`, `social.sync_failed`, `import.failed`, …) et `category`.
- Helper `logActivity(supabaseAdmin, {...})` server-only, typé, try/catch silencieux.
- Fonction `redactErrorMessage(raw)` : masque `access_token=…`, `client_secret=…`, tokens Bearer, e-mails, tronque à N chars.

## Étape 1 — Instrumentation prioritaire

Câbler `logActivity` (fire-and-forget, dans les server fns existants) sur :
- **Events** : create / update / cancel.
- **Convocations** : send / respond.
- **Social** : connect / disconnect + sync success/fail (dans `src/lib/social/sync.server.ts` et le callback OAuth).
- **Imports** : lifecycle dans `import.functions.ts` (success/partial/failed avec `error_code`).
- **Invites** : `club_invites` / `member_invites` sent + accepted.

Aucune modification de logique métier — uniquement l'appel au helper après l'action.

## Étape 2 — Fil d'activité produit

- RPC `superadmin_product_activity({ club_id?, category?, status?, actor?, from?, to?, cursor, limit })` — pagination curseur `(created_at, id)`, join club + profil acteur.
- Composant `ProductActivityFeed` (date, club, acteur+rôle, action, badge statut, lien ressource).
- Filtres serveur : club, catégorie, statut, période, utilisateur.
- Nouvelle section « Activité & à surveiller » dans `src/routes/superadmin/index.tsx` (au-dessus de RGPD, sous Support). Sections Finance/Ops inchangées.

## Étape 3 — Liste des clubs enrichie

- RPC `superadmin_club_activity_summary({ cursor, limit })` : par club — `last_activity_at`, `last_action_type`, `count_7d`, `count_30d`, `last_sign_in_at` (via `auth.users`).
- Modif `src/routes/superadmin/clubs.index.tsx` : colonnes dernière activité, type, counts 7j/30j, dernière connexion, badge « inactif » (> 14j).
- Clic sur un club → historique filtré (réutilise le feed avec `club_id`).
- Backfill one-shot optionnel : première `last_activity_at` = `max(updated_at)` des tables clés. Sinon la colonne se remplit progressivement (acceptable pour la bêta).

## Étape 4 — Panneau « À surveiller »

`WatchlistPanel` sur le dashboard, sous-cartes :
- **Synchros sociales KO** : RPC `superadmin_watchlist_social_failures()` → `club_social_connections` où `last_sync_error is not null`. Affiche message assaini.
- **Imports échoués/partiels** : RPC `superadmin_watchlist_failed_imports()` → `superadmin_imports` où `status in ('failed','partial')`, extrait `error_log` assaini.
- **Onboardings bloqués** : RPC `superadmin_watchlist_stalled_onboarding()` — club sans équipe / équipe sans joueur / joueurs sans event / event sans convocation / invites non acceptées après N jours. **À la demande uniquement**, pagination bornée. Vue matérialisée si trop lourde en pratique.
- **Tickets support ouverts** : réutilise `getSupportStats()`.
- **Paiements en échec** : réutilise `past_due` de `getFinanceOverview()`.

## Hors périmètre première livraison

Étape 5 (plus tard) : fiche club détaillée (`ClubActivityView` dans `clubs.$clubId.tsx`), instrumentation stages/tournois/mur, rétention/partition.

## Risques

- **Fuite de secrets** (risque n°1) : passer chaque message d'erreur par `redactErrorMessage` avant `logActivity`, ne jamais mettre de token/secret dans `metadata`. Ré-assainir à l'affichage par sécurité.
- **Performance** : index posés dès l'étape 0, pagination curseur partout, watchlist onboarding à la demande.
- **Rétention** : à traiter en étape 5 (purge 90-180j ou partition mensuelle).

## Tests

- Unit : `logActivity` ne throw jamais, `redactErrorMessage` masque `access_token=…` et e-mails.
- RLS (`tests/rls/product-activity.rls.ts`) : superadmin lit, membre de club refusé, insertion client refusée.
- Intégration : une convocation envoyée crée bien la ligne ; sync sociale KO → `status='failure'` + `error_code` sans secret.
- UI : filtres feed, états vides, badge « inactif », colonnes clubs.

## Fichiers touchés

Nouveaux : migration, `src/lib/observability/{log-activity.server.ts, redact.ts, action-types.ts}`, `src/lib/superadmin/product-activity.functions.ts`, `src/components/superadmin/{ProductActivityFeed.tsx, WatchlistPanel.tsx}`, tests unit + RLS.
Modifiés : `src/routes/superadmin/index.tsx`, `src/routes/superadmin/clubs.index.tsx`, server fns events/convocations/imports/invites, `src/lib/social/sync.server.ts`, `src/routes/api/public/social/callback.ts`.
Non touchés : `/superadmin/logs`, `superadmin_audit_logs`, `audit_logs`, sections Finance/Ops du dashboard.
