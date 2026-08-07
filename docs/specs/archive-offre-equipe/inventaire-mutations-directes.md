# Inventaire — mutations Supabase directes depuis le client (Lot 0 bis §28.2)

> Livrable du Lot 0 bis. Objectif : classer chaque mutation utilisateur portant sur des
> données d'équipe, pour savoir laquelle doit être bloquée après la grâce et laquelle doit
> survivre en lecture seule.
>
> **C'est le point le plus risqué du chantier** : une mutation mal classée bloque soit des
> parents légitimes, soit l'annulation d'un entraînement.
>
> Relevé sur la branche `claude/clubero-equipe-prompt-review-qj3kzf`.
> **44 fichiers** contenant des mutations directes (`.insert` / `.update` / `.delete` /
> `.upsert`) hors `*.server.ts`, `*.functions.ts`, routes API et webhooks.

---

## Rappel des catégories

```text
A  — création et administration     → bloquée après la grâce
A′ — continuité et sécurité         → MAINTENUE en lecture seule
B  — réponses à un objet existant   → MAINTENUE en lecture seule
B0 — état personnel sans valeur commerciale → JAMAIS bloquée, aucun état
C  — système (webhook, cron, service role) → hors RLS utilisateur
D  — lecture                        → conservée
N  — hors périmètre équipe          → aucun changement
```

**La classification porte sur l'action, pas sur le fichier, ni sur la table, ni sur
l'écran.** `events/$eventId.tsx` contient à lui seul A, A′, B et des effets de bord.

**B0** est une sous-catégorie explicite pour empêcher qu'un développeur ultérieur
requalifie les marquages « lu » en « création de données » : `wall_post_reads`,
`notifications.read_at`, accusés de lecture équivalents. Jamais bloqués, y compris en
`locked`, sous peine de badges de non-lus qui ne redescendent jamais.

**Classification par acteur, pas par écran** — quand un même écran sert plusieurs rôles :

```text
joueur ou parent répond pour lui-même        → B
coach saisit à la place du joueur            → A
coach corrige une erreur manifeste, journalisée → A′
```

---

## 🔴 Découverte structurante — les tables d'effets de bord partagées

**C'est le résultat le plus important de cette passe, et il change la façon d'implémenter
le Lot 5.**

Deux tables sont écrites **à la fois** par des actions de catégorie A et par des actions
de catégorie A′ ou B :

| Table | Écrite par une action A | Écrite aussi par |
|---|---|---|
| `notifications` | création de publication (`wall-feed.tsx:439`), envoi de convocations (`$eventId.tsx:1121`) | **B** — commentaire (`wall-feed.tsx:1685`), réponse à convocation (`$eventId.tsx:778`) · **A′** — annulation d'événement (`$eventId.tsx:1549`) |
| `wall_posts` | publication manuelle sur le mur (`wall-feed.tsx:540`) | **A′** — annonce automatique d'annulation (`$eventId.tsx:1660`) |

**Conséquence directe : on ne peut pas ajouter `team_can_manage_content()` sur les policies
INSERT de `notifications` ni de `wall_posts`.** Le faire casserait :

- la notification qu'un parent déclenche en répondant à une convocation (B) ;
- la notification et l'annonce murale produites par l'annulation d'un événement (A′) ;
- la notification qu'un commentaire déclenche (B).

Autrement dit, **une policy posée au niveau de la table est structurellement incapable de
distinguer les catégories ici**. Le seul découpage correct est au niveau de l'action.

**Cela confirme et renforce la décision de la RPC dédiée.** `cancel_event` doit réaliser,
dans une seule opération `SECURITY DEFINER` : la mise à jour de `events`, les
`notifications`, l'annonce dans `wall_posts` et le journal d'audit. Les policies génériques
peuvent alors rester strictes sur `events`, tandis que l'annulation passe par un chemin
explicite et auditable.

