# Matrice d'enforcement — contrat d'implémentation du Lot 5

> **Statut : contrat d'implémentation.** Une fois cette matrice validée, il ne doit plus y
> avoir de décision produit pendant le développement, seulement de l'exécution.
>
> Sources : `inventaire-mutations-directes.md`, `inventaire-lecteurs-subscriptions.md`,
> et quatre vérifications de code menées à leur terme.
>
> **Aucune policy n'est écrite, aucune RLS n'est modifiée, aucune fonction SQL n'est
> touchée.** Ce document décrit ce qu'il faudra faire, pas ce qui a été fait.

---

## Résultat des quatre vérifications finales

### 1. `players/$playerId/availability.tsx` — écran partagé, discriminant déjà en base

`canDeclare = roles.includes("player") || roles.includes("parent")` (`:48`) : ce sont bien
les joueurs et parents qui déclarent. Le bouton d'annulation s'affiche si
`r.created_by_user_id === user?.id || isAdmin` (`:224`).

**La colonne `player_availabilities.created_by_user_id` existe déjà** et distingue
exactement les deux cas. Pas besoin de deux écrans ni de deux tables :

```text
created_by_user_id = auth.uid()   → B  (le déclarant gère sa propre absence)
created_by_user_id ≠ auth.uid()   → A  (un coach ou admin agit à la place)
```

C'est une bonne nouvelle : la distinction par acteur est exprimable **dans une policy**,
sans RPC.

### 2. Votes de sondage — déjà au bon modèle

Les votes passent par la RPC `cast_poll_vote`
(`src/lib/publications/publications.functions.ts:198`), avec un enum
`poll_vote_action = vote | change | retrait`. `club_poll_votes` n'est lue directement que
pour un décompte (`wall-feed.tsx:284`). **Aucune mutation directe.** C'est le modèle à
généraliser.

### 3. `feedback.tsx` — ⚠️ faux positif de mon inventaire

**Il n'y a aucun `.delete()` sur `events` dans ce fichier.** La ligne 230 est un
`Set.delete(playerId)` JavaScript, et la ligne 61 est une lecture. Mon relevé précédent
était erroné : le grep avait capté une méthode JS homonyme.

### 4. `deletePost` — ⚠️ seconde correction, et une découverte

`deletePost` **n'est pas une suppression directe** : il appelle
`supabase.rpc("soft_delete_entity", { _kind: "wall_post", _id: id })` (`wall-feed.tsx:743`),
avec restauration par `restore_entity`.

**`soft_delete_entity` est un point de passage central** couvrant cinq types d'entités —
`wall_post`, `wall_comment`, `event`, `team`, `player` — en `SECURITY DEFINER`, avec
résolution du club et contrôle d'autorisation par rôle déjà en place :

| Kind | Autorisation actuelle |
|---|---|
| `wall_post` | admin du club **ou** auteur |
| `wall_comment` | admin du club **ou** auteur |
| `event` | coach de l'équipe |
| `team` | admin du club |
| `player` | admin **ou** coach du club |

**Conséquence majeure : un seul point d'ajout du contrôle de couverture couvre cinq
tables**, et la distinction « auteur » / « admin modérateur » y est déjà faite.

⚠️ La définition lue provient de `20260515141415_…sql:17`. **Trois migrations ultérieures
redéfinissent cette fonction** (`20260515141432`, `20260517212451`, `20260518204544`) : la
définition courante doit être relue avant toute modification.

---

## Conventions de lecture

```text
Catégories   A   création et administration
             A′  continuité et sécurité
             B   réponse à un objet existant
             B0  état personnel sans valeur commerciale
             N   hors périmètre facturation

États        ✅ autorisé   ❌ bloqué
Décision     Policy · RPC · Server Function · Aucun changement
Priorité     Critique · Importante · Normale
```

**Critique** = bloque le chantier ou casse un usage utilisateur si mal traité.
**Importante** = impact commercial ou fonctionnel réel. **Normale** = confort.

---

## B0 — état personnel, jamais bloqué

