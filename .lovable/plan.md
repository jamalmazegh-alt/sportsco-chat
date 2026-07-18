# Groupes du club & Besoins événementiels (« Coups de main »)

Fonctionnalité multisports en 2 lots. Lot 1 ne démarre qu'après Lot 0 vert.

## Audit préalable (avant migration)

Rapporter avant tout code :
- Tables existantes exploitables : `club_members` (rôles), `teams` / `team_members`, `players` / `player_parents`, `convocations`, helpers RLS (`has_club_role`, `is_club_staff`, `is_team_coach`), audience du mur (`user_in_wall_post_audience`), infra e-mail (`email_dispatches`, `email_send_log`, queue).
- Seuil d'âge push/mail réutilisé (même règle que mur).
- Aucun sport-lock côté moteur.

## LOT 0 — Groupes & resolver d'audience

### Schéma (migration unique)
- `club_groups` : `id, club_id, name, description, is_active, created_by, created_at, updated_at`.
- `club_group_members` : `id, group_id, member_id (→ club_members.id), added_by, created_at`, UNIQUE(group_id, member_id).
- GRANTs authenticated + service_role. RLS : lecture ET écriture réservées au staff du club (`is_club_staff(club_id)`). Aucun accès membre, aucun accès anon.

### Resolver — `public.resolve_audience_members(_club_id uuid, _spec jsonb) returns setof uuid`
`_spec` = tableau de sélecteurs, chacun typé :
- `{type:'convoked_players', event_id}` / `{type:'convoked_parents', event_id}`
- `{type:'team_players'|'team_parents'|'team_educators', team_id}`
- `{type:'category_educators', category}` — via `teams.category`
- `{type:'club_educators'|'club_staff'|'club_members'}`
- `{type:'club_group', group_id}`
- `{type:'selected_members', member_ids:[]}`

SECURITY DEFINER, `set search_path=public`. Vérifie que chaque `team_id`/`group_id`/`event_id` appartient à `_club_id` (fuite cross-club bloquée). Retourne `user_id` uniques de membres actifs. Utilisé par les server fns Lot 1 et par un aperçu chiffré `previewAudienceCount`.

### Tests RLS Lot 0
- Staff crée/liste CODIR ; membre non-staff → 0 lignes en lecture.
- Cross-club : staff club A ne voit pas groupes club B ; resolver refuse `team_id`/`group_id` étrangers.
- Aucun système-audience persisté (assertion : pas de ligne créée quand on résout `team_players`).

## LOT 1 — Besoins événementiels

### Bibliothèque `src/lib/needs/templates.ts`
Templates par sport (football, basketball, handball, volleyball) + universels (buvette, accueil, installation, rangement, photographe, animation) + « Autre besoin » toujours proposé. Sport inconnu → universels seuls. Le moteur ne branche jamais sur `sport`.

### Schéma
- `event_needs(id, event_id FK NOT NULL, club_id, team_id, role_key, label, description, capacity int CHECK≥1, validation_mode ('auto'|'manual'), status ('draft'|'open'|'closed'|'cancelled') default 'draft', created_by, timestamps)`. Trigger cohérence event↔club/team (pattern existant).
- `event_need_audiences(id, need_id, audience_type, group_id, team_id, category, created_by, created_at)`.
- `event_need_audience_members(id, need_id, member_id)` UNIQUE.
- `event_need_publications(id, need_id, published_by, published_at, recipients_count, dispatch_id)`.
- `event_need_publication_recipients(id, publication_id, member_id)` UNIQUE(publication_id, member_id).
- `event_need_signups(id, need_id, member_id, status ('applied'|'confirmed'|'withdrawn'|'declined'), comment, decided_by, applied_at, decided_at, withdrawn_at)` UNIQUE(need_id, member_id).
- `events.needs_fully_covered boolean default false` — état pour détecter transitions.

Index sur `event_id, club_id, need_id, member_id, group_id, publication_id`.
GRANTs + RLS pour chaque table.

### RLS
- `event_needs` : staff écrit ; staff lit tout ; membre lit uniquement si `can_apply_to_event_need(need_id, auth.uid())` = true (need `open` ET présent dans un `event_need_publication_recipients` OU a un `event_need_signup`). Draft invisible membres.
- `event_need_audiences` / `event_need_audience_members` / `event_need_publications` / `event_need_publication_recipients` : staff-only (invariant 3).
- `event_need_signups` : staff du besoin voit tout ; membre voit **uniquement ses propres lignes** ; jamais les autres candidats.

