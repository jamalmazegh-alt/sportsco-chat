# Offre Équipe — Ordre d'implémentation et stratégie de déploiement

> Document d'exécution. Il ne décrit **pas** quoi construire (voir
> `offre-equipe-team-plan.md`) ni comment le concevoir (voir
> `offre-equipe-architecture-plan.md`), mais **dans quel ordre écrire et déployer le
> code** sur une application déjà en production et stable.
>
> **Règle fondatrice :**
>
> ```text
> Ajouter d'abord sans remplacer.
> Observer avant d'activer.
> Activer sur des clubs pilotes.
> Ne modifier les RLS et fonctions historiques qu'en dernier.
> ```
>
> Ce document remplace une version antérieure dont l'ordre était trop agressif : le
> feature flag y arrivait en avant-dernière étape, ce qui ne protégeait ni les triggers,
> ni les policies, ni les fonctions SQL remplacées.

---

## 0. Pourquoi un feature flag en fin de lot ne suffit pas

Un flag posé après la migration masque l'interface. Il ne protège **pas** contre :

- un trigger SQL incorrect ;
- une fonction SQL existante remplacée ;
- une policy RLS modifiée ;
- un webhook qui route mal un événement ;
- une migration qui fait échouer une requête existante ;
- une colonne ou un index qui change le comportement de production.

Ces changements sont actifs **dès le déploiement de la migration**, indépendamment de
l'UI. Il faut donc un **flag de comportement serveur, posé avant les migrations
sensibles**, et une stratégie de déploiement sombre pour tout ce qui touche à des objets
SQL existants.

---

## 0 bis. Quatre règles non négociables

Elles priment sur tout le reste de ce document en cas de doute.

### R1 — Une migration à la fois, jamais de « mega migration »

Chaque migration touchant une table critique (`team_members`, `clubs`, `subscriptions`,
`teams`) est **indépendante** :

```text
Migration → Déploiement → 24 à 48 h d'observation → Migration suivante
```

Ne jamais regrouper plusieurs `ALTER TABLE` sur des tables différentes dans un même
fichier, ni enchaîner deux migrations sensibles dans la même fenêtre de déploiement. Si
un incident survient, on doit pouvoir désigner **une seule** migration comme cause.

### R2 — La branche historique du webhook reste la branche par défaut, en permanence

**Invariant permanent, sans condition ni date d'expiration :**

```text
metadata.purpose = "team_plan"                          → branche Équipe
toute autre valeur, valeur absente, valeur inconnue     → branche historique, inchangée
```

Cela reste vrai lorsque Clubero aura 10 abonnements Équipe comme lorsqu'il en aura 1 000.
Le routage se fait **exclusivement** sur la présence et la valeur exacte de
`metadata.purpose`. Le nouveau code n'est jamais atteint par défaut : un événement mal
formé, une métadonnée manquante, une valeur inconnue ou un événement ancien rejoué
retombent tous sur le chemin existant.

Corollaire : la résolution de secours par `stripe_subscription_id` s'applique
**uniquement à l'intérieur** de la branche `team_plan`. Elle ne doit jamais servir à
décider d'y entrer — ce serait une porte d'entrée détournée vers le nouveau code.

**Test de non-régression initial, distinct de l'invariant.** Tant qu'aucune ligne
`team_subscriptions` n'existe en production, les effets du webhook doivent être
**strictement identiques** à aujourd'hui. C'est une vérification supplémentaire au
démarrage, **pas** la condition de routage : elle ne cesse pas de s'appliquer, elle cesse
simplement d'être observable une fois la première souscription Équipe créée.

Avant tout déploiement du webhook modifié : rejouer un échantillon d'événements Stripe
réels antérieurs au chantier et vérifier que les écritures produites sont identiques à
celles du code actuel.

C'est le composant qui peut casser le plus **discrètement** : une erreur ici ne se voit pas
dans l'UI, elle se voit sur les abonnements des clubs existants, plusieurs jours après.

### R3 — Mode sombre obligatoire jusqu'à zéro divergence

Pour toute nouvelle fonction de couverture (`get_team_coverage`, `team_has_paid_access`,
`team_can_manage_content`, `team_can_operate_events`, `team_can_respond`,
`get_team_access_state`) :

```text
ancienne logique  → DÉCIDE
nouvelle logique  → calculée
si différent      → journalisé
                  → l'ANCIENNE décide quand même
```

