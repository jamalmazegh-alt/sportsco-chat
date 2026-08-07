# Offre Clubero à crédits d'équipes — spécification

> **Statut : spécification de référence.** Remplace le chantier « Offre Équipe » précédent
> (sept documents, huit lots), abandonné au profit de ce modèle radicalement plus simple.
>
> Les documents précédents sont conservés en archive dans `docs/specs/archive-offre-equipe/`
> — ils gardent une valeur documentaire sur le code existant, mais ne décrivent plus le
> chantier à mener.
>
> **Aucun code n'a été écrit. Ce document décrit ce qu'il faudra faire.**

---

## 1. Modèle commercial

```text
Essai Découverte — 30 jours, gratuit, sans carte bancaire
  1 équipe · 25 joueurs max · pas de tournois
  → à l'échéance sans paiement : club verrouillé (comportement actuel)
  → PAS d'offre gratuite permanente

Offre à crédits — 9,99 €/mois ou 99,99 €/an PAR CRÉDIT
  1 crédit = 1 place d'équipe · 25 joueurs max par équipe · pas de tournois
  plafond dur à 4 crédits

Offre Club — 49 €/mois ou 490 €/an (existante, inchangée)
  équipes illimitées · joueurs illimités · fonctionnalités club · tournois
```

Grille tarifaire :

| Crédits | Mensuel | Annuel |
|---|---|---|
| 1 | 9,99 € | 99,99 € |
| 2 | 19,98 € | 199,98 € |
| 3 | 29,97 € | 299,97 € |
| 4 | 39,96 € | 399,96 € |
| **Club** | **49,00 €** | **490,00 €** |

Le plafond à 4 est **dur**, pas un simple conseil : à 5 crédits l'utilisateur paierait
49,95 €/mois (499,95 €/an) contre 49 €/mois (490 €/an) pour la formule Club — plus cher
pour moins de fonctionnalités. Le seuil tombe au même endroit en mensuel et en annuel.

**Cohérence avec la promesse publique.** `src/locales/fr/marketing.json:1079` annonce déjà
« une période d'essai gratuit de 30 jours sans carte bancaire, pour une équipe jusqu'à
25 membres ». Le code donne aujourd'hui **14 jours** et aucune limite de joueurs : la
présente spécification aligne le produit sur ce qui est déjà promis.

---

## 2. Modèle technique — une seule colonne

```sql
ALTER TABLE public.subscriptions
  ADD COLUMN team_credits int NULL CHECK (team_credits IS NULL OR team_credits BETWEEN 1 AND 4);
```

Cette colonne encode **à la fois le palier et toutes ses limites** :

| `team_credits` | Formule | Équipes | Joueurs / équipe | Tournois |
|---|---|---|---|---|
| `NULL` | **Club** | illimitées | illimités | autorisés |
| `1` à `4` | **Crédits** | = `team_credits` | 25 | bloqués |

**Tous les clubs existants prennent `NULL` par défaut** → formule Club → comportement
strictement inchangé. C'est une migration additive sans backfill.

Constantes serveur, configurables sans migration :

```text
TEAM_CREDIT_MAX          = 4
TEAM_PLAN_MAX_PLAYERS    = 25
TRIAL_DURATION_DAYS      = 30
```

### Ce qui n'est PAS créé

Pas de `team_subscriptions`. Pas de `team_discovery_coverage`. Pas de
`club_plan_migrations`. Pas de `billing_delegates`. Pas de `team_members.status`. Pas de
fonctions de couverture par équipe. Pas de machine à états dérivés. Pas de saga.

La table `subscriptions` conserve sa contrainte **UNIQUE sur `club_id`**, et
`club_has_active_subscription()` conserve **exactement** sa sémantique actuelle.

---

## 3. Pourquoi ce modèle élimine le risque

Le chantier précédent était risqué parce qu'un club pouvait avoir des équipes couvertes
différemment. Cette **couverture partielle** imposait un contrôle d'accès à portée équipe,
donc la réécriture des RLS.

