# Suppression et archivage des équipes

## 1. Migration DB (additive)

- `ALTER TABLE public.teams ADD COLUMN archived_at timestamptz;`
- Index partiel `idx_teams_archived_at ... WHERE archived_at IS NOT NULL`.
- 4 RPC `SECURITY DEFINER` sous `SET search_path = public`, réutilisant `has_club_role(_, _, 'admin')` :
  - `team_has_history(_id uuid) RETURNS boolean` — `EXISTS` sur : `events` (deleted_at IS NULL), `convocations` (via events de l'équipe), `challenges`, `training_series`, `coach_insights`, `player_feedback`, `player_suspensions`, `team_championships`, `payment_items`/`payment_assignments` (target_team_id). Exclut `team_members`. Gate `is_club_member`.
  - `delete_team_if_empty(_id uuid)` — check admin → check history → `UPDATE teams SET deleted_at = now()` (soft-delete réutilisant le mécanisme existant + purge 7 j).
  - `archive_team(_id uuid)` — admin-only, `SET archived_at = now()`.
  - `unarchive_team(_id uuid)` — admin-only, `SET archived_at = NULL`.
- Garde-fou serveur : trigger `BEFORE INSERT` sur `events` refusant l'insertion si `teams.archived_at IS NOT NULL` (message `team_archived`).
- Aucune modif de `deleted_at`, `purge_soft_deleted`, ni de la RLS `teams_admin_all`.

## 2. Filtrage `archived_at IS NULL`

Compléter `.is("deleted_at", null)` partout où les équipes sont listées pour usage courant :
- `src/routes/_authenticated/teams.tsx` (avec toggle admin `showArchived` → sinon filtré).
- `src/routes/_authenticated/home.tsx`.
- `src/routes/_authenticated/events.tsx` (sélecteur d'équipe création).
- Autres sélecteurs (`grep .from("teams")` → paiements, discipline, chat, sanctions).
- Exception : `teams/$teamId.tsx` reste accessible aux admins.

## 3. UI équipe — `teams/$teamId.tsx`

Bloc admin (à côté du crayon d'édition, ~lignes 657-666) :

- `useQuery` sur `team_has_history(teamId)` + count `team_members` (pour `deleteConfirmWithRoster`).
- 3 boutons mutuellement exclusifs (admin uniquement) :
  - `team.archived_at` → **Désarchiver** (+ badge « Archivée » dans l'en-tête).
  - sinon `!hasHistory` → **Supprimer l'équipe** (destructif).
  - sinon → **Archiver l'équipe**.
- `AlertDialog` mirror du flux joueur (lignes 1074-1091) :
  - Supprimer → `delete_team_if_empty` → toast Undo `restore_entity('team', id)` → invalidate + `navigate({ to: "/teams" })`. Catch `team_has_history` → toast `deleteBlockedHasHistory` + proposer archivage.
  - Archiver → `archive_team` → toast Undo `unarchive_team`.
  - Désarchiver → `unarchive_team` → toast `unarchived`.
- Création d'événement quand `team.archived_at != null` : bouton principal désactivé, message `cannotCreateEventArchived` + bouton secondaire **Désarchiver pour ajouter un événement** (`unarchiveToAddEvent`) qui appelle `unarchive_team` puis ouvre directement le formulaire.

## 4. UI liste `teams.tsx`

- Toggle admin **Afficher les équipes archivées** (off par défaut).
- Badge « Archivée » sur chaque ligne archivée.
- Quand affichées, grouper par `season` (en-tête `seasonGroupLabel`, groupe « — » si null).
- Non-admins : ne voient jamais le toggle ni les archivées.

## 5. i18n (7 langues : fr, en, es, de, it, nl, pt)

Ajouter dans le namespace `teams` :
`delete`, `deleteTitle`, `deleteConfirm`, `deleteConfirmWithRoster`, `deleted`, `deleteBlockedHasHistory`, `archive`, `archiveTitle`, `archiveConfirm`, `archived`, `unarchive`, `unarchived`, `unarchiveToAddEvent`, `showArchived`, `badgeArchived`, `seasonGroupLabel`, `cannotCreateEventArchived`.
Réutiliser `common.cancel`, `common.undo`, `common.delete`. `bun run check:i18n` doit passer.

## 6. Tests (`bun run test`)

- Ajouter un test unitaire pour le filtre équipes (helper) si un helper est extrait.
- Vérifier RLS/RPC via `tests/rls/teams.rls.ts` : admin peut delete/archive, non-admin `Forbidden`, `team_has_history` bloque delete.

## 7. Non-négociable

- Toutes les mutations passent par RPC (pas de `.update({archived_at})` client).
- Migration purement additive.
- Aucune string en dur.

## Séquencement d'exécution

1. Créer la migration (schema + RPC + trigger events).
2. Ajouter les i18n clés (7 langues).
3. Mettre à jour `teams.tsx` + `teams/$teamId.tsx`.
4. Compléter les filtres `archived_at IS NULL` (home, events, sélecteurs).
5. Lancer `bun run test` + `bun run check:i18n`.

## Points hors périmètre (notés pour plus tard)

- Table `seasons` normalisée + FK.
- Détachement automatique des joueurs à l'archivage.