Cette obligation ne se lève pas au bout d'un délai, mais **à l'atteinte de zéro divergence
inexpliquée** sur une période d'observation continue. Une divergence « comprise mais
acceptée » n'est pas une divergence résolue : soit la nouvelle fonction est corrigée, soit
l'écart est documenté comme changement de comportement **voulu**, validé explicitement.

### R4 — Arrêt obligatoire après chaque phase

**Ne jamais développer les huit lots d'un seul tenant.**

```text
Phase A → ARRÊT → revue humaine → autorisation explicite
Phase B → ARRÊT → revue humaine → autorisation explicite
Phase C → ARRÊT → revue humaine → autorisation explicite
Phase D → ARRÊT → revue humaine → autorisation explicite
Phase E
```

Aucune phase ne s'enchaîne automatiquement sur la précédente, même si tous les tests
passent, même si le calendrier le voudrait, même si la phase suivante paraît triviale.

> **Instruction directe à tout agent travaillant sur ce chantier :** à la fin d'une phase,
> s'arrêter, résumer ce qui a été fait, lister ce qui reste, et **attendre une
> autorisation explicite**. Ne pas enchaîner. Ne pas « prendre de l'avance sur la phase
> suivante pendant que la revue est en cours ». La discipline d'exécution est le dernier
> garde-fou, et c'est celui qu'aucun document ne peut imposer à votre place.

---

## 1. Séquence par phases

Les huit lots fonctionnels sont regroupés en cinq phases de déploiement. **La phase est
l'unité de décision**, pas le lot : on ne passe pas à la suivante sans examen des
résultats de la précédente.

```text
Phase A — Sans impact utilisateur          (additif pur)
   ↓  ← ARRÊT OBLIGATOIRE — revue humaine — autorisation explicite (R4)
Phase B — Mode sombre                      (calcul parallèle, aucune décision)
   ↓  ← ARRÊT — revue des divergences — zéro divergence inexpliquée exigée (R3)
Phase C — Nouveau parcours uniquement      (clubs per_team neufs, bêta restreinte)
   ↓  ← ARRÊT — revue humaine — autorisation explicite
Phase D — Enforcement                      (quotas, lecture seule, policies A)
   ↓  ← ARRÊT — revue humaine — autorisation explicite
Phase E — Migration Équipe → Club          (après semaines de stabilité)
```

Chaque flèche est un point d'arrêt dur, pas une transition. Le critère de sortie d'une
phase est une **autorisation humaine explicite**, pas la réussite des tests.

### Phase A — Sans impact sur les utilisateurs

Autorisé : inventaires ; correction de la dette CI ; **nouvelles** tables ; **nouvelles**
colonnes avec DEFAULT ; fonctions suffixées `_v2` **jamais appelées** ; tests.

Interdit : modifier une policy existante ; modifier un trigger existant ; remplacer une
fonction SQL existante ; créer une contrainte ou un index unique sur une table existante
sans la procédure du §3.1.

Le trigger `auto_create_trial_subscription` et `can_create_tournament` font l'objet de
**releases dédiées et isolées**, jamais mêlées au reste (§3.2 et §3.3).

### Phase B — Mode sombre

Les nouvelles fonctions de couverture sont **calculées mais ne décident rien** (R3) :

```text
ancien_droit  = logique actuelle          → DÉCIDE
nouveau_droit = get_team_coverage etc.    → calculé, journalisé, ne décide pas
divergence    → journalisée, jamais bloquante
```

Aucun utilisateur n'est bloqué par la nouvelle logique.

**Critère de sortie : zéro divergence inexpliquée**, pas une durée écoulée. Chaque écart
est soit corrigé dans la nouvelle fonction, soit documenté comme changement de
comportement voulu et validé explicitement. Une divergence « comprise mais laissée en
l'état » ne compte pas comme résolue.

À instrumenter : volume de divergences par type, par club, par état de couverture. Un
écart isolé sur un club atypique et un écart systématique sur toute une catégorie ne se
traitent pas de la même façon — et seul le comptage permet de les distinguer.

### Phase C — Nouveau parcours uniquement

Activation pour les **nouveaux** clubs `coverage_mode='per_team'` seulement. **Aucun
changement de comportement pour les clubs existants.** Quelques bêta-testeurs.

### Phase D — Enforcement

Quotas, lecture seule, policies de catégorie A. **Activation club par club**, jamais
globale d'un coup.