| Action métier | Table | Acteur | Cat | Act | Grâce | Restr | Lock | Chemin | Décision | Prio | Effets de bord | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Marquer une publication lue | `wall_post_reads` | tous | B0 | ✅ | ✅ | ✅ | ✅ | `wall-feed.tsx:225` | **Aucun changement** | Critique | — | RLS |
| Marquer une notification lue | `notifications` (`read_at`) | tous | B0 | ✅ | ✅ | ✅ | ✅ | `notifications.tsx:78` | **Aucun changement** | Critique | — | RLS |

> Classés **Critique** malgré leur banalité : les bloquer produit des badges de non-lus
> qui ne redescendent jamais, symptôme immédiatement visible et interprété comme une panne.

---

## B — réponses à un objet existant

| Action métier | Table | Acteur | Cat | Act | Grâce | Restr | Lock | Chemin | Décision | Prio | Effets de bord | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Répondre à une convocation | `convocations` | parent/joueur | B | ✅ | ✅ | ✅ | ❌ | `submitResponse` (`$eventId:804`) | **Policy** | Critique | `notifications` | RLS + E2E |
| Modifier sa réponse avant l'événement | `convocations` | parent/joueur | B | ✅ | ✅ | ✅ | ❌ | idem | **Policy** | Critique | `notifications` | RLS + E2E |
| Déclarer son indisponibilité | `player_availabilities` | parent/joueur | B | ✅ | ✅ | ✅ | ❌ | `declare-absence-drawer:377,389` | **Policy** `created_by_user_id = auth.uid()` | Critique | `notifications` | RLS + E2E |
| Annuler sa propre indisponibilité | `player_availabilities` | parent/joueur | B | ✅ | ✅ | ✅ | ❌ | `availability.tsx:119` | **Policy** idem | Critique | — | RLS |
| Déclarer une indisponibilité staff | `staff_availabilities` | staff | B | ✅ | ✅ | ✅ | ❌ | `declare-staff-absence-drawer:166` | **Policy** | Importante | — | RLS |
| Mettre à jour ses disponibilités staff | `staff_availabilities` | staff | B | ✅ | ✅ | ✅ | ❌ | `profile/availabilities:109` | **Policy** | Importante | — | RLS |
| Commenter une publication | `wall_comments` | tous | B | ✅ | ✅ | ✅ | ❌ | `CommentBlock.add:1671` | **Policy** | Importante | `notifications` | RLS |
| Supprimer son propre commentaire | `wall_comments` | auteur | B | ✅ | ✅ | ✅ | ❌ | `soft_delete_entity` | **RPC (existe)** | Normale | — | RPC |
| Voter à un sondage | `club_poll_votes` | tous | B | ✅ | ✅ | ✅ | ❌ | `cast_poll_vote` | **RPC (existe)** | Importante | — | RPC |
| S'inscrire à un covoiturage | `carpool_passengers` | parent | B | ✅ | ✅ | ✅ | ❌ | `carpool-section:355` | **Policy** | Normale | — | RLS |
| Message dans le fil d'un événement | `event_messages` | tous | B | ✅ | ✅ | ✅ | ❌ | `event-chat.tsx` | **Policy** — événement existant et non archivé | Importante | `notifications` | RLS + E2E |
| Candidater à un besoin existant | besoins d'événement | tous | B | ✅ | ✅ | ✅ | ❌ | `needs/event-needs-section` | **Policy** | Importante | — | RLS |
| Accepter une invitation | `member_invites`, `team_members` | invité | B | ✅ | ✅ | ✅ | ❌ | `r.$token`, `rm.$token` | **Server Function** | Critique | — | RLS + E2E |

> ⚠️ **« Accepter une invitation » crée une ligne `team_members`.** Si l'invité est un
> joueur, cette action **consomme du quota Découverte**. Elle est B pour la couverture
> (on n'empêche pas quelqu'un de rejoindre), mais elle doit passer par le **contrôle
> atomique de quota**. C'est le seul cas B soumis au quota.

---

## A′ — continuité et sécurité, maintenues en lecture seule