Ici, **un club a un abonnement ou n'en a pas**. Il n'existe aucune couverture partielle.
Le verrouillage existant, au niveau club, suffit.

Conséquences directes, toutes vérifiées dans le code :

| Composant | Effet |
|---|---|
| `subscriptions` (UNIQUE `club_id`) | inchangé |
| `club_has_active_subscription()` | **inchangée** |
| Garde de `src/routes/_authenticated.tsx` | **inchangée** — le bloquant n°1 identifié à l'inventaire disparaît |
| `useTournamentOnlyMode` | **inchangé** — le club a bien une souscription active, le bloquant n°2 disparaît |
| Webhook `upsert(onConflict: "club_id")` | **inchangé** |
| `billing.functions.ts` (verrouillé « club admin ») | **inchangé** — le coach est l'admin de son club |
| `trial-banner.tsx`, `has-paid-access`, console superadmin | **inchangés** |
| Policies RLS existantes | **aucune modification** |

Le passage à la formule Club devient un **changement de prix sur l'item Stripe existant** —
opération native, pas une saga.

---

## 4. Les crédits Stripe

La source de vérité est la **`quantity` de l'item Stripe** sur la souscription du club.
`subscriptions.team_credits` en est le miroir, alimenté par le webhook, qui lit déjà
`sub.items.data[0]`.

```text
checkout    → line_items: [{ price: PRIX_CREDIT, quantity: N }]
mise à jour → modification de quantity sur l'item existant
passage Club→ changement de price sur l'item existant, quantity 1, team_credits → NULL
```

Le prorata est calculé **par Stripe**, jamais en interne — ajouter un crédit en cours de
mois est nativement géré.

### ⚠️ Ne pas copier la mécanique des tournois

Le modèle mental « crédits » vient des tournois, mais leur **implémentation** est d'une
autre nature : `tournament_passes` et `consume_single_entitlement` gèrent des achats
**consommables à usage unique**.

Les crédits d'équipe sont des **places récurrentes** : on ne les consomme pas, on les
occupe, et elles se libèrent à l'archivage d'une équipe. Reprendre la machinerie de
consommation introduirait un registre à réconcilier, sans bénéfice. La `quantity` Stripe
suffit.

---

## 5. Règles d'application

### 5.1 Création d'équipe

Refusée si le club a déjà `team_credits` équipes non archivées.

Contrôle **atomique** — verrou sur la ligne `clubs`, comptage, décision, insertion dans la
même transaction. **Le quota est résolu avant le verrou** : si `team_credits IS NULL`
(formule Club), aucun verrou n'est pris et aucun comptage n'est fait.

Message :

> Vous utilisez vos 3 crédits d'équipe. Ajoutez un crédit à 9,99 €/mois, ou passez à la
> formule Club pour un nombre d'équipes illimité.

### 5.2 Limite de joueurs

25 joueurs actifs par équipe en formule à crédits ; aucune limite en formule Club.

Même stratégie atomique, même règle : quota résolu avant le verrou, donc **coût nul pour
les clubs en formule Club**.

Définition du joueur comptabilisé, **sans nouvelle colonne** — le modèle actuel suffit :

```sql
team_members.team_id = :team_id
AND team_members.player_id IS NOT NULL   -- ligne joueur, pas staff
AND players.deleted_at IS NULL
```

Retirer un joueur de l'effectif supprime sa ligne `team_members` ; l'historique des
convocations, présences et compositions référence `player_id` et `event_id` directement,
il n'est donc pas affecté. **`team_members.status` n'est pas nécessaire en V1.**

Le staff n'est jamais compté : les lignes `team_members` du staff ont `player_id IS NULL`.

Chemins à protéger, tous via la même RPC : création manuelle, import CSV, rattachement
d'un joueur existant, acceptation d'une invitation joueur, transfert entre équipes.

