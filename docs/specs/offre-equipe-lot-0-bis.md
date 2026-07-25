# Offre Équipe — Lot 0 bis : investigations bloquantes avant implémentation

> Complément au plan d'architecture (`offre-equipe-architecture-plan.md`).
> Ce lot regroupe trois chantiers d'investigation qui doivent aboutir **avant** toute
> écriture de code fonctionnel, parce qu'ils touchent des données de production, des
> invariants de concurrence ou des règles commerciales non encore tranchées.
>
> Aucun de ces trois chantiers ne produit de code fonctionnel : ils produisent des
> décisions, des inventaires et des stratégies validées.

---

## 0 bis.1 — Quotas Découverte et éligibilité en fin d'essai

### Règle décidée

La bascule automatique d'une équipe en fin d'essai vers l'offre Découverte n'est
autorisée que si **les deux quotas** sont respectés au moment de la bascule :

```text
Quota club       : le club possède strictement moins de 2 équipes Découverte actives
Quota utilisateur: le créateur/bénéficiaire de l'équipe ne possède pas déjà
                   une équipe Découverte active
```

Si l'un des deux quotas est atteint :

```text
fin d'essai
→ conservation intégrale des données
→ équipe en lecture seule
→ proposition Offre Équipe ou Offre Club
```

**Aucun grandfathering** : il n'existe aucun mécanisme permettant de dépasser les quotas
Découverte, quelle que soit l'ancienneté du compte ou de l'équipe.

Exemple de référence :

```text
U13 — Découverte, portée par Coach 1
U15 — Découverte, portée par Coach 2
U17 — essai créé par Coach 1

Fin de l'essai U17 :
  quota club     = 2/2 atteint      → refus
  quota Coach 1  = 1/1 atteint      → refus
  → U17 passe en lecture seule (données conservées, upsell affiché)
```

Rappel des règles V1 associées (friction assumée, §0 bis.1.3) :

```text
1 équipe Découverte maximum par utilisateur
2 équipes Découverte maximum par club
1 essai Équipe maximum par utilisateur
```

### 0 bis.1.1 — Ce qu'il faut définir précisément

1. **« Équipe Découverte active »** : définition exacte et requêtable. Proposition —
   une équipe dont la couverture résolue est `discovery`, non archivée
   (`teams.archived_at IS NULL`, `teams.deleted_at IS NULL`).
2. **« Créateur ou bénéficiaire »** : quelle colonne fait foi ? Il n'existe pas
   aujourd'hui de `created_by` sur `teams` (à vérifier au moment de l'implémentation ;
   l'audit n'en a pas relevé). Deux options :
   - ajouter `teams.created_by` (migration additive) ;
   - ou porter le rattachement sur la ligne de couverture Découverte elle-même
     (`discovery_owner_user_id`), ce qui est plus explicite et évite d'interpréter la
     création historique. **Recommandation : la seconde.**
3. **Moment d'évaluation** : à la fin d'essai (job/webhook `trial_will_end` puis
   expiration effective). L'évaluation doit être refaite au moment de la bascule, pas au
   début de l'essai — les quotas peuvent avoir été consommés entre-temps.
4. **Ordre de résolution en cas d'égalité** : si deux essais expirent simultanément dans
   un club à 1 équipe Découverte, laquelle bascule ? Proposition : ordre déterministe par
   `trial_end` puis `created_at` croissants ; la seconde passe en lecture seule.
5. **Libération d'un quota** : que se passe-t-il si une équipe Découverte est archivée ou
   passe en offre payante ? Le quota se libère-t-il, et une équipe en lecture seule
   peut-elle alors réclamer la place libérée ? Proposition V1 : le quota se libère, mais
   **aucune bascule rétroactive automatique** — l'utilisateur doit la demander
   explicitement (évite les effets de bord silencieux et les allers-retours).

### 0 bis.1.2 — Atomicité des quotas

Les deux quotas sont soumis aux mêmes risques de concurrence que la limite de joueurs
(§0 bis.2) : deux fins d'essai simultanées dans le même club pourraient chacune constater
« 1 équipe Découverte » et basculer toutes les deux, produisant 3 équipes Découverte.