Sans cette RPC, il faudrait laisser `wall_posts` INSERT ouvert pour ne pas casser
l'annulation — ce qui reviendrait à ne plus protéger la création de publications, l'une
des fonctionnalités les plus visibles de l'offre.

---

## Catégorie B — réponses, à préserver impérativement

Ce sont les mutations dont le blocage produirait le dégât fonctionnel le plus visible :
un parent qui ne peut plus signaler l'absence de son enfant pour un match qui a lieu quand
même.

| Fichier | Ligne | Table | Op | Action utilisateur |
|---|---|---|---|---|
| `src/components/declare-absence-drawer.tsx` | 377, 389 | `player_availabilities` | insert/update | Un parent ou joueur déclare une indisponibilité |
| `src/components/declare-staff-absence-drawer.tsx` | 166 | `staff_availabilities` | insert/update | Un membre du staff déclare son indisponibilité |
| `src/routes/_authenticated/profile/availabilities.tsx` | 109 | `staff_availabilities` | update | Le staff met à jour ses disponibilités depuis son profil |
| `src/components/carpool-section.tsx` | 355 | `carpool_passengers` | insert/delete | Un parent inscrit ou retire son enfant d'un covoiturage |
| `src/components/wall-feed.tsx` | 225 | `wall_post_reads` | insert | Marquage « lu » d'une publication |
| `src/components/wall-feed.tsx` | 1671 | `wall_comments` | insert | Commentaire sur une publication existante |
| `src/routes/notifications.tsx` | 78 | `notifications` | update | Marquage d'une notification comme lue |

**À compléter en priorité** : les réponses à convocation (`convocations`, colonne de
réponse) et les votes de sondage (`club_poll_votes`) apparaissent dans
`events/$eventId.tsx` et `wall-feed.tsx` mais leurs lignes exactes doivent être isolées de
leurs voisines de catégorie A. Voir « méthode de complétion » plus bas.

Cas à trancher explicitement :

- `wall_post_reads` et `notifications` (marquage lu) : techniquement des mutations, mais
  sans aucune valeur commerciale. **Recommandation : jamais bloquées, quel que soit
  l'état** — les bloquer produirait des compteurs de non-lus qui ne redescendent jamais.
- `wall_comments` : commenter est-il « répondre à un objet existant » (B) ou « créer du
  contenu » (A) ? **Recommandation : B.** Le levier commercial est la publication, pas le
  commentaire, et bloquer les commentaires casse une conversation en cours.
- `carpool_passengers` : s'inscrire à un covoiturage existant est B ; **créer** le
  covoiturage (`carpools:337`) est A. Le fichier contient les deux.

---

## Catégorie A′ — continuité et sécurité, à préserver

Un coach doit pouvoir annuler un entraînement et prévenir les familles même si la
couverture a expiré. C'est la catégorie que la revue Cursor avait identifiée comme
manquante.

Décision validée : **RPC dédiées, aucune policy permissive générique sur
`events UPDATE` en état restreint.**

| Fichier | Ligne | Fonction | Table | Catégorie |
|---|---|---|---|---|
| `events/$eventId.tsx` | 1494-1517 | `confirmCancelEvent` | `events` (+ `notifications:1549`, `wall_posts:1660`) | **A′ — à convertir en RPC `cancel_event`** |
| `events/$eventId.tsx` | 867-878 | `confirmCancelConvocation` | `convocations` delete | **A′ — à convertir en RPC `withdraw_convocation`** |
| `components/urgency-center.tsx` | 254 | — | `convocations` | A′ — traitement d'une convocation en souffrance |
| `events/$eventId/feedback.tsx` | — | — | `events` delete | À vérifier — retrait d'un retour |

`confirmCancelConvocation` porte déjà une garde base de données : l'erreur
`past_event_locked` est interceptée (`:880-882`), signe qu'un trigger protège les
événements passés. La RPC `withdraw_convocation` devra la conserver.