| Action métier | Table | Acteur | Cat | Act | Grâce | Restr | Lock | Chemin | Décision | Prio | Effets de bord | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Annuler un événement | `events` | coach | A′ | ✅ | ✅ | ✅ | ❌ | `confirmCancelEvent:1494` | **RPC `cancel_event`** | Critique | `notifications`, `wall_posts`, audit, outbox | RPC + E2E |
| Retirer une convocation erronée | `convocations` | coach | A′ | ✅ | ✅ | ✅ | ❌ | `confirmCancelConvocation:867` | **RPC `withdraw_convocation`** | Critique | `notifications` | RPC + caractérisation |
| Traiter une convocation en souffrance | `convocations` | coach | A′ | ✅ | ✅ | ✅ | ❌ | `urgency-center:254` | **RPC** (même que ci-dessus) | Importante | `notifications` | RPC |
| Clôturer un besoin | besoins d'événement | coach | A′ | ✅ | ✅ | ✅ | ❌ | `needs/event-needs-section` | **RPC `close_event_need`** | Importante | — | RPC |
| Modérer un contenu dangereux | `wall_posts`, `wall_comments` | admin | A′ | ✅ | ✅ | ✅ | ❌ | `soft_delete_entity` | **RPC (existe)** | Importante | — | RPC |

### Périmètre de `cancel_event` — transactionnel vs externe

Décision retenue : **les effets persistés sont atomiques, les livraisons externes ne le
sont pas.** Un échec d'envoi push ou email ne doit jamais annuler l'annulation d'un
événement.

```text
DANS LA TRANSACTION (RPC)          APRÈS COMMIT (outbox)
─────────────────────────          ─────────────────────
validation de l'autorisation A′    push
verrou / contrôle de version       email
UPDATE events (patch d'annulation) autres appels externes
INSERT notifications in-app
INSERT wall_posts (annonce)
INSERT journal d'audit
INSERT enregistrement d'outbox
```

Invariant :

```text
annulation métier + effets persistés  = atomiques
livraisons externes                   = idempotentes et rejouables
```

Le code actuel envoie déjà ces messages en *best-effort* (`Promise.allSettled`,
`:1329-1332`) : le comportement observable ne change pas, mais il devient reprenable.

### `withdraw_convocation` — préserver l'invariant, pas seulement l'erreur

`confirmCancelConvocation` intercepte aujourd'hui une erreur `past_event_locked`
(`$eventId.tsx:880-882`), signe qu'un trigger protège les événements passés.

**Test de caractérisation à écrire AVANT la migration :**

```text
retrait d'une convocation sur un événement passé
→ refusé avec le MÊME code métier past_event_locked
```

Vérifier le code exact, pas seulement qu'une exception quelconque est levée — sinon la
RPC pourrait « préserver » un refus tout en changeant sa cause, et le message utilisateur
deviendrait faux.

---

## A — création et administration

