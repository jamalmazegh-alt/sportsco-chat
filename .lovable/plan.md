
# Nouvelles pages superadmin

4 sections indépendantes ajoutées dans la nav superadmin, chacune sur sa propre route.

## 1. Batches player-invite (`/superadmin/invites`)

**Vue liste des batches** (une ligne = un envoi groupé, regroupé par `created_at` tronqué + club + initiateur, fenêtre 2 min) :
- Date, club, initiateur, template, total, ✅ envoyés, 🟡 pending, 🔴 échoués/DLQ
- Filtres : club, période, statut

**Drill-down `/superadmin/invites/$batchId`** : liste plate des destinataires du batch avec statut détaillé, erreur, bouton "relancer" (réutilise `email-retry.functions.ts` existant).

Batch ID = hash déterministe `date-tronquée + club + template`. Focus initial : `player-invite`, mais le filtre template permet `convocation-invite`, `tournament-invite`, etc.

## 2. Journal notifications (`/superadmin/notifications`)

Tabs : **Emails** | **Push**.

**Emails** : table déduplicée par `message_id` (dernière ligne). Colonnes : timestamp, template, destinataire, statut (badge coloré), club (déduit du contexte), erreur. Filtres : template (multi), statut, période, recherche destinataire, club. Pagination 50/page.

**Push** : lit `push_dispatch_log`. Colonnes : timestamp, kind (convocation/reminder/wall/etc.), targets, sent, opened, taux d'ouverture. Ajouter GRANT + policy SELECT superadmin (actuellement `no_select`).

## 3. Arborescence clubs → équipes → joueurs (`/superadmin/clubs/$clubId/roster`)

Nouvel onglet dans la page club existante.

**Structure** : accordion par équipe, chaque équipe liste les joueurs. Ligne joueur dépliable → parents.

**Colonnes joueur** : nom, catégorie FFF, email/tel, statut compte (Actif / Invité / Pas de compte), dernière connexion (via `auth.users.last_sign_in_at`), date dernière invite envoyée.

**Colonnes parent** (sous chaque joueur mineur) : nom, email, tel, statut compte, dernière connexion, date d'activation, date dernière invite.

Données via nouvelle RPC `superadmin_club_roster(_club_id)` (SECURITY DEFINER) qui joint players / teams / player_parents / profiles / auth.users / member_invites / email_send_log.

## 4. Audit trail joueur (`/superadmin/players/$playerId/audit`)

Timeline complète pour un joueur donné. Source unifiée :
- **Modifs joueur** : nouveau trigger sur `players` → écrit dans `audit_logs` (action = `player.updated`, diff avant/après en jsonb).
- **Modifs parents rattachés** : trigger sur `profiles` (nom, tel) pour les parents liés → `audit_logs` action `parent.profile_updated`.
- **Liens parent** : trigger sur `player_parents` INSERT/DELETE → `audit_logs` action `player.parent_linked` / `parent_unlinked`.
- **Événements existants** : convocations (`convocations`), feedbacks (`player_feedback`), suspensions (`player_suspensions`), disponibilités (`player_availabilities`), achievements (`player_achievements`), timeline (`player_timeline_events`) — lus directement, pas de nouveau trigger.

**UI** : timeline chrono inversé, groupée par jour, filtres par type. Chaque entrée : qui (acteur), quoi (action + diff), quand.

Accès depuis la fiche joueur superadmin via bouton "Historique complet".

## Détails techniques

**Nouvelles migrations** :
1. Triggers d'audit `players` + `profiles` (parents) + `player_parents` → écrit dans `audit_logs` avec `actor_user_id = auth.uid()`, `entity_type = 'player'`, `entity_id = player.id`, `metadata` contient le diff.
2. RPC `superadmin_club_roster(_club_id uuid)` SECURITY DEFINER — garde `has_super_admin(auth.uid())`.
3. RPC `superadmin_invite_batches(_from, _to, _template, _club_id)` — regroupement par fenêtre temporelle.
4. RPC `superadmin_player_audit(_player_id)` — union des sources ci-dessus.
5. GRANT SELECT + policy superadmin sur `push_dispatch_log` (remplace `no_select`).

**Server functions** : nouveau fichier `src/lib/superadmin/roster.functions.ts`, `invites-batches.functions.ts`, `notifications.functions.ts`, `player-audit.functions.ts` — toutes `.middleware([requireSupabaseAuth])` + garde `has_super_admin` côté RPC.

**Nav** : ajoute 3 entrées dans `src/routes/superadmin.tsx` NAV : "Invitations", "Notifications", "Rosters" (déjà accessible via clubs, mais raccourci global).

**Réutilisations** :
- Filtres et pagination : pattern existant de `email-dispatches.tsx`.
- Retry : `email-retry.functions.ts` déjà en place.
- Table déduplication : queries de référence de `email-dashboard-monitoring-guide`.

## Ordre d'exécution

1. Migration audit triggers + RPC roster + RPC batches + RPC player_audit + push policy.
2. Server functions (4 fichiers).
3. Routes UI (4 nouvelles routes + onglet roster dans club).
4. Nav update.
5. `bun run test` + `bun run check:guards`.

Livré en une passe. Aucune modif des flux d'envoi existants — lecture seule + triggers d'audit.