**Périmètre exact de `cancel_event`**, d'après la lecture du flux `confirmCancelEvent`
(`:1494` → `:1660`) : mise à jour de `events` avec le patch d'annulation, notifications
in-app aux joueurs et parents, envois best-effort (push/email), publication d'une annonce
dans `wall_posts`. Les quatre écritures doivent être dans la RPC, sinon le problème des
tables partagées (ci-dessus) resurgit.

---

## Catégorie A — création et administration

Bloquées après la grâce. Aucune ambiguïté sur ce lot.

| Fichier | Ligne | Table | Op |
|---|---|---|---|
| `src/components/import-players-csv-dialog.tsx` | — | `players`, `team_members` | insert | **Passe par la RPC atomique** (§5.3.1 de la spec) |
| `src/components/existing-player-picker.tsx` | — | `players`, `team_members` | insert/delete | Idem — consomme du quota |
| `src/routes/_authenticated/teams/$teamId.tsx` | 601, 787, 2025, 2047 | `team_members` | insert/delete/update | Gestion de l'effectif — consomme du quota |
| `src/routes/_authenticated/teams/$teamId.tsx` | 756 | `players` | insert/update | Création de joueur |
| `src/routes/_authenticated/teams/$teamId.tsx` | 471 | `teams` | update | Configuration d'équipe |
| `src/routes/_authenticated/teams.tsx` | 112 | `teams` | insert | Création d'équipe — **point d'entrée du quota Découverte** |
| `src/components/wall-feed.tsx` | 540 | `wall_posts` | insert/update/delete | Publication sur le mur |
| `src/components/staff-assignment-section.tsx` | 188, 222 | `event_staff_assignments` | insert/delete | Affectation du staff |
| `src/components/match-result-card.tsx` | 191 | `match_results` | upsert | Saisie de résultat |
| `src/components/player-suspensions.tsx` | 150 | `player_suspensions` | insert/update | Sanction |
| `src/components/quick-sanction-drawer.tsx` | — | `player_suspensions` | insert | Sanction rapide |
| `src/components/team-invite-share-button.tsx` | — | `club_invites` | insert | Génération de lien d'invitation |
| `src/routes/_authenticated/admin/users.index.tsx` | — | `member_invites` | insert | Invitation de membre |
| `src/routes/_authenticated/players/$playerId.tsx` | 488, 526 | `players` | update/delete | Fiche joueur |
| `src/routes/_authenticated/players/$playerId/achievements.tsx` | 71 | `player_achievements` | insert/update | Palmarès |
| `src/routes/_authenticated/players/$playerId/seasons.tsx` | 168 | `player_seasons` | insert/update | Saisons |
| `src/routes/_authenticated/players/$playerId/availability.tsx` | 119 | `player_availabilities` | update | **À vérifier** : édition par le coach (A) ou saisie par le joueur (B) ? |
| `src/routes/_authenticated/follow-ups.tsx` | — | `reminders`, `notifications` | insert/delete | Relances |
| `src/components/event-chat.tsx` | — | `event_messages` | insert | **À trancher** : messagerie d'événement, A ou B ? |

### Détail complet de `events/$eventId.tsx` (lecture intégrale)