La vérification et la bascule doivent donc se faire dans **une seule transaction avec
verrou sur le club** (et sur l'utilisateur bénéficiaire), selon la même stratégie que
§0 bis.2. Test obligatoire : deux bascules concurrentes sur un club à 1 équipe Découverte
→ exactement une bascule réussie.

### 0 bis.1.3 — Annonce de la friction avant la fin du wizard

La restriction est intentionnelle et doit être **annoncée avant la fin du wizard de
création**, pas découverte à la fin de l'essai.

Un coach seul qui crée une deuxième équipe doit donc choisir immédiatement l'offre
Équipe payante — sauf si cette deuxième équipe est créée et portée par un autre coach
éligible du même club.

Message à prévoir (clé i18n, 7 locales), affiché dans le wizard dès que l'utilisateur
crée une équipe qui ne sera pas éligible à Découverte :

> Vous utilisez déjà l'offre Découverte pour une équipe. Cette nouvelle équipe nécessite
> l'offre Équipe (9,99 €/mois), ou peut être portée par un autre coach de votre club.

Le wizard doit distinguer les deux causes de non-éligibilité (quota utilisateur vs quota
club) car la solution proposée diffère.

### 0 bis.1.4 — Livrables du chantier

1. définition requêtable de « équipe Découverte active » ;
2. choix du porteur (`discovery_owner_user_id` recommandé) ;
3. règle d'ordre déterministe en cas de fins d'essai simultanées ;
4. règle de libération de quota ;
5. stratégie transactionnelle de bascule ;
6. maquettes/textes des messages d'annonce dans le wizard et à la fin d'essai.

---

## 0 bis.2 — Contrôle atomique de la limite de joueurs

### Problème

Un simple `count` applicatif suivi d'un `insert` est faux sous écritures concurrentes :

```text
Équipe à 14 joueurs actifs, limite 15
  Requête A : count → 14, OK
  Requête B : count → 14, OK
  Requête A : insert → 15
  Requête B : insert → 16   ← quota dépassé
```

Ce motif est **interdit**. La vérification et l'insertion doivent être atomiques.

### Stratégie retenue

1. **RPC transactionnelle unique** (`SECURITY DEFINER`, `search_path = public`), seul
   chemin autorisé pour ajouter un joueur à une équipe :

```text
add_player_to_team(_team_id, _player_payload)  →  joueur créé | erreur quota
```

   Corps de la fonction, dans une seule transaction :
   - verrou sur l'équipe : `SELECT ... FROM teams WHERE id = _team_id FOR UPDATE`
     (verrou de ligne, sérialise les insertions concurrentes sur la même équipe sans
     bloquer les autres équipes) ;
   - résolution du quota effectif via les entitlements serveur (`null` = illimité →
     court-circuit immédiat, aucun coût pour les offres payantes) ;
   - comptage des joueurs actifs (définition §0 bis.2.2) ;
   - `IF count >= quota THEN RAISE` avec un code d'erreur typé
     (ex. `CLUBERO_PLAYER_QUOTA_EXCEEDED`) exploitable par le front pour afficher
     l'upsell ;
   - insertion et rattachement `team_members` dans la même transaction.

2. **Trigger de défense en profondeur** sur l'insertion de `team_members` (ou de la
   liaison joueur↔équipe), qui recompte et refuse le dépassement. Il couvre tout chemin
   d'écriture qui contournerait la RPC (script, import mal branché, correctif manuel).
   Le trigger est un filet, pas le mécanisme principal : il ne doit pas porter la logique
   commerciale ni les messages utilisateur.

3. **Le contrôle applicatif reste** pour l'ergonomie (désactiver le bouton, afficher le
   compteur), mais n'est jamais la garantie.

### 0 bis.2.1 — Import CSV

**Recommandation retenue : refuser le lot avant insertion lorsqu'il dépasserait le
quota** — l'import est traité comme un lot cohérent, pas ligne par ligne.

Déroulé : dans la même transaction, verrou sur l'équipe → comptage actuel → si
`count + lignes_valides > quota`, rejet du lot entier avec un message indiquant le
nombre de places disponibles et le nombre de lignes soumises. Aucune insertion partielle.