| Action métier | Table | Acteur | Cat | Act | Grâce | Restr | Lock | Chemin | Décision | Prio | Effets de bord | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Publier sur le mur | `wall_posts` | coach/admin | A | ✅ | ✅ | ❌ | ❌ | `wall-feed:540` | **Policy** | Critique | `notifications` | RLS + E2E |
| Supprimer sa publication | `wall_posts` | auteur | A | ✅ | ✅ | ❌ | ❌ | `soft_delete_entity` | **RPC (existe)** | Importante | — | RPC |
| Épingler une publication | `wall_posts` | admin | A | ✅ | ✅ | ❌ | ❌ | `togglePin:764` | **Policy** | Normale | — | RLS |
| Créer un événement | `events` | coach | A | ✅ | ✅ | ❌ | ❌ | écrans événements | **Policy** | Critique | `notifications` | RLS + E2E |
| Reprogrammer un événement | `events` | coach | A | ✅ | ✅ | ❌ | ❌ | `confirmReschedule:1730` | **Policy** | Critique | `notifications`, `wall_posts` | RLS |
| Verrouiller les réponses | `events` | coach | A | ✅ | ✅ | ❌ | ❌ | `toggleLock:1488` | **Policy** | Normale | — | RLS |
| Basculer le covoiturage | `events` | coach | A | ✅ | ✅ | ❌ | ❌ | `$eventId:4525` | **Policy** | Normale | — | RLS |
| Supprimer un événement | `events` | coach | A | ✅ | ✅ | ❌ | ❌ | `soft_delete_entity` | **RPC (existe)** | Importante | — | RPC |
| Envoyer des convocations | `convocations` | coach | A | ✅ | ✅ | ❌ | ❌ | `$eventId:1077` | **Policy** | Critique | `notifications`, `events` (suivi) | RLS + E2E |
| Renvoyer des convocations | `events` (suivi) | coach | A | ✅ | ✅ | ❌ | ❌ | `$eventId:2134` | **Policy** | Importante | `notifications` | RLS |
| Créer un covoiturage | `carpools` | coach/parent | A | ✅ | ✅ | ❌ | ❌ | `carpool-section:337` | **Policy** | Normale | — | RLS |
| **Ajouter un joueur** | `team_members` | coach | A | ✅ | ✅ | ❌ | ❌ | `$teamId:601,2025` | **RPC quota** | Critique | audit | Concurrence |
| **Rattacher un joueur existant** | `team_members` | coach | A | ✅ | ✅ | ❌ | ❌ | `existing-player-picker` | **RPC quota** | Critique | audit | Concurrence |
| **Importer des joueurs CSV** | `team_members`, `players` | coach | A | ✅ | ✅ | ❌ | ❌ | `import-players-csv-dialog` | **RPC import (lot atomique)** | Critique | audit | Concurrence |
| Retirer un joueur de l'équipe | `team_members` | coach | A | ✅ | ✅ | ❌ | ❌ | `$teamId:787,2047` | **Policy** | Importante | libère du quota | RLS |
| Créer un joueur dans l'équipe | `players` | coach | A | ✅ | ✅ | ❌ | ❌ | `$teamId:756` | **RPC quota** | Critique | — | Concurrence |
| **Créer une équipe** | `teams` | admin | A | ✅ | ✅ | ❌ | ❌ | `teams.tsx:112` | **RPC quota Découverte** | Critique | `team_members` | Concurrence |
| Modifier la config d'équipe | `teams` | coach/admin | A | ✅ | ✅ | ❌ | ❌ | `$teamId:471` | **Policy** | Importante | — | RLS |
| Affecter le staff | `event_staff_assignments` | coach | A | ✅ | ✅ | ❌ | ❌ | `staff-assignment-section:188,222` | **Policy** | Importante | — | RLS |
| Saisir un résultat de match | `match_results` | coach | A | ✅ | ✅ | ❌ | ❌ | `match-result-card:191` | **Policy** | Normale | — | RLS |
| Sanctionner un joueur | `player_suspensions` | coach/admin | A | ✅ | ✅ | ❌ | ❌ | `player-suspensions:150`, `quick-sanction-drawer` | **Policy** | Normale | `audit_logs` | RLS |
| Programmer des rappels | `reminders` | coach | A | ✅ | ✅ | ❌ | ❌ | `$eventId:1398`, `follow-ups` | **Policy** | Normale | `notifications` | RLS |
| Inviter un membre | `member_invites` | admin | A | ✅ | ✅ | ❌ | ❌ | `admin/users.index` | **Policy** | Importante | email | RLS |
| Générer un lien d'invitation | `club_invites` | admin | A | ✅ | ✅ | ❌ | ❌ | `team-invite-share-button` | **Policy** | Importante | — | RLS |
| Saisir la dispo d'un joueur à sa place | `player_availabilities` | coach/admin | A | ✅ | ✅ | ❌ | ❌ | `availability.tsx` | **Policy** `created_by_user_id ≠ auth.uid()` | Importante | — | RLS |
| Gérer le palmarès / saisons / timeline | `player_achievements`, `player_seasons`, `player_timeline_events` | coach | A | ✅ | ✅ | ❌ | ❌ | `players/$playerId/*` | **Policy** | Normale | — | RLS |
| Modifier une fiche joueur | `players` | coach/admin | A | ✅ | ✅ | ❌ | ❌ | `players/$playerId:488,526` | **Policy** | Normale | — | RLS |

---

## Tables d'effets de bord — aucun contrôle de couverture