| Ligne | Fonction | Table | Catégorie | Justification |
|---|---|---|---|---|
| 804-805 | `submitResponse` | `convocations` update | **B** | Réponse à une convocation |
| 778 | (effet de bord de la réponse) | `notifications` insert | **effet de bord de B** | Ne doit jamais être gaté |
| 867-878 | `confirmCancelConvocation` | `convocations` delete | **A′** | Retrait d'une convocation |
| 1077-1078 | envoi de convocations | `convocations` insert | **A** | Nouvelle convocation |
| 1121, 1437 | effets de bord de l'envoi | `notifications` insert | effet de bord de A | — |
| 1339, 1354 | suite de l'envoi | `events` update | **A** | Écriture de suivi : `convocations_sent`, `convocation_sent_snapshot`, passage `draft → published` |
| 1398 | rappels | `reminders` | **A** | Programmation de rappels |
| 1488-1489 | `toggleLock` | `events` update `responses_locked` | **A** | Verrouillage des réponses |
| 1494-1517 | `confirmCancelEvent` | `events` update | **A′** | Annulation |
| 1549 | effet de bord de l'annulation | `notifications` insert | **effet de bord de A′** | Doit survivre |
| 1660 | effet de bord de l'annulation | `wall_posts` insert | **effet de bord de A′** | Doit survivre — table par ailleurs A |
| 1698-1730 | `confirmReschedule` | `events` update | **A** | Reprogrammation : horaire, lieu |
| 1762, 1872 | effets de bord de la reprogrammation | `notifications`, `wall_posts` insert | effets de bord de A | — |
| 2134 | renvoi de convocations | `events` update | **A** | Écriture de suivi du renvoi |
| 4525-4526 | bascule covoiturage | `events` update `carpool_enabled` | **A** | Configuration |

### Détail complet de `wall-feed.tsx` (lecture intégrale)

| Ligne | Fonction | Table | Catégorie |
|---|---|---|---|
| 225-226 | marquage automatique | `wall_post_reads` insert | **B0 — jamais bloqué** |
| 540-541 | création de publication | `wall_posts` insert | **A** |
| 439 | effet de bord de la publication | `notifications` insert | effet de bord de A |
| 742 | `deletePost` | `wall_posts` delete | **A** (ou A′ si modération — à trancher) |
| 763-764 | `togglePin` | `wall_posts` update `is_pinned` | **A** |
| 1671-1672 | `CommentBlock.add` | `wall_comments` insert | **B** |
| 1685 | effet de bord du commentaire | `notifications` insert | **effet de bord de B** |

À vérifier encore : `club_poll_votes` et `club_poll_options` apparaissent dans les imports
de `wall-feed.tsx` mais aucune mutation directe n'a été trouvée — les votes passent
probablement par une RPC. **Si c'est le cas, c'est le bon modèle à généraliser** ; à
confirmer avant le Lot 5.

### Arbitrages tranchés

- **`wall_comments` → B.** Commenter une publication existante est une réponse. Bloquer
  les commentaires alors que la publication reste visible créerait une conversation à sens
  unique. Décliné : commenter = B ; modifier ou supprimer **son propre** commentaire = B ;
  modérer le commentaire d'autrui = A ou A′ selon le motif.
- **`event-chat.tsx` → B**, tant que le message est rattaché à un événement existant et
  non archivé. Le chat sert à l'exécution d'un événement déjà planifié — le couper après
  expiration est dangereux (changement d'heure, retard, matériel, lieu de rendez-vous).
  Limite : un nouveau fil autonome ou une discussion générale relèverait de A.
- **`players/$playerId/availability.tsx:119` → dépend de l'acteur.** S'il s'agit d'un
  écran coach, A. S'il est partagé avec le joueur ou le parent, il faut **deux actions
  serveur distinctes** ou deux contrôles distincts, pas une classification unique.
  À confirmer par lecture du composant avant le Lot 5.

---

## Catégorie N — hors périmètre équipe

Aucun changement : ces mutations ne portent pas sur des données d'équipe, ou relèvent du
périmètre club/profil déjà gouverné par les rôles existants.

| Fichier | Table | Remarque |
|---|---|---|
| `src/routes/_authenticated/admin/settings.branding.tsx:69` | `clubs` | **Identité — autorisée** en `per_team` (`canManageClubIdentity`) : nom, logo, sport, ville, coordonnées publiques, branding minimal visible sur l'équipe |
| `src/routes/_authenticated/admin/settings.communications.tsx:83` | `clubs` | **Club — bloqué** : communication globale |
| `src/routes/_authenticated/admin/settings.sponsors.tsx` | — | **Club — bloqué** : sponsoring |
| `src/routes/_authenticated/admin/settings.convocations.tsx:77` | `clubs` | **À DÉCOUPER** — réglages d'équipe = Équipe · défauts globaux du club = Club |
| `src/routes/_authenticated/admin/settings.reminders.tsx:83` | `clubs` | **À DÉCOUPER** — mêmes règles |
| `src/routes/_authenticated/admin/settings.notifications.tsx` | `club_notification_settings` | **À DÉCOUPER** — mêmes règles |

⚠️ Les trois écrans « à découper » posent un problème de **modèle de données**, pas
seulement de permission : ils écrivent aujourd'hui sur `clubs` (et
`club_notification_settings`), c'est-à-dire au niveau du club. Descendre certains réglages
au niveau équipe suppose de nouvelles colonnes ou une table de réglages par équipe.

