
## Objectif

Ajouter un mur privé du staff par équipe, sans dupliquer le moteur de publications. Une seule nouvelle valeur d'audience (`team_staff`) et une vue filtrée dans la page équipe.

## Ce qui existe et qu'on réutilise tel quel

- Table `club_publications` + `club_publication_audiences` (déjà polymorphe).
- Enum `publication_audience_type` (à étendre d'une valeur).
- Résolveur `public._resolve_audience_subjects(club_id, audiences, manual[])` (à étendre).
- `wall_posts` / `wall_comments` / `club_poll_*` / `club_publication_media` — inchangés.
- Feed `wall-feed.tsx`, composer `publications.new.tsx`, dispatch (`send-wall-emails.functions.ts`, `push-dispatch-wall.server.ts`) — étendus, pas dupliqués.
- Helpers RLS existants : `is_club_staff`, `is_club_admin`, `team_members`, `is_assignable_staff`.

## Backend (une seule migration)

1. `ALTER TYPE publication_audience_type ADD VALUE 'team_staff';`
2. Colonne `team_id uuid` déjà présente sur `club_publication_audiences` (utilisée par `joueurs_equipe`). Aucune modif de schéma nécessaire.
3. Nouveau helper SECURITY DEFINER `public.is_team_staff(_team_id uuid, _user_id uuid) returns boolean` :
   - `true` si l'utilisateur est dans `team_members` avec un rôle staff (coach, assistant_coach, dirigeant, admin),
   - OU s'il est admin/dirigeant du club propriétaire de l'équipe,
   - `STABLE`, `search_path = public`, `REVOKE FROM PUBLIC/anon`, `GRANT EXECUTE TO authenticated, service_role`.
4. Extension de `_resolve_audience_subjects` : quand `audience_type = 'team_staff'` avec `team_id`, retourner les `user_id` de tous les membres du staff de cette équipe + admins du club. Réutilise la même colonne `subjects` (users), pas de nouveau canal.
5. RLS `wall_posts` — ajouter une clause `PERMISSIVE` SELECT :
   `EXISTS (SELECT 1 FROM club_publication_audiences a WHERE a.publication_id = wall_posts.publication_id AND a.audience_type = 'team_staff' AND public.is_team_staff(a.team_id, auth.uid()))`.
   Idem pour `wall_comments`, `club_poll_options`, `club_poll_votes`, `club_publication_media` — chacun via la publication liée. Les RESTRICTIVE existants ne changent pas (défense en profondeur : la base permissive doit couvrir *tous* les chemins — checklist `docs/security/rls-policy-checklist.md` §3).
6. Notifications : dispatch email/push (`send-wall-emails` + `push-dispatch-wall`) lit déjà les `subjects` retournés par le résolveur → aucune modif métier, uniquement s'assurer que la nouvelle valeur d'enum est acceptée dans les Zod côté serveur.

## Tests RLS (obligatoires, cf. checklist §3)

Nouveau fichier `tests/rls/wall.team-staff-audience.rls.ts` :

- coach équipe A voit publication `team_staff` équipe A ✅
- coach équipe B ne voit pas publication `team_staff` équipe A ✅
- admin club A voit toutes les publications `team_staff` du club ✅
- joueur équipe A ne voit pas la publication `team_staff` équipe A ✅
- parent lié à joueur équipe A ne voit pas la publication ✅
- anonyme / autre club → refusés ✅
- coach A peut commenter, réagir, voter le sondage ; joueur A → refusé
- appel direct `_resolve_audience_subjects` par un authentifié non-staff → cohérence (SECURITY DEFINER, mais lecture seule via `is_team_staff`)

## Frontend

### 1. Composer (`src/routes/_authenticated/publications.new.tsx`)

- Étendre `Audience` union : `| { audience_type: "team_staff"; team_id: string }`.
- Nouvelle section « Staff d'une équipe » dans le sélecteur d'audience, sous « Équipes », avec la même liste d'équipes (checkbox unique par équipe).
- Réutiliser le rendu chip existant.
- Aucune modif du reste du flow (draft → publish → dispatch).

### 2. Zod côté serveur (`src/lib/publications/publications.functions.ts`)

- Ajouter au `discriminatedUnion` : `z.object({ audience_type: z.literal("team_staff"), team_id: z.string().uuid() })`.

### 3. Nouvel onglet Staff dans la page équipe

Fichier : `src/routes/_authenticated/teams/$teamId.tsx` (ou son layout de tabs). Ajouter l'onglet « Staff » à côté de Mur/Calendrier/Joueurs/Documents.

- Gate d'affichage de l'onglet : n'apparaît que si `is_team_staff(teamId, currentUser)` côté client (via un flag déjà chargé pour le membre ou un petit RPC `has_team_staff_access(team_id)`). RLS reste le vrai gate.
- Le contenu réutilise `<WallFeed />` avec un filtre :
  - nouvelle prop `filter={{ kind: "team_staff", teamId }}`
  - le fetch existant de `wall-feed` accepte déjà un filtre par audience — on ajoute la branche.
- Bouton **Publier** dans cet onglet : ouvre le composer existant en mode pré-rempli et **verrouillé** : audience forcée `{ audience_type: "team_staff", team_id }`, sélecteur d'audience masqué.

### 4. Feed club (`wall-feed.tsx`)

- Aucune modif du filtre par défaut : les publications `team_staff` remontent dans le feed club uniquement pour les utilisateurs qui les voient déjà via RLS (staff équipe + admin club). Un petit badge visuel « Staff · U13 » sur la carte pour distinguer.

## Fichiers touchés

Backend :
- `supabase/migrations/<new>_team_staff_audience.sql` (enum + helper + extension résolveur + policies RLS)
- `tests/rls/wall.team-staff-audience.rls.ts` (nouveau)

Frontend :
- `src/lib/publications/publications.functions.ts` (Zod)
- `src/routes/_authenticated/publications.new.tsx` (audience)
- `src/routes/_authenticated/teams/$teamId.tsx` (onglet Staff)
- `src/components/wall-feed.tsx` (filtre + badge)
- `src/locales/*/publications.json` (libellé `audience.types.team_staff`, badge)

## Hors périmètre

- Aucun nouveau moteur, table, worker, ou schéma de notification.
- Aucune migration de données : les groupes manuels existants ne sont pas touchés.
- Pas de refonte du composer (juste une audience de plus).

## Critères d'acceptation (mapping)

- Une publi Staff U13 créée depuis le club → onglet Staff U13 : identiques (même `publication_id`).
- Publi créée depuis Staff U13 → visible dans le mur club pour staff/admins uniquement.
- Une seule ligne `club_publications` par publication (vérifié en RLS tests).
- Commentaires/réactions/sondages partagés (tables uniques, `publication_id` FK).
- Joueurs/parents ne voient jamais `team_staff` (RLS tests dédiés).
- Coaches équipe B ne voient pas `team_staff` équipe A (RLS test).
- Admin club voit tous les Staff (RLS test).
- Aucun groupe manuel requis (résolveur calcule automatiquement).