| Table | Écrite par | Décision | Prio | Justification |
|---|---|---|---|---|
| `notifications` (INSERT) | A, A′ **et** B | **Aucun changement** | Critique | Canal partagé — un contrôle casserait les réponses des familles et l'annonce d'annulation |
| `wall_posts` (INSERT via `cancel_event`) | A′ | **RPC** | Critique | L'INSERT direct depuis le mur reste A ; l'annonce d'annulation passe par la RPC |
| `audit_logs` | toutes | **Aucun changement** | Importante | Journalisation, jamais bloquée |

---

## N — hors périmètre facturation

| Action métier | Table | Décision | Prio | Note |
|---|---|---|---|---|
| Modifier l'identité du club (nom, logo, sport, ville) | `clubs` | **Policy** `canManageClubIdentity` | Importante | ✅ autorisé en `per_team`, à tous les états |
| Communication globale du club | `clubs` | **Policy** `canUseClubFeatures` | Importante | ❌ bloqué sans offre Club |
| Sponsors | — | **Policy** `canUseClubFeatures` | Normale | ❌ bloqué sans offre Club |
| Défauts de convocations / rappels / notifications | `clubs`, `club_notification_settings` | **Chantier séparé** | Importante | Voir ci-dessous |
| Modifier son profil personnel | `profiles` | **Aucun changement** | — | Jamais bloqué |
| Créer un profil joueur indépendant | `players` (`club_id: null`) | **Aucun changement** | — | Ne consomme aucun quota |
| Suivre un club ou un joueur | `follows` | **Aucun changement** | — | Réseau social |

### Réglages par équipe — chantier isolable

Les trois écrans « à découper » écrivent aujourd'hui sur `clubs`. Modèle cible :

```text
réglage effectif équipe
  = valeur équipe si définie
  = sinon valeur club si la fonctionnalité Club est accessible
  = sinon valeur système par défaut
```

**Ce chantier ne bloque pas les fondations de l'offre Équipe** si les valeurs système par
défaut sont acceptables en V1. À isoler et traiter séparément.

---

## Principes à inscrire dans le code

1. **Le quota est gouverné par `team_members`, jamais par `players`.**
   ```text
   création d'un profil joueur        ≠ consommation du quota
   activation du joueur dans l'équipe = consommation possible du quota
   ```
2. **L'intention métier gouverne le chemin d'écriture**, pas la table. Une action A′ passe
   par une RPC ; une table partagée ne reçoit jamais de policy commerciale.
3. **Les effets persistés sont atomiques ; les livraisons externes sont idempotentes et
   rejouables** (outbox après commit).
4. **Le discriminant d'acteur, quand il existe en base** (`created_by_user_id`,
   `author_user_id`), s'exprime dans la policy — inutile de créer une RPC pour cela.
5. **`soft_delete_entity` est un point de passage central** : y ajouter le contrôle de
   couverture couvre cinq tables à la fois, avec la distinction auteur/admin déjà faite.

---

## Récapitulatif par décision

| Décision | Nombre d'actions | Dont Critiques |
|---|---|---|
| **Policy** à modifier | 27 | 8 |
| **RPC à créer** (`cancel_event`, `withdraw_convocation`, `close_event_need`, RPC quota) | 4 | 3 |
| **RPC existante** à enrichir (`soft_delete_entity`, `cast_poll_vote`) | 2 | 0 |
| **Server Function** | 1 | 1 |
| **Aucun changement** | 8 | 3 |

---

## Ce qui reste avant d'écrire la première policy

1. **Relire la définition courante de `soft_delete_entity`** — trois migrations la
   redéfinissent après celle qui a été lue.
2. **Inventorier les mutations passant par des helpers partagés**
   (`src/lib/*.functions.ts` appelées depuis le client) — non couvertes par cette matrice.
3. **Localiser précisément** les chemins d'écriture marqués « écrans événements » et
   « besoins d'événement », relevés par table mais pas encore par ligne.
4. **Valider cette matrice** — après quoi elle devient le contrat, et le développement
   n'est plus qu'exécution.

**État du projet à ce stade : nous savons exactement ce qu'il faudra faire, et nous
n'avons encore rien modifié.**