### Server functions (`src/modules/needs/*.functions.ts`)
- `createNeed({event_id, ...})` → draft.
- `updateNeed`, `cancelNeed`, `closeNeed`.
- `setNeedAudiences(need_id, spec[])` (staff).
- `previewAudienceCount(need_id | event_id + spec)` → nombre unique via resolver.
- `publishNeed(need_id)` : transaction — résout audiences via resolver, crée `event_need_publications`, snapshot recipients, passe status `draft→open`, crée dispatch push+mail, retourne compteurs. Républication : même fn, autorisée si `open`, nouveau dispatch, ne touche pas signups.
- `applyToNeed(need_id, comment?)` : vérifie éligibilité + place restante ; si `auto` ET candidat majeur → `confirmed` ; sinon `applied`. Détecte mineur via `players.birth_date` / `profiles` selon pattern existant seuil d'âge.
- `withdrawSignup(need_id)` : rouvre place, notifie staff.
- `decideSignup(need_id, member_id, decision)` (staff) : confirm/decline.
- `listNeedsForMember()` : besoins où l'utilisateur est destinataire ou a candidaté.

Chaque transition qui affecte la couverture recalcule `events.needs_fully_covered` **dans la même transaction** ; si transition `false→true` ou `true→false`, enfile un dispatch staff.

### Notifications & e-mails
Réutilisation STRICTE de l'infra existante (`email_dispatches`, `sendTransactionalEmail`, queue, DLQ, `dispatch_id + recipient_id` idempotency, `provider` abstraction déjà en place). Aucun nouveau provider, aucun couplage SES/Lovable dans le code métier.

Nouveaux templates React Email dans `src/lib/email-templates/` :
- `need-published.tsx` (destinataire volontaire potentiel)
- `need-signup-confirmed.tsx` / `need-signup-declined.tsx` (volontaire)
- `need-signup-withdrawn.tsx` (staff)
- `need-event-fully-covered.tsx` (staff)
- `need-event-uncovered.tsx` (staff)

Nouveaux types de push dans `push-dispatch.functions.ts`.

Seuil d'âge : route push+mail vers parents (dédup parent multi-enfants), même helper que le mur.

Deep links : `/events/$eventId` (staff) ; `/me/needs/$needId` (membre).

### UI
- Bloc « Organisation » sur `/events/$eventId` (staff) : jauge, liste besoins, badge « Publié à HH:mm auprès de N personnes » ou « Non publié », actions par besoin (éditer, publier/republier, fermer, annuler).
- Wizard création besoin (3 étapes : besoin & consigne, destinataires avec aperçu chiffré live, mode validation + publier).
- Détail besoin staff : liste candidats/confirmés, actions confirmer/décliner, mention « Validation adulte requise » pour candidats mineurs, n° licence si présent.
- Espace membre `/me/needs` : liste + carte besoin + « Je me propose » (commentaire optionnel) + section « Mes coups de main » avec désistement.
- Admin groupes `/admin/groups` : CRUD groupes + membres.

Aucun payload membre ne joint convocations/effectifs/autres candidats — vérifié par tests.

### i18n
Namespaces `groups` et `needs` dans les 7 langues. FR + EN complets. DE/ES/IT/NL/PT = clone EN + entrée dans `TODO-i18n-pending.md`.

### Tests
- **RLS** (`tests/rls/needs.rls.ts`, `tests/rls/club-groups.rls.ts`) : isolation cross-club, staff-only groupes & publications, membre ne lit pas signups des autres, draft invisible, non-destinataire ne voit rien, membre resté après retrait d'audience conserve accès.
- **Unit** (`src/tests/unit/`) : resolver dédup, template picker par sport, transitions couverture (aucune notif si pas de flip), invariant mineur sur validation auto, publication/républication n'altère pas signups, idempotence dispatch.
- Fixtures RLS étendues : staff, joueur majeur, joueur mineur avec parent, parent, membre autre club, membre ajouté après publication, groupe CODIR seedé.
- Non-régression : `bun run test`, `bun run test:rls`, `bun run check:guards`, `bun run check:i18n`.

## Ordre d'exécution
1. Audit + rapport (schéma, helpers, seuil d'âge, infra e-mail).
2. Lot 0 : migration `club_groups*` + resolver + admin UI groupes + tests RLS Lot 0. **STOP + vert.**
3. Lot 1 : migrations besoins + server fns + templates emails + UI staff + UI membre + i18n + tests. **STOP + vert.**

Livraisons intermédiaires attendues à chaque STOP avec compteurs de tests.
