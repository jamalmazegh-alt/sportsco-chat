# Offre Équipe — Ordre d'implémentation imposé

> Document d'exécution. Il ne décrit **pas** quoi construire (voir
> `offre-equipe-team-plan.md`) ni comment le concevoir (voir
> `offre-equipe-architecture-plan.md`), mais **dans quel ordre écrire le code**.
>
> **Règle absolue : ne jamais développer « par fonctionnalité ».** Sur un chantier de
> cette taille, développer une fonctionnalité de bout en bout (SQL + serveur + UI) avant
> la suivante produit des couches incohérentes, des RLS rétro-ajoutées et des tests
> écrits après coup. Chaque étape ci-dessous s'appuie sur les précédentes et ne démarre
> qu'une fois la précédente terminée et vérifiée.

---

## Séquence globale

```text
Lot 0 bis  (inventaires + régularisation exempt_until + dette CI)
   ↓
Lot 1 → Lot 2 → Lot 3 → Lot 4 → Lot 5 → Lot 6 → Lot 7 → Lot 8
```

**À l'intérieur de chaque lot, l'ordre des 8 étapes est le même :**

```text
1. migration SQL
   ↓
2. server functions
   ↓
3. webhook
   ↓
4. RLS
   ↓
5. UI
   ↓
6. tests
   ↓
7. feature flag
   ↓
8. merge
```

Un lot n'est pas « fini » tant que les 8 étapes ne sont pas franchies. On ne démarre pas
le lot N+1 avec des étapes du lot N en suspens.

---

## Pourquoi cet ordre

| Étape | Pourquoi à cette place |
|---|---|
| 1. SQL | Le schéma est le contrat. Tout le reste en dépend ; le changer après avoir écrit du serveur et de l'UI oblige à tout reprendre. |
| 2. Server functions | Elles s'appuient sur le schéma et définissent la surface d'appel dont l'UI aura besoin. Écrites avant l'UI, elles ne sont pas déformées par des contraintes d'affichage. |
| 3. Webhook | Il écrit dans les mêmes tables que les server functions et doit partager leurs helpers. Écrit après, il les réutilise ; écrit avant, il les duplique. |
| 4. RLS | Se pose **après** que tous les chemins d'écriture existent (serveur + webhook), sinon on écrit des policies pour des chemins qu'on n'a pas encore identifiés. |
| 5. UI | Consomme une surface serveur déjà stable et déjà sécurisée. L'UI ne doit jamais être ce qui révèle un manque de garde serveur. |
| 6. Tests | Après l'UI, ils couvrent la chaîne complète. Les tests de concurrence et de RLS, eux, sont écrits **avec** leurs étapes (1 et 4) — voir ci-dessous. |
| 7. Feature flag | Posé en dernier avant merge, une fois qu'il y a quelque chose à masquer. |
| 8. Merge | Rien ne part sur la branche principale à moitié. |

**Exception à l'étape 6.** Trois familles de tests ne sont pas repoussées à la fin :

- les **tests de concurrence** (quotas, imports) s'écrivent avec l'étape 1 — ils valident
  la migration elle-même ;
- les **tests RLS** s'écrivent avec l'étape 4 — une policy sans son test n'est pas
  livrée ;
- les **tests d'idempotence webhook** s'écrivent avec l'étape 3.

L'étape 6 couvre le reste : unitaires métier, intégration, E2E, non-régression.

---

## Lot 0 bis — prérequis bloquant

Aucune étape SQL/serveur/UI. Trois travaux, dans cet ordre :

```text
1. Inventaires
   1a. mutations directes Supabase (56 fichiers) → classification A / A′ / B / C / D
   1b. lecteurs de subscriptions (39 sites) → comportement si aucune ligne
   ↓
2. Régularisation exempt_until
   2a. inventaire des exemptions expirées
   2b. analyse d'impact club par club
   2c. régularisation manuelle des données
   2d. communication éventuelle aux clubs
   2e. correction SQL de club_has_active_subscription
   2f. tests de non-régression
   ↓
3. Dette CI
   3a. correction des contrôles bloquants (dont check:i18n)
   3b. baseline chiffrée de la dette indépendante restante
```

L'ordre 1 → 2 → 3 n'est pas indifférent : l'inventaire des lecteurs de `subscriptions`
(1b) éclaire l'analyse d'impact du correctif `exempt_until` (2b).