Justification : un import partiel laisse l'utilisateur avec un effectif incomplet et
silencieusement tronqué, difficile à réconcilier avec son fichier source. Le rejet
explicite est plus lisible et plus facile à corriger.

À trancher malgré tout : faut-il proposer une variante « importer les N premières lignes
qui rentrent » en option explicite de l'écran d'import ? (Non recommandé en V1.)

### 0 bis.2.2 — Définition du joueur comptabilisé (à verrouiller)

Constat de l'audit : la table `players` possède `deleted_at` (soft delete) mais **aucun
état « archivé »** ni colonne de statut. Le rattachement à une équipe passe par
`team_members.player_id`. Le prompt évoque « ne pas compter les joueurs archivés » — cet
état n'existe pas aujourd'hui et doit donc être soit créé, soit abandonné au profit du
seul `deleted_at`.

Définition proposée, à valider :

```text
joueur actif d'une équipe =
  ligne team_members (team_id = X, player_id NOT NULL)
  jointe à players
  WHERE players.deleted_at IS NULL
```

Points à trancher :

- faut-il introduire un état « archivé » distinct du soft delete, et si oui, sur
  `players` ou sur `team_members` (un joueur peut être archivé dans une équipe et actif
  dans une autre) ?
- comportement des joueurs temporairement inactifs (blessure, saison suspendue) :
  comptés ou non ? Proposition : **comptés** (ils occupent une place dans l'effectif) —
  sinon la limite devient contournable par un simple marquage.
- anti-contournement archiver/restaurer en boucle : la restauration d'un joueur doit
  repasser par le même contrôle de quota que la création ; journaliser les cycles
  archivage/restauration rapprochés pour détecter les abus.
- transferts entre équipes : l'ajout dans l'équipe cible est soumis au quota de l'équipe
  cible, dans la même transaction que le retrait de l'équipe source.

### 0 bis.2.3 — Tests obligatoires

- **Concurrence** : équipe à 14 joueurs actifs, quota 15, deux insertions simultanées →
  exactement une réussite, une erreur `CLUBERO_PLAYER_QUOTA_EXCEEDED`, effectif final
  = 15. Jamais 16.
- Import de 10 lignes sur une équipe à 8/15 → lot entièrement rejeté, effectif inchangé
  à 8.
- Import de 5 lignes sur une équipe à 8/15 → 13 joueurs, succès.
- Restauration d'un joueur soft-deleted sur une équipe déjà à 15 → refus.
- Transfert vers une équipe pleine → refus, joueur conservé dans l'équipe source.
- Offre Équipe / Club (quota `null`) → aucune limite, aucun surcoût de comptage.
- Trigger de défense : insertion directe en base contournant la RPC → refusée.

### 0 bis.2.4 — Livrables du chantier

1. signature et corps de la RPC `add_player_to_team` ;
2. définition verrouillée du « joueur actif » et décision sur l'état « archivé » ;
3. stratégie d'import (lot atomique) et messages associés ;
4. trigger de défense en profondeur ;
5. jeu de tests de concurrence (avec la méthode d'exécution : deux transactions
   simultanées réelles, pas une simulation séquentielle).

---

## 0 bis.3 — Audit préalable à la correction de `exempt_until`

### Constat vérifié dans le code

Il existe une divergence entre la logique SQL et la logique applicative :

| Couche | Fichier | Comportement |
|---|---|---|
| SQL | `supabase/migrations/20260622120000_subscription_billing_exemption.sql:36` | `s.exempt_from_billing = true` — **`exempt_until` n'est pas testé** |
| TypeScript | `src/lib/has-paid-access.ts:22-25` (`isBillingExempt`) | honore `exempt_until` : accès refusé si la date est passée |

La colonne `exempt_until` a été ajoutée **après** la fonction, par
`supabase/migrations/20260622170729_0ff402e5-….sql:1`, sans mise à jour de
`club_has_active_subscription`. Aucune migration ultérieure ne redéfinit cette fonction.

Conséquence : un club dont l'exemption est **expirée** conserve un accès via toutes les
voies SQL — RLS s'appuyant sur `club_has_active_subscription`, et
`can_create_tournament` (`…120000_….sql:95`) — alors que la couche applicative le
considère comme non exempté. Corriger la fonction SQL revient donc à **couper l'accès en
production** à ces clubs, potentiellement sans préavis.

### Inventaire obligatoire avant tout correctif

Produire la liste des clubs correspondant à :

```sql
SELECT s.club_id, c.name, s.exempt_until, s.exempt_reason,
       s.exempt_granted_at, s.exempt_granted_by
FROM public.subscriptions s
JOIN public.clubs c ON c.id = s.club_id
WHERE s.exempt_from_billing = true
  AND s.exempt_until IS NOT NULL
  AND s.exempt_until <= now();
```

Pour chaque club de la liste, documenter :

1. identifiant ;
2. nom ;
3. date d'expiration de l'exemption ;
4. motif (`exempt_reason`) et qui l'a accordée (`exempt_granted_by`, `exempt_granted_at`) ;
5. **accès actuellement obtenu à cause du bug** (fonctionnalités Club, création de
   tournois, données accessibles) ;
6. impact de la correction (ce que le club perdrait immédiatement) ;
7. action de régularisation requise (prolonger l'exemption, convertir en abonnement
   payant, contacter le club, laisser expirer avec préavis).

Enrichir avec le volume d'activité récente (dernière connexion, équipes actives,
événements à venir) pour distinguer les clubs réellement actifs des comptes dormants —
un club dormant peut être coupé sans précaution, un club actif en pleine saison non.