### Phase E — Migration Équipe → Club

Seulement après plusieurs semaines de stabilité du modèle Équipe en réel. Ne pas
développer ce flux avant d'avoir validé en production le checkout Équipe, les webhooks et
la réconciliation. La saga est bien conçue, mais elle manipule des abonnements réels : sa
correction ne se démontre pas sur un environnement de test.

---

## 2. Ordre à l'intérieur de chaque lot

Remplace l'ancienne séquence en 8 étapes :

```text
1.  Tests de référence de l'existant       ← capture le comportement AVANT
2.  Feature flag serveur, inactif           ← posé AVANT toute migration sensible
3.  Migration additive compatible           ← rien de remplacé, rien de contraint
4.  Déploiement en mode sombre              ← nouvelles fonctions calculées, non décisives
5.  Vérification en production              ← divergences analysées
6.  Server functions, non appelées
7.  Tests
8.  Activation interne uniquement           ← équipe Clubero
9.  Activation bêta progressive             ← clubs pilotes nommés
10. Activation générale
```

L'étape 1 est la plus souvent oubliée : **avant de modifier quoi que ce soit, écrire les
tests qui capturent le comportement actuel**, y compris ses bizarreries. Sans eux, on ne
peut pas distinguer une régression d'un changement voulu.

La RLS existante n'est modifiée qu'après validation du nouveau modèle en mode sombre.

Trois familles de tests restent écrites avec l'étape qu'elles valident : concurrence
(avec la migration), RLS (avec la policy), idempotence webhook (avec le webhook).

---

## 3. Procédures pour les changements à haut risque

### 3.1 Index unique sur `team_members (team_id, player_id)`

Un index unique sur une table de production peut échouer au déploiement, révéler des
doublons fonctionnellement légitimes, ou bloquer une opération existante qui recrée
aujourd'hui une ligne d'appartenance.

Vérifier l'absence de doublons ne suffit pas. Procédure imposée :

```text
1. inventaire exact des doublons (nombre, clubs, équipes, ancienneté)
2. détermination de leur CAUSE (bug ? parcours légitime ? import ? reprise de données ?)
3. vérification des références associées — laquelle des lignes porte l'historique
   attendu (convocations, présences, compositions) ?
4. correction dans une migration DISTINCTE, déployée seule
5. surveillance pendant plusieurs jours — les doublons réapparaissent-ils ?
6. création de l'index en dernier, seulement si (5) est propre
```

**Ne jamais supprimer automatiquement « la ligne en trop »** sans savoir laquelle porte
l'historique. Si les doublons se recréent après l'étape 4, c'est qu'un parcours applicatif
les produit : l'index le ferait échouer en production.

Si l'étape 2 révèle des doublons légitimes, **renoncer à l'index unique** et compter les
joueurs distincts autrement. La contrainte est un confort, pas une exigence produit.

### 3.2 Trigger `auto_create_trial_subscription`

Release **dédiée**, jamais mêlée à d'autres changements.

Tester les créations de club provenant de **tous** les chemins existants : onboarding
Club ; parcours organisateur de tournoi ; superadmin ; scripts et tests ; toute RPC créant
un club ; invitations et parcours indirects.

**Protection supplémentaire imposée.** Le trigger est déployé avant le nouvel onboarding,
mais **aucun code existant ne doit pouvoir écrire `coverage_mode='per_team'`** :

- la valeur n'est settable que par une **RPC dédiée**, elle-même derrière un flag ;
- un trigger `BEFORE UPDATE` refuse tout passage à `per_team` hors de cette RPC ;
- sinon, un bug front ou un appel direct créerait un club sans essai Club, donc verrouillé
  immédiatement pour son propriétaire.

### 3.3 `can_create_tournament`

Cette fonction est utilisée en production. **Ne pas la remplacer directement.**

```text
1. créer can_create_tournament_v2 (avec le contrôle coverage_mode)
2. laisser can_create_tournament INCHANGÉE et décisive
3. comparer les deux sur des cas réels ou un snapshot anonymisé :
     - tous les clubs abonnés
     - les clubs exemptés
     - les organisateurs de tournoi (entitlements single et annual)
     - les superadmins
     - les clubs personnels (is_personal)
     - les comptes sans abonnement
     - les clubs anciens aux données atypiques
4. expliquer CHAQUE divergence
5. remplacer la fonction publique seulement ensuite
6. conserver le SQL de l'ancienne définition pour la migration de retour
```

