## Mur Staff d'équipe — Plan

### Concept

Un mur privé du staff par équipe (coachs, assistants, dirigeants, admins), réutilisant le moteur `wall_posts` avec un nouveau type d'audience `team_staff`. Pas de duplication de code : mêmes tables, mêmes composants, filtrés côté RLS + UI.

### 1. Backend — nouvelle migration

**Extension du schéma `wall_posts`**

- `wall_posts_audience_type_check` : ajouter `'team_staff'` aux valeurs autorisées.
- `wall_posts_audience_shape_check` : ajouter branche `team_staff` (exige `audience_team_ids` cardinality = 1, `audience_group_ids` null).

**Nouveau helper SQL**

```sql
public.is_team_staff(_team_id uuid, _user_id uuid) returns boolean
-- true si :
--   * user est membre team_members de _team_id avec role IN ('coach','assistant_coach','dirigeant'), OU
--   * user a role club admin/dirigeant du club de _team_id
```

`SECURITY DEFINER`, `STABLE`, `search_path=public`.

**RLS**

- `wall_posts_select` : ajouter branche `(audience_type = 'team_staff' AND is_team_staff(audience_team_ids[1], auth.uid()))`.
- `wall_posts_insert` : ajouter branche parallèle sur WITH CHECK (auteur doit être staff de l'équipe cible).
- `wall_comments_select` déjà safe (subquery sur wall_posts hérite de la RLS parent).

### 2. Dispatch (push + email)

Étendre `src/lib/push-dispatch-wall.server.ts` et `src/lib/wall/send-wall-emails.functions.ts` :

- Nouvelle branche `audienceType === 'team_staff'` :
  - Récupère les `team_members` de l'équipe avec role ≠ 'player'
  - Ajoute admins/dirigeants du club
  - **Pas de routage mineur** (staff sont adultes par définition)
  - Tag push : `wall-team-staff-<teamId>`

### 3. Frontend

**Nouveau prop `WallFeed`**

- `staffTeamId?: string`
- Quand fourni :
  - Query filtrée : `.eq("audience_type","team_staff").contains("audience_team_ids",[staffTeamId])`
  - Composer verrouillé sur `audience_type='team_staff', audience_team_ids=[staffTeamId]`
  - AudiencePicker masqué (audience implicite)
  - Nouveau badge "Staff équipe" (couleur distincte, ex. slate/violet)

**Team page (`src/routes/_authenticated/teams/$teamId.tsx`)**

- Nouvelle section repliable « Mur Staff » sous `TeamChampionshipsSection`, gated par : `isTeamStaff(teamId, userId)` côté client (utilise `has_team_role` ou dérive depuis `team_members` + rôles club chargés).
- Rendered comme un bloc dédié (pas de refactor en tabs — cohérent avec le layout scroll existant).

### 4. Tests

- Unit : parse guard sur audience shape (composer refuse audiences invalides).
- RLS (`tests/rls/team-staff-wall.rls.ts`) :
  - Coach équipe A peut lire/écrire post `team_staff` équipe A
  - Player équipe A NE peut PAS lire post `team_staff` équipe A
  - Parent équipe A NE peut PAS lire
  - Coach équipe B NE peut PAS lire
  - Admin club voit tout
  - Insert par non-staff → refusé

### Fichiers touchés

- `supabase/migrations/20260724230000_team_staff_wall.sql` (nouveau)
- `src/lib/push-dispatch-wall.server.ts`
- `src/lib/wall/send-wall-emails.functions.ts`
- `src/components/wall-feed.tsx` (prop `staffTeamId`, filtre query, composer verrouillé, badge)
- `src/routes/_authenticated/teams/$teamId.tsx` (nouvelle section)
- `tests/rls/team-staff-wall.rls.ts` (nouveau)
- i18n : clés `wall.staff.*` (fr + 6 langues)

### Hors périmètre

- Onglets réels sur team page (refacto trop lourd, cohérence avec pattern actuel « scroll + sections »).
- Extension du système `club_publications` (sondages) à `team_staff` — pourra être fait en Lot 2 si demandé.
