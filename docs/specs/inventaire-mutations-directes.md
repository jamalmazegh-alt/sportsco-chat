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
C  — système (webhook, cron, service role) → hors RLS utilisateur
D  — lecture                        → conservée
N  — hors périmètre équipe          → aucun changement
```

**La classification porte sur l'action, pas sur le fichier.** Plusieurs écrans contiennent
des mutations de catégories différentes — `events/$eventId.tsx` en contient au moins trois.

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

| Fichier | Ligne | Table | Op | Action |
|---|---|---|---|---|
| `src/routes/_authenticated/events/$eventId.tsx` | 1339, 1354, 1488, 1517, 2134, 4525 | `events` | update/delete | **À départager** : annulation d'un événement (A′) vs modification de fond (A) |
| `src/routes/_authenticated/events/$eventId.tsx` | 804, 1077 | `convocations` | insert/delete | **À départager** : retrait d'une convocation erronée (A′) vs nouvelle convocation (A) |
| `src/components/urgency-center.tsx` | 254 | `convocations` | delete/update | Traitement d'une convocation en souffrance |
| `src/routes/_authenticated/events/$eventId/feedback.tsx` | — | `events` | delete | Retrait d'un retour d'événement |

**Ces six mutations sur `events` sont le nœud du Lot 5.** Elles vivent dans le même
fichier, sur la même table, avec la même opération SQL (`update`), et seule l'intention
les distingue. Une policy RLS ne peut pas lire l'intention.

Deux options, à trancher avant le Lot 5 :

1. **Colonne discriminante** — l'annulation passe par un champ dédié (`cancelled_at`,
   `status`) et la policy autorise les `update` restreints à cette colonne même en lecture
   seule. Propre, mais suppose que l'annulation n'écrive pas d'autres champs.
2. **RPC dédiée** — `cancel_event(event_id, reason)` en `SECURITY DEFINER`, seule
   habilitée en lecture seule, tandis que l'`update` générique est bloqué. Plus verbeux,
   mais l'intention devient explicite et auditable.

**Recommandation : option 2.** Elle rend la catégorie A′ visible dans le code plutôt que
déduite d'une policy, et elle survit aux évolutions du schéma.

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

Deux cas signalés comme incertains plutôt que tranchés seul :

- **`players/$playerId/availability.tsx:119`** — si cet écran est utilisé par le coach
  pour saisir la disponibilité d'un joueur, c'est A ; s'il sert au joueur lui-même, c'est
  B. Le nom de la route suggère une vue coach, mais à confirmer par lecture du composant.
- **`event-chat.tsx`** — envoyer un message dans le fil d'un événement existant ressemble
  à B (continuité d'un objet créé), mais c'est de la création de contenu. **Penche vers
  B** : couper la communication d'une équipe pendant la lecture seule aurait un coût
  fonctionnel élevé pour un gain commercial faible.

---

## Catégorie N — hors périmètre équipe

Aucun changement : ces mutations ne portent pas sur des données d'équipe, ou relèvent du
périmètre club/profil déjà gouverné par les rôles existants.

| Fichier | Table | Remarque |
|---|---|---|
| `src/routes/_authenticated/admin/settings.branding.tsx:69` | `clubs` | **Identité du club — reste autorisé** en `per_team` (`canManageClubIdentity`) |
| `src/routes/_authenticated/admin/settings.communications.tsx:83` | `clubs` | Paramètres club — à arbitrer selon `canUseClubFeatures` |
| `src/routes/_authenticated/admin/settings.convocations.tsx:77` | `clubs` | Idem |
| `src/routes/_authenticated/admin/settings.reminders.tsx:83` | `clubs` | Idem |
| `src/routes/_authenticated/admin/settings.notifications.tsx` | `club_notification_settings` | Idem |
| `src/routes/_authenticated/admin/settings.sponsors.tsx` | — | Sponsoring : **fonctionnalité Club**, exclue des offres Découverte et Équipe |
| `src/routes/_authenticated/profile.index.tsx:120,139,159` | `profiles` | Profil personnel — jamais bloqué |
| `src/components/follow-button.tsx:74` | `follows` | Réseau social, hors périmètre facturation |
| `src/routes/_authenticated/following.tsx` | `follows` | Idem |
| `src/routes/register_.player.tsx` | `players`, `profiles` | Inscription publique — **attention : chemin d'entrée de joueur, doit respecter le quota Découverte** |
| `src/routes/_authenticated.tsx:248,258` | `clubs`, `club_members` | Création de club à l'onboarding — **deviendra le point d'écriture de `coverage_mode`** |
| `src/modules/tournaments/components/TournamentUpgradeCard.tsx:39,45` | `clubs`, `club_members` | Création de club personnel pour organisateur — parcours tournoi, à ne pas perturber |
| `src/routes/superadmin/*.tsx` | — | Superadmin, catégorie C |
| `src/components/events/EventsFilterSheet.tsx`, `needs/audience-picker.tsx` | — | `.delete()` sur des structures locales, pas des tables — **faux positifs du grep** |

⚠️ **`register_.player.tsx`** mérite une attention particulière : c'est un chemin
d'inscription **public** qui crée des joueurs. Il doit passer par le même contrôle de
quota que les autres, sinon il constitue un contournement trivial de la limite Découverte.
Classé N ici parce qu'il n'est pas une mutation d'équipe au sens de la lecture seule, mais
il relève de la §5.2 de la spec (« chemins à protéger »).

---

## Ce qui reste à faire

Cet inventaire est un **premier passage exploitable, pas un relevé exhaustif**. Il couvre
les 44 fichiers et identifie les décisions structurantes, mais :

1. **Les lignes exactes ne sont ancrées que lorsque `from("table")` précède la mutation de
   trois lignes au plus.** Les chaînes plus longues (variable intermédiaire, helper) ne
   sont pas capturées. Méthode de complétion : parcourir chaque fichier listé et relever
   chaque appel, sans se fier au grep.
2. **`events/$eventId.tsx` (4 500+ lignes) doit être traité seul.** Il concentre à lui
   seul les trois catégories A, A′ et B sur les mêmes tables. C'est le fichier le plus
   important de l'inventaire et il mérite sa propre passe de lecture.
3. **`wall-feed.tsx` (1 700+ lignes)** contient publications (A), commentaires (B),
   marquages lus (B) et votes de sondage (B) — même remarque.
4. **Les mutations passant par des helpers partagés** (`src/lib/*.functions.ts` appelées
   depuis le client) ne figurent pas ici : elles sont couvertes par les gardes serveur, à
   inventorier séparément si le Lot 5 les touche.

---

## Décisions à valider avant le Lot 5

1. **Mécanisme de la catégorie A′** : colonne discriminante ou RPC dédiée
   (recommandation : RPC `cancel_event`).
2. **`wall_comments`** : B (recommandé) ou A ?
3. **`event-chat.tsx`** : B (recommandé) ou A ?
4. **`players/$playerId/availability.tsx`** : vue coach (A) ou saisie joueur (B) ?
5. **`wall_post_reads` et `notifications`** : confirmer qu'ils ne sont **jamais** bloqués,
   quel que soit l'état.
6. **Paramètres club** (`settings.communications`, `.convocations`, `.reminders`,
   `.notifications`) : lesquels relèvent de `canManageClubIdentity` (autorisés en
   `per_team`) et lesquels de `canUseClubFeatures` (bloqués) ?

Ces six points ne peuvent pas être tranchés depuis le code seul : ils relèvent d'un
arbitrage produit.