Les clubs personnels sont le cas le plus susceptible de diverger : ils n'ont pas de
souscription et leur `coverage_mode` par défaut sera `'club'`.

### 3.4 Fonctions centrales de couverture

`get_team_coverage`, `get_team_access_state`, `team_has_paid_access`,
`team_can_manage_content`, `team_can_operate_events`, `team_can_respond` **ne remplacent
aucun contrôle existant à leur mise en service**.

Mode sombre obligatoire (Phase B) : l'ancien droit décide, le nouveau est calculé et
journalisé, toute divergence est tracée sans bloquer personne. C'est le garde-fou le plus
important de tout le chantier, parce que ces fonctions finiront par gouverner l'accès de
**tous** les clubs, y compris ceux qui n'utiliseront jamais l'offre Équipe.

### 3.5 Correctif `exempt_until` — chantier distinct

**Ce correctif n'est plus un prérequis du chantier Offre Équipe.** C'est un chantier
correctif **indépendant**, avec sa **propre release**, observé avant le démarrage du
Lot 1.

Commits distincts ne suffisent pas : **déploiements distincts**. Ne jamais livrer le
correctif `exempt_until` et les fondations de l'offre Équipe dans la même release — sinon,
en cas d'incident, on ne saura pas lequel des deux l'a causé, et le rollback de l'un
emportera l'autre.

Séquence inchangée par ailleurs : inventaire → analyse club par club → régularisation →
communication éventuelle → correction SQL → observation → puis, séparément, Lot 1.

Les nouvelles fonctions de couverture honorent `exempt_until` dès leur écriture, quel que
soit l'état de l'ancienne.

---

## 4. Fail-open commercial sur les clubs historiques

Au démarrage de la Phase D, en cas d'incertitude sur le statut d'une équipe existante :
**conserver les droits actuels et journaliser l'anomalie**.

```text
get_team_coverage(équipe historique) retourne 'none' de façon inattendue
→ NE PAS bloquer
→ journaliser, alerter, conserver les droits actuels
```

Le risque commercial d'une équipe gratuite qui publie un message de trop pendant quelques
jours est négligeable. Le risque fonctionnel de bloquer des réponses aux convocations, des
déclarations d'indisponibilité, des parents, l'annulation d'un événement ou les coaches
d'un club abonné est, lui, immédiat et visible.

**Fail-open commercial plutôt que fail-closed fonctionnel** sur les clubs antérieurs au
chantier. Cette tolérance est temporaire et se retire club par club, une fois le statut
vérifié.

> Cette règle ne s'applique **pas** aux nouveaux clubs `per_team`, ni aux garde-fous de
> sécurité (accès aux données d'un autre club, exposition d'identifiants Stripe, création
> de tournoi), qui restent fail-closed en toutes circonstances.

---

## 5. Contrat de rollback par couche

Le rollback n'est pas « flag off ». Un flag ne ramène en arrière ni un trigger, ni une
policy, ni une fonction remplacée, ni un index, ni des données déjà écrites par un
webhook, ni une opération Stripe.

**Chaque changement sensible doit être livré avec les sept éléments suivants :**

```text
1. Migration aller
2. Migration de retour (écrite ET testée, pas seulement envisagée)
3. Requête de vérification AVANT déploiement
4. Requête de vérification APRÈS déploiement
5. Condition d'arrêt du déploiement
6. Métrique d'alerte
7. Procédure de restauration
```

Pour les changements SQL :

- conserver le SQL de l'ancienne définition de chaque fonction remplacée ;
- conserver la définition des anciennes policies ;
- prévoir une migration de restauration **testée**, pas supposée ;
- **ne jamais supprimer immédiatement** une ancienne colonne ou fonction — la suppression
  est un chantier ultérieur, après période d'observation.

Pour Stripe :