**Le Lot 1 ne démarre pas avant 2f et 3a.** Corriger `exempt_until` pendant le Lot 1
mélangerait une correction d'accès en production avec un nouveau modèle de facturation.

---

## Lot 1 — Modèle de couverture

Le lot le plus structurant. Tout le reste en dépend.

```text
1. SQL
   1a. clubs.coverage_mode (+ city, postal_code si absentes)
   1b. ajustement du trigger auto_create_trial_subscription (early return per_team)
   1c. teams.created_by_user_id
   1d. team_members.status + index (après vérification des doublons team_id/player_id)
   1e. team_subscriptions + index partiels
   1f. team_discovery_coverage + index partiels
   1g. club_plan_migrations, team_billing_events
   1h. fonctions de couverture (get_team_coverage, get_team_access_state,
       team_has_paid_access, team_can_manage_content, team_can_operate_events,
       team_can_respond, count_active_players, can_manage_team_billing…)
   1i. helpers d'exemption (club_ / team_billing_exemption_is_active)
   1j. garde-fous DB (anti-abonnement Club sur per_team, cohérence club_id,
       quota joueurs, quota Découverte club)
   1k. can_create_tournament avec contrôle explicite de coverage_mode
   → tests de concurrence + tests de régression tournoi écrits ICI

2. Server functions
   2a. team-coverage.server.ts (couverture, état, entitlements)
   2b. hook client useTeamEntitlements

3. Webhook — aucun changement dans ce lot

4. RLS
   4a. policies des nouvelles tables + REVOKE colonnes Stripe
   → tests RLS écrits ICI

5. UI — aucune dans ce lot (modèle uniquement)

6. Tests — unitaires de dérivation d'état et d'entitlements

7. Feature flag — création de team_plan_v1 (inactif)

8. Merge
```

**Point de contrôle avant le Lot 2 :** un club `coverage_mode='per_team'` avec N équipes
couvertes ne doit débloquer ni les fonctionnalités Club ni la création de tournois, y
compris si une ligne `subscriptions` est injectée manuellement.

---

## Lot 2 — Onboarding et rattachement simple

```text
1. SQL — club_attach_requests, RPC search_public_clubs (projection stricte)
2. Server functions — club-search.functions.ts (rate limit fail-closed dédié),
                      discovery.server.ts, création club + première équipe
3. Webhook — aucun
4. RLS — policies club_attach_requests
5. UI — 4 choix d'onboarding, recherche de club, formulaire club, première équipe,
        annonce des quotas avant la fin du wizard
6. Tests — sécurité de la recherche (fail-closed sous erreur DB simulée), E2E onboarding
7. Feature flag — le nouveau parcours passe derrière team_plan_v1
8. Merge
```

---

## Lot 3 — Stripe et facturation Équipe

```text
1. SQL — colonnes de grâce si non posées au Lot 1 (grace_started_at, grace_end)
2. Server functions — team-billing.functions.ts : réconciliation Stripe AVANT checkout
                      (traite le blocage incomplete), portail, périodicité, annulation,
                      réactivation, exemptions
3. Webhook — branche metadata.purpose="team_plan" ; écriture conditionnelle de
             grace_started_at (posé une seule fois) ; réconciliation par
             stripe_subscription_id
   → tests d'idempotence + « 3 échecs successifs → grace_end inchangé » écrits ICI
4. RLS — get_team_billing_status pour les membres non-payeurs
5. UI — page Facturation et abonnements, bannières par état
6. Tests — checkout, abandon, reprise, incomplete_expired, échec, annulation, rejeu
7. Feature flag
8. Merge
```

---

## Lot 4 — Équipes supplémentaires

```text
1. SQL — aucune (le modèle du Lot 1 suffit)
2. Server functions — ajout d'équipe dans le club courant, calcul de l'upsell normalisé
3. Webhook — aucun
4. RLS — aucune
5. UI — bouton Ajouter une équipe, écran de synthèse, upsell Club (seuils 3 / 4 / 5)
6. Tests — multi-équipes, périodicités mixtes, quotas Découverte par créateur et par club
7. Feature flag
8. Merge
```

---

## Lot 5 — Enforcement transverse (lot à haut risque)

**Le lot le plus dangereux du chantier.** Il modifie des policies existantes sur des
chemins déjà utilisés en production.

Ordre imposé, plus strict que le schéma général :