**Bloquer l'écran entier serait plus simple mais fonctionnellement faux** : un club en
offre Équipe doit pouvoir régler les convocations et les rappels de ses équipes. Ce
découpage est donc un chantier à part entière, à instruire avant le Lot 5 — il ne se
réduit pas à un `if` sur les entitlements.
| `src/routes/_authenticated/profile.index.tsx:120,139,159` | `profiles` | Profil personnel — jamais bloqué |
| `src/components/follow-button.tsx:74` | `follows` | Réseau social, hors périmètre facturation |
| `src/routes/_authenticated/following.tsx` | `follows` | Idem |
| `src/routes/register_.player.tsx` | `players`, `profiles` | Inscription publique de joueur indépendant, `club_id: null` — **ne consomme aucun quota**, voir vérification ci-dessous |
| `src/routes/_authenticated.tsx:248,258` | `clubs`, `club_members` | Création de club à l'onboarding — **deviendra le point d'écriture de `coverage_mode`** |
| `src/modules/tournaments/components/TournamentUpgradeCard.tsx:39,45` | `clubs`, `club_members` | Création de club personnel pour organisateur — parcours tournoi, à ne pas perturber |
| `src/routes/superadmin/*.tsx` | — | Superadmin, catégorie C |
| `src/components/events/EventsFilterSheet.tsx`, `needs/audience-picker.tsx` | — | `.delete()` sur des structures locales, pas des tables — **faux positifs du grep** |

### `register_.player.tsx` — vérification faite, alerte levée

J'avais signalé ce fichier comme possible contournement du quota Découverte. **Après
lecture intégrale (324 lignes), ce risque ne se matérialise pas.** Réponses aux six
questions posées :

| Question | Réponse |
|---|---|
| Comment le `team_id` est-il résolu ? | **Il ne l'est pas.** Aucun `team_id` n'apparaît dans le fichier |
| Qui peut utiliser ce parcours ? | N'importe qui — route publique d'auto-inscription |
| Un token d'invitation est-il nécessaire ? | **Non**, aucun |
| Le même joueur peut-il être recréé ? | Oui, aucune déduplication — mais sans conséquence sur le quota |
| L'ajout à `team_members` est-il direct ? | **Non**, aucune écriture dans `team_members` |
| Peut-il contourner la RPC atomique et la limite de 15 ? | **Non** |

Le parcours crée un `profiles` (`:89`) et un `players` (`:103`) avec **`club_id: null`**,
`is_independent: true`, `person_type: "player"`, `looking_for_club`. C'est le parcours
« joueur indépendant cherchant un club », relevant du réseau social — pas du rattachement
à une équipe.

Le quota Découverte compte les lignes `team_members` avec `player_id`, que ce parcours ne
crée jamais. **Il ne consomme donc aucun quota.**