L'import CSV est traité comme un **lot atomique** : refus intégral si le lot dépasserait
la limite, en ne comptant comme consommatrices que les créations réelles (ni les doublons,
ni les mises à jour).

### 5.3 Réduction de crédits — décision structurante

**Une réduction n'est possible que si le nombre d'équipes non archivées est déjà inférieur
ou égal au nouveau nombre de crédits.**

> Vous avez 3 équipes actives et souhaitez passer à 2 crédits. Archivez d'abord une équipe.

C'est le seul endroit où ce modèle pourrait basculer du côté compliqué. L'alternative —
laisser passer et verrouiller les équipes en excédent — **ressusciterait la couverture
partielle**, donc le contrôle d'accès par équipe et la réécriture des RLS. Elle est
exclue.

### 5.4 Tournois

Bloqués dès que `team_credits IS NOT NULL`. Une seule fonction SQL existante est
concernée : `can_create_tournament`.

L'équipe peut toujours **participer** à un tournoi tiers selon les flux existants ; seules
la création et l'administration sont bloquées. Écran d'upsell vers les offres tournoi
existantes, jamais une erreur ni une page vide.

### 5.5 Fin d'essai

À l'échéance des 30 jours sans paiement : **comportement actuel inchangé** — le club passe
en lecture seule via `ClubSubscriptionExpiredScreen`, les données sont conservées, l'admin
est redirigé vers la facturation.

Aucune bascule vers une offre gratuite : **il n'y a pas d'offre gratuite permanente**.

---

## 6. Clubs en double — hors périmètre

Si deux coaches de la même structure créent deux clubs, aucun rapprochement n'est proposé.
Ils choisissent lequel conserver et recréent l'équipe dans l'autre.

Pas de détection, pas de suggestion, pas d'endpoint de recherche publique, pas de parcours
de rattachement, pas de fusion. À faible volume, un traitement manuel par le support coûte
moins cher que ce dispositif — et l'endpoint de recherche publique aurait exigé son propre
rate limiter fail-closed, le helper existant étant fail-open
(`src/lib/rate-limit.server.ts:46-52`).

---

## 7. Travaux

### Migrations

1. `subscriptions.team_credits int NULL` avec `CHECK` — additive, sans backfill.
2. Trigger `auto_create_trial_subscription` : `14 days` → `30 days`. **Release dédiée.**
3. `can_create_tournament` : ajout du contrôle `team_credits IS NULL`. **Release dédiée,
   via `_v2` comparée avant substitution** (§9).
4. RPC de création d'équipe avec contrôle de crédits.
5. RPC d'ajout de joueur et d'import avec contrôle de la limite.

### Stripe

- Deux prix : `STRIPE_PRICE_TEAM_CREDIT_MONTHLY` (9,99 €),
  `STRIPE_PRICE_TEAM_CREDIT_YEARLY` (99,99 €), motif env + défaut comme l'existant.
- Checkout avec `quantity`.
- Mise à jour de `quantity` (ajout/retrait de crédit) avec garde §5.3.
- Passage à la formule Club : changement de `price`, `quantity: 1`, `team_credits → NULL`.
- Webhook : lecture de `sub.items.data[0].quantity` → miroir dans `team_credits`. **Aucune
  nouvelle branche** : le flux Club existant traite déjà ces événements.

### Interface

- Choix du nombre de crédits au checkout, avec le tarif calculé.
- Page de facturation : crédits utilisés / disponibles, ajout et retrait, upsell Club à 4.
- Blocages : création d'équipe au-delà des crédits, ajout de joueur au-delà de 25, écran
  d'upsell tournoi.
- Page pricing à trois colonnes, i18n **7 locales**, `bun run check:i18n` vert.

### Tests