```text
1. Reprendre l'inventaire du Lot 0 bis §28.2 et figer la classification
   au NIVEAU DE L'ACTION, pas de l'écran
   ↓
2. Traiter table par table, pas écran par écran
   ↓
3. Pour CHAQUE table :
   3a. écrire le test RLS (cas autorisé + refusé + cross-club) — AVANT la policy
   3b. modifier la policy (team_can_manage_content sur la catégorie A uniquement)
   3c. exécuter le test
   3d. vérifier explicitement que A′ et B passent toujours
   ↓
4. UI — écrans de blocage, upsell tournoi, limite de joueurs
5. i18n — 7 locales
6. Tests E2E — état restricted : réponse à convocation OK, annulation d'événement OK,
              création bloquée
7. Feature flag
8. Merge
```

**Ne jamais modifier plusieurs policies dans un même commit.** Une policy par commit, avec
son test. C'est le seul lot où cette contrainte s'applique, parce que c'est le seul où une
erreur bloque silencieusement des utilisateurs légitimes.

---

## Lot 6 — Billing owner et RGPD

```text
1. SQL — user_has_active_billing_responsibilities
2. Server functions — transfer_team_billing_owner (transactionnel, journalisé, notifié),
                      modification de privacy.functions (contrôle avant suppression),
                      constantes de durée de conservation
3. Webhook — aucun
4. RLS — vérification que can_manage_team_billing reste le SEUL point de décision
         (aucune comparaison directe à billing_owner_user_id — prépare billing_delegates)
5. UI — transfert, blocage du départ, message RGPD
6. Tests — 6 cas de suppression du §27.5
7. Feature flag
8. Merge
```

---

## Lot 7 — Passage vers l'offre Club

```text
1. SQL — états de club_plan_migrations si non posés au Lot 1
2. Server functions — saga en 11 étapes, idempotente, reprenable
3. Webhook — déclenchement de la saga sur customer.subscription.created Club
             pour un club per_team
4. RLS — visibilité superadmin des sagas bloquées
5. UI — écran de passage, affichage des dates et montants Stripe
6. Tests — 8 scénarios Stripe, échec partiel, reprise manuelle, rejeu
7. Feature flag séparé
8. Merge
```

**Invariant à vérifier explicitement en test :** la couverture Club est active **avant**
tout arrêt d'abonnement Équipe. Aucune fenêtre sans couverture.

---

## Lot 8 — Rattachement d'une équipe à un autre club

```text
1. SQL — mise à jour en cascade de team_subscriptions.club_id
2. Server functions — invitation, acceptation, détection et BLOCAGE des conflits
3. Webhook — aucun
4. RLS — impact du changement de club_id sur toutes les tables filles
5. UI — invitation, écran de conséquences, message de conflit
6. Tests — cross-club, conservation des données, conflit bloqué
7. Feature flag séparé
8. Merge
```

**Rappel de périmètre : aucune fusion de clubs.** Le rapprochement de deux clubs est un
chantier ultérieur indépendant.

---

## Règles transverses, valables à chaque étape

1. **Une migration par objet logique**, jamais un fichier fourre-tout — le rollback doit
   pouvoir être partiel.
2. **Aucune policy sans son test** dans le même commit.
3. **`bun run check:guards`** après chaque ajout de server function.
4. **`bun run check:i18n`** vert avant tout merge touchant l'UI.
5. **Ne jamais comparer directement `billing_owner_user_id` à l'utilisateur courant** :
   toujours passer par `can_manage_team_billing()`. C'est ce qui rendra les délégués de
   facturation possibles sans refonte.
6. **Ne jamais écrire `if plan === "team"` dans le front** : toujours consommer les
   entitlements.
7. **Résoudre le quota avant de prendre un verrou** — la contention n'est justifiée que
   là où une limite existe.
8. À la fin de chaque lot, relire les critères d'acceptation du §31 de la spec qui
   concernent ce lot, et cocher explicitement.

---

## Ce qui doit faire arrêter le développement

Interrompre et remonter le point plutôt que de contourner :

- une migration exige de modifier la contrainte UNIQUE sur `subscriptions.club_id` ;
- un besoin apparaît de rendre `teams.club_id` nullable ;
- `club_has_active_subscription` devrait changer de sémantique ;
- une policy de catégorie B ou A′ semble devoir être bloquée ;
- un test de concurrence échoue de manière intermittente ;
- un écran affiche une erreur brute Stripe ou SQL à l'utilisateur ;
- la seule façon de faire passer un test est de désactiver une RLS.

Chacun de ces signaux indique que la spécification est en train d'être contournée, pas
appliquée.