**En revanche, le point de vigilance se déplace** : ces joueurs indépendants finiront par
être rattachés à une équipe, et c'est **ce** chemin qui doit respecter le quota. Il s'agit
de `src/components/existing-player-picker.tsx` (« sélectionner un joueur existant »), déjà
classé A et déjà identifié comme devant passer par la RPC atomique. La protection est donc
au bon endroit — mais elle doit couvrir explicitement le cas « joueur indépendant
pré-existant rattaché à une équipe Découverte », pas seulement « nouveau joueur créé dans
l'équipe ».

---

## ⚠️ Deux corrections après vérification finale

- **`events/$eventId/feedback.tsx`** : il n'y a **aucun `.delete()` sur `events`** dans ce
  fichier. La ligne 230 est un `Set.delete(playerId)` JavaScript. Faux positif du grep,
  à retirer du relevé.
- **`wall-feed.tsx:742 deletePost`** : ce n'est **pas une suppression directe**. La
  fonction appelle la RPC `soft_delete_entity` (`:743`), avec restauration par
  `restore_entity`. Même chose pour la suppression de commentaire (`:1702`).

`soft_delete_entity` s'avère être un **point de passage central** couvrant `wall_post`,
`wall_comment`, `event`, `team` et `player`, en `SECURITY DEFINER`, avec la distinction
auteur / admin déjà implémentée. Détail dans `matrice-enforcement-lot5.md`.

## État de complétion

Les trois lectures prioritaires sont **faites** : `events/$eventId.tsx` (4 500 lignes),
`wall-feed.tsx` (1 700 lignes), `register_.player.tsx` (324 lignes). Les six arbitrages
produit sont **tranchés**. L'inventaire est utilisable comme base de conception du Lot 5.

Reste à faire avant de **modifier la moindre policy** :

1. **`players/$playerId/availability.tsx`** — déterminer l'acteur réel (coach seul, ou
   écran partagé) ; si partagé, prévoir deux actions serveur distinctes.
2. **`club_poll_votes`** — vérifier que les votes passent bien par une RPC. Si oui, c'est
   le modèle à généraliser ; si non, les classer B et les protéger.
3. **`events/$eventId/feedback.tsx`** — nature exacte du `delete` sur `events`.
4. **`wall-feed.tsx:742 deletePost`** — supprimer sa propre publication (B) ou modérer
   celle d'autrui (A/A′) ? Le code ne distingue pas les deux cas aujourd'hui.
5. **Découpage des trois écrans de paramètres** — chantier de modèle de données, pas de
   permission (voir ci-dessus).
6. **Mutations via helpers partagés** (`src/lib/*.functions.ts` appelées depuis le
   client) — couvertes par les gardes serveur, à inventorier séparément si le Lot 5 les
   touche.

Les points 1 à 4 sont des vérifications de code, réalisables sans arbitrage. Le point 5
est un chantier de conception.

---

## Conséquences pour la conception du Lot 5

1. **Aucune policy de couverture sur `notifications` ni sur `wall_posts` INSERT.** Ces
   tables sont des canaux d'effets de bord partagés entre A, A′ et B.
2. **RPC `SECURITY DEFINER` pour toute action A′** : `cancel_event`,
   `withdraw_convocation`, et `close_event_need` si la clôture d'un besoin doit rester
   possible. Chaque RPC embarque ses effets de bord (notifications, annonce murale,
   journal), sinon le problème des tables partagées resurgit.
3. **Les policies de couverture portent sur les tables « métier » à intention unique** :
   `events` (hors annulation, désormais passée en RPC), `wall_posts` INSERT direct depuis
   le mur, `team_members`, `players`, `event_staff_assignments`, `match_results`,
   `player_suspensions`, `reminders`, `club_invites`, `member_invites`.
4. **`wall_post_reads` et `notifications.read_at` (B0) ne reçoivent jamais de contrôle**,
   à aucun état.
5. **Le quota Découverte se protège sur le rattachement à l'équipe**
   (`existing-player-picker.tsx`, `$teamId.tsx`, import CSV), pas sur la création de
   profil joueur.