### Règle de déploiement

**Ne pas déployer le correctif SQL avant décision explicite sur ces données.**

Séquence imposée :

1. produire l'inventaire (lecture seule, aucun changement) ;
2. décider club par club de l'action de régularisation ;
3. appliquer les régularisations (prolongation d'`exempt_until`, souscription, préavis
   envoyé) ;
4. seulement ensuite, déployer la correction de `club_has_active_subscription` pour
   qu'elle teste `exempt_until` de la même manière que `isBillingExempt` ;
5. vérifier après déploiement que la liste des clubs ayant perdu l'accès correspond
   exactement à la liste attendue.

### Pourquoi ce chantier est dans le périmètre de l'offre Équipe

La nouvelle logique de couverture (`get_team_coverage`, `team_has_paid_access`) doit
s'appuyer sur une sémantique d'exemption cohérente entre SQL et TypeScript. Livrer
l'offre Équipe sur une base incohérente propagerait le bug aux nouvelles fonctions.

Deux options de séquencement, à trancher :

- **Option 1 (recommandée)** : traiter l'audit et le correctif en amont du Lot 1, pour
  que la nouvelle couverture soit bâtie sur une sémantique saine.
- **Option 2** : livrer les nouvelles fonctions en honorant `exempt_until` dès le départ
  (donc correctes), et traiter la correction de l'existant séparément — au prix d'une
  incohérence temporaire entre l'ancienne et la nouvelle fonction.

### Livrables du chantier

1. l'inventaire complet renseigné (les 7 colonnes ci-dessus par club) ;
2. la décision de régularisation par club ;
3. la migration corrective (rédigée mais non déployée avant validation) ;
4. la séquence de déploiement et le contrôle post-déploiement ;
5. le choix de séquencement (Option 1 ou 2).

---

## Récapitulatif des sorties attendues du Lot 0 bis

| Chantier | Sortie bloquante |
|---|---|
| 0 bis.1 Quotas Découverte | Définitions requêtables, porteur du quota, ordre déterministe, règle de libération, stratégie transactionnelle, textes du wizard |
| 0 bis.2 Limite de joueurs | RPC atomique spécifiée, définition du joueur actif, stratégie d'import (lot atomique), trigger de défense, tests de concurrence |
| 0 bis.3 Audit `exempt_until` | Inventaire renseigné, décisions de régularisation, migration corrective non déployée, séquence de déploiement |

Aucun code fonctionnel n'est écrit dans ce lot. Le Lot 1 ne démarre qu'après validation
des trois sorties.