- **ne pas compter sur un rollback logiciel pour annuler une opération financière** ;
- toute action irréversible (annulation d'abonnement, facturation, prorata) est derrière
  un flag séparé et une activation volontaire ;
- un webhook ayant déjà écrit ne se « dé-écrit » pas : prévoir la réconciliation, pas
  l'annulation.

---

## 6. Lot 5 — zone rouge, procédure renforcée

« Une policy par commit avec son test » reste nécessaire, mais **insuffisant si chaque
commit est déployé à tout le monde immédiatement**.

```text
policy actuelle CONSERVÉE
  +
nouvelle fonction évaluée en shadow mode
  +
tests sur copie de production anonymisée
  +
activation sur UN club pilote
  +
activation sur quelques clubs bêta
  +
activation générale
```

Traiter **table par table**, jamais écran par écran. Pour chaque table : test RLS écrit
avant la policy, modification, exécution du test, puis vérification **explicite** que les
catégories A′ et B passent toujours.

La classification A / A′ / B doit être figée au **niveau de l'action**, pas de l'écran :
« modifier un événement » relève de A (changer le lieu) ou de A′ (annuler), et ces deux
chemins cohabitent aujourd'hui dans les mêmes fichiers.

---

## 7. Périmètre autorisé à ce stade

**Autorisé maintenant :**

1. Lot 0 bis — inventaires (mutations directes, lecteurs de `subscriptions`) ;
2. correction de la dette CI bloquante ;
3. création des **nouvelles** tables et des fonctions suffixées `_v2`, **sans aucune
   utilisation** ;
4. tests et mise en place du mode sombre.

**Puis arrêt et examen des résultats.**

**Non autorisé sans nouvelle validation explicite :**

- toute modification d'une policy RLS existante ;
- toute modification d'un trigger existant ;
- tout remplacement d'une fonction SQL existante ;
- toute création d'index unique ou de contrainte sur une table existante ;
- tout changement de droits effectif en production ;
- le correctif `exempt_until` (chantier et release distincts) ;
- les lots 5, 7 et 8.

---

## 8. Règles transverses

1. **Une migration par objet logique, une migration à la fois** (R1) — déploiement isolé,
   24 à 48 h d'observation avant la suivante. Le rollback doit pouvoir être partiel.
2. **Aucune policy sans son test** dans le même commit.
3. **`bun run check:guards`** après chaque ajout de server function.
4. **`bun run check:i18n`** vert avant tout merge touchant l'UI.
5. **Ne jamais comparer directement `billing_owner_user_id` à l'utilisateur courant** :
   toujours passer par `can_manage_team_billing()` — c'est ce qui rendra les délégués de
   facturation possibles sans refonte.
6. **Ne jamais écrire `if plan === "team"` dans le front** : consommer les entitlements.
7. **Résoudre le quota avant de prendre un verrou** — la contention n'est justifiée que
   là où une limite existe.
8. **Ajouter avant de remplacer** : toute fonction existante touchée passe par une
   version `_v2` comparée en parallèle.
9. À la fin de chaque phase, relire les critères d'acceptation concernés et cocher
   explicitement.

---

## 9. Signaux d'arrêt

Interrompre et remonter le point plutôt que de contourner :

- une migration exige de modifier la contrainte UNIQUE sur `subscriptions.club_id` ;
- un besoin apparaît de rendre `teams.club_id` nullable ;
- `club_has_active_subscription` devrait changer de sémantique ;
- une policy de catégorie B ou A′ semble devoir être bloquée ;
- un test de concurrence échoue de manière intermittente ;
- un écran affiche une erreur brute Stripe ou SQL à l'utilisateur ;
- la seule façon de faire passer un test est de désactiver une RLS ;
- **une divergence du mode sombre ne s'explique pas** ;
- **des doublons `(team_id, player_id)` réapparaissent après correction** ;
- **une migration de retour n'a pas été écrite ou n'a pas été testée** ;
- **le rejeu d'événements Stripe antérieurs produit des écritures différentes de
  l'existant** (violation de R2) ;
- **une phase s'apprête à s'enchaîner sans autorisation explicite** (violation de R4) ;
- **plusieurs migrations sensibles sont sur le point d'être déployées ensemble**
  (violation de R1).

Chacun de ces signaux indique que la spécification est en train d'être contournée, pas
appliquée.

---

## 10. Ce que ce document ne garantit pas

Aucun document ne garantit qu'une application en production ne cassera pas. Ce qui est
garanti ici est plus modeste et plus utile :

- **rien n'est remplacé avant d'avoir été comparé** ;
- **rien n'est activé avant d'avoir été observé** ;
- **rien n'est généralisé avant d'avoir été piloté** ;
- **tout changement sensible dispose d'un chemin de retour testé**.

Le reste relève de la vigilance à l'exécution : lire les journaux de divergence, arrêter
au premier signal, et refuser de considérer une phase comme franchie parce que le
calendrier le voudrait.