- Concurrence : deux créations d'équipe simultanées au dernier crédit → une seule réussit.
- Concurrence : deux ajouts de joueur simultanés à 24/25 → jamais 26.
- Formule Club (`team_credits IS NULL`) : aucun verrou pris, aucune limite.
- Import CSV dépassant la limite → lot entièrement refusé.
- Réduction de crédits avec équipes en excès → refusée.
- Caractérisation : un club existant conserve exactement son comportement actuel.
- Régression tournoi : club à crédits → création refusée ; club en formule Club avec
  abonnement actif → autorisée ; entitlement tournoi → comportement conservé.

---

## 8. Découpage

**Lot 1 — Fondations et essai**
`team_credits`, trigger d'essai à 30 jours (release dédiée), RPC de contrôle des crédits
et de la limite de joueurs, tests de concurrence, tests de caractérisation.

**Lot 2 — Stripe, tournois et interface**
Prix, checkout avec quantité, gestion des crédits, garde de réduction, contrôle tournoi
(release dédiée), écrans, pricing, i18n.

Deux lots au lieu de huit.

---

## 9. Discipline de déploiement

Le modèle est simple, mais **trois objets existants sont modifiés**. Ils gardent la
discipline établie :

- **R1 — une migration sensible à la fois**, déploiement isolé, 24 à 48 h d'observation.
  Le trigger d'essai et `can_create_tournament` partent chacun dans leur propre release,
  jamais ensemble.
- **Ajouter avant de remplacer** — `can_create_tournament_v2` créée puis comparée à
  l'existante sur des cas réels (clubs abonnés, exemptés, organisateurs, superadmins,
  clubs personnels, comptes sans abonnement) avant substitution. L'ancienne définition est
  conservée pour la migration de retour.
- **Contrat de rollback** pour chaque changement sensible : migration aller, migration de
  retour écrite et testée, vérification avant, vérification après, condition d'arrêt,
  métrique d'alerte, procédure de restauration.
- **Feature flag** `team_credits_v1` masquant checkout, pricing et gestion des crédits —
  sans jamais désactiver webhooks, synchronisation Stripe ni lecture des souscriptions
  existantes.
- **Arrêt et revue humaine** après le Lot 1, avant le Lot 2.

---

## 10. Dette préexistante, indépendante de ce chantier

Deux points relevés lors de l'audit, à traiter **séparément** :

**Bug `exempt_until`.** `club_has_active_subscription`
(`20260622120000_subscription_billing_exemption.sql:36`) teste `exempt_from_billing = true`
sans regarder `exempt_until`, alors que `isBillingExempt`
(`src/lib/has-paid-access.ts:22-25`) l'honore. Une exemption expirée donne encore accès.

Ce n'est **plus un prérequis** de ce chantier — il l'était parce que de nouvelles fonctions
de couverture devaient reposer sur une sémantique saine, et ces fonctions n'existent plus.
Il reste un bug réel, à corriger sur son propre calendrier, après inventaire des clubs
concernés et régularisation, dans une release dédiée.

**Dette CI.** Corriger les contrôles bloquants (dont `check:i18n`) avant de s'en servir
comme critères de sortie ; baseline chiffrée pour la dette réellement indépendante.

**Incohérence marketing.** Le site promet 30 jours d'essai, le code en donne 14
(`20260604212414_…sql:12`). La migration du Lot 1 résout cette incohérence.

---

## 11. Décisions actées

```text
Essai : 30 jours, sans carte bancaire, aligné sur la promesse publique existante
Aucune offre gratuite permanente
Limite : 25 joueurs actifs par équipe en formule à crédits
Formule Club : aucune limite de joueurs ni d'équipes
Crédits : 9,99 €/mois ou 99,99 €/an l'unité, plafond DUR à 4
Réduction de crédits : uniquement si les équipes en excès sont archivées
Tournois : bloqués en formule à crédits, participation conservée
Clubs en double : aucun rapprochement, choix manuel de l'utilisateur
team_members.status : non nécessaire en V1
exempt_until : dette indépendante, plus un prérequis
```

**Aucune décision produit ne reste ouverte.**
