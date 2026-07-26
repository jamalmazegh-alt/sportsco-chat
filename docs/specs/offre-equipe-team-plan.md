# Offre Clubero « Équipe » à 9,99 € — Spécification produit & technique (v4)

> **Statut :** spécification consolidée v4 — livrable documentaire uniquement.
> **Aucune implémentation fonctionnelle** ne doit démarrer avant validation du
> `Lot 0 bis` (voir `offre-equipe-lot-0-bis.md`).
> Cette v4 remplace les décisions, hypothèses ou formulations contradictoires des
> versions antérieures. Les faits techniques cités en §0 ont été constatés dans le
> dépôt (audit du 2026-07-25) ; les re-vérifier rapidement avant de coder.
>
> Documents liés :
>
> - `docs/specs/offre-equipe-architecture-plan.md` (design technique)
> - `docs/specs/offre-equipe-lot-0-bis.md` (durcissement, inventaires, prérequis)

---

## 0. Contexte technique vérifié (état des lieux du dépôt)

**Stack.** TanStack Start (React 19 + Vite), déployé sur Cloudflare Workers
(`wrangler.jsonc`, `src/server.ts`). **Pas de Supabase Edge Functions** : la logique
serveur vit dans les server functions TanStack (`src/lib/*.functions.ts`,
`src/modules/*/*.functions.ts`) et les routes API (`src/routes/api/**`,
`src/routes/webhooks/**`). Gestionnaire de paquets : Bun. Schéma de référence :
`src/integrations/supabase/types.ts`.

**Modèle de données.**

- Hiérarchie stricte `clubs → teams` ; `teams.club_id` est **NOT NULL** (et doit le
  rester). Le mécanisme technique `clubs.is_personal` + RPC
  `get_or_create_personal_club` / `convert_personal_club_to_real` est **réservé au
  parcours organisateur de tournoi**. Il ne définit pas le modèle produit de l'offre
  Équipe ni Découverte (voir §2).
- Rôles : enum `app_role` = `admin | coach | parent | player | dirigeant | financial_admin`.
  `club_members.roles text[]` porte les rôles fins (`assistant_coach`, `staff`,
  `tournament_manager`…) ; `team_members.role` est un enum simple. **Ne pas inventer
  de nouveaux rôles**, réutiliser ces valeurs.

**Facturation existante (à réutiliser, pas à dupliquer).**

- Table `subscriptions` **à raison d'une par club** (UNIQUE sur `club_id`), enums
  `subscription_plan = monthly | yearly` et `subscription_status`
  (`trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid | paused`),
  champs d'exemption (`exempt_from_billing`, `exempt_until`…).
- Server functions complètes dans `src/lib/billing.functions.ts` (checkout, portail,
  annulation, réactivation, mise à jour de carte), toutes verrouillées « club admin ».
- Webhook Stripe signé et idempotent : `src/lib/stripe-webhook-handler.server.ts`,
  monté sur `src/routes/webhooks/stripe.ts` (+ alias `src/routes/api/public/stripe-webhook.ts`),
  avec table **`stripe_webhook_events`** (idempotence par `event_id`) — elle existe
  déjà, ne pas la recréer. Le handler branche sur `metadata.purpose` pour les paiements
  non-club (`tournament_single`, `tournament_annual`, `tournament_pass`,
  `payment_obligation`).
- Prix Stripe dans `src/lib/stripe.server.ts` via variables d'environnement avec valeurs
  par défaut. Suivre le même motif pour les nouveaux prix.
- **Piège vérifié — trigger d'essai.** `auto_create_trial_subscription` (AFTER INSERT ON
  `clubs`) crée un essai **Club** de 14 jours pour tout club non-personnel. Sans
  précaution, un club créé via l'onboarding Équipe/Découverte recevrait un essai Club
  complet, débloquant les fonctionnalités Club **et la création de tournois** pendant
  14 jours. Le trigger doit ignorer les clubs `billing_mode='per_team'` (voir §8).
- Verrouillage : garde dans `src/routes/_authenticated.tsx`
  (`ClubSubscriptionExpiredScreen`, `LockedClubShell`, listes `CLUB_LOCKED_ALLOWED` et
  `TOURNAMENT_ONLY_ALLOWED`) — actuellement à portée **club entier**. Accès payant :
  `src/lib/has-paid-access.ts` (+ `.server.ts`) et RPC SECURITY DEFINER
  `club_has_active_subscription(_club_id)`.
- Précédent structurel pour une facturation non-club : `tournament_entitlements`
  (portée organisateur, plan/statut/validité, même webhook). C'est le gabarit à suivre
  pour `team_subscriptions`.
- **Bug vérifié — `exempt_until` ignoré côté SQL.** Le TypeScript (`has-paid-access.ts`)
  respecte `exempt_until`, mais le garde-fou SQL (`club_has_active_subscription`,
  triggers) ne teste que `exempt_from_billing = true`. À corriger **avant** d'étendre
  l'exemption aux équipes, avec audit préalable des données (voir §12).

**Tournois.** Module complet dans `src/modules/tournaments/`. La création est restreinte
par la fonction SQL `can_create_tournament(_user_id)` : superadmin, OU entitlement
tournoi actif, OU admin/dirigeant d'un club dont `club_has_active_subscription()` est vrai.

**Entitlements.** Aucun système centralisé d'entitlements ni de quotas n'existe : pas de
`max_players`, pas de comptage de sièges. Mécanismes existants : `has-paid-access`,
`club_has_active_subscription`, entitlements tournois, feature flags V2
(`src/config/features.ts` + table `app_flags`).

**i18n.** 7 locales (`fr, en, de, es, it, nl, pt`), parité des clés vérifiée en CI
(`bun run check:i18n`). **CI actuellement rouge** (clés `common.groups.*` manquantes) —
voir §21.

**Sécurité.** RLS par fonctions helpers SECURITY DEFINER (`is_team_staff`,
`user_is_in_team`, `has_club_role`, `is_club_member`…). Sur `subscriptions`, les colonnes
Stripe sont protégées par des **REVOKE au niveau colonne**. Tests RLS : `tests/rls/`,
`bun run test:rls` (workflow manuel). Linter de gardes serveur : `bun run check:guards`.

---

## 1. Modèle commercial cible — trois offres

### 1.1 Offre Découverte (gratuite)

```text
Prix          : gratuite
Portée        : une équipe
Joueurs actifs: maximum 15
Coaches/staff : illimités
Objectif      : vraie découverte du produit
```

**Règles anti-contournement** (configurables côté serveur, jamais codées en dur dans
les écrans) :

```text
DISCOVERY_MAX_ACTIVE_PLAYERS_PER_TEAM = 15
DISCOVERY_MAX_TEAMS_PER_CREATOR       = 1
DISCOVERY_MAX_TEAMS_PER_CLUB          = 2
```

- maximum une équipe Découverte **active** par utilisateur (créateur/bénéficiaire) ;
- maximum deux équipes Découverte **actives** par club ;
- au-delà, une nouvelle équipe doit choisir l'offre Équipe ou être couverte par l'offre
  Club.

L'offre Découverte reste liée à l'**équipe**, pas définitivement à son créateur.

### 1.2 Offre Équipe

```text
Prix mensuel  : 9,99 € par équipe
Prix annuel   : 99,99 € par équipe
Joueurs       : illimités
Coaches/staff : illimités
Portée        : toutes les fonctionnalités opérationnelles d'une équipe
```

Chaque équipe possède sa propre souscription, sa propre périodicité, son propre
responsable de facturation. Exemple de club mixte :

```text
USAG Uckange
├── U13 — Offre Équipe mensuelle
├── U15 — Offre Équipe annuelle
├── U17 — Offre Découverte
└── Seniors — sans couverture, lecture seule
```

### 1.3 Offre Club (existante)

```text
Prix mensuel : 49 €
Prix annuel  : 490 €
Joueurs      : illimités
Équipes      : illimitées
Fonctionnalités centrales et transverses du club incluses
```

Le prix ne dépend jamais du nombre de coaches, de comptes ou de membres du staff.

---

## 2. Principe structurant : un vrai club existe toujours

Même en Découverte ou en Équipe, l'utilisateur crée/rejoint un **vrai club visible**.

Le modèle fonctionnel est toujours `Club → Équipe`, **jamais**
`Compte personnel → Équipe isolée`. `clubs.is_personal` reste réservé au parcours
tournoi et ne doit **pas** servir de modèle produit ici.

L'utilisateur peut gérer l'**identité minimale** de son club (nom, logo, sport
principal, informations publiques essentielles) sans accéder aux fonctionnalités
centrales réservées à l'offre Club (voir §7.3).

---

## 3. Séparation stricte des concepts

```text
Club              = organisation, identité, rattachement des équipes
Équipe            = unité sportive
Offre Découverte  = couverture gratuite limitée d'une équipe
Team subscription = abonnement payant couvrant exactement une équipe
Club subscription = abonnement couvrant tout le club (table subscriptions existante)
Billing owner     = responsable du paiement d'une souscription Équipe
Créateur d'équipe = personne ayant initialement créé l'équipe, SANS propriété absolue
```

Notions à introduire :

```text
teams.created_by_user_id
team_subscriptions.billing_owner_user_id
état/entitlement Découverte rattaché à l'équipe
```

Le créateur ne devient pas propriétaire permanent des données du club. Il peut quitter
l'équipe à condition qu'un autre responsable opérationnel soit présent ou désigné.

---

## 4. Création multi-coach & détection de club (rattachement uniquement)

### 4.1 / 4.2 Coaches du même club

- Coach 1 crée le club `USAG Uckange` + `U13` (Découverte).
- Coach 2, **déjà membre**, voit un bouton « Ajouter une équipe » et crée `U15`
  directement **dans le même club** (il ne recrée pas le club).
- Chaque équipe a sa propre limite de 15 joueurs actifs. Droits à portée équipe :
  Coach 1 administre U13, Coach 2 administre U15, aucun droit sportif automatique
  croisé ; les admins/dirigeants autorisés du club ont une vue transversale adaptée.

### 4.3 Coach 2 pas encore membre — demande de rattachement

À l'onboarding, Clubero recherche les clubs similaires et propose :

> Un espace « USAG Uckange » existe déjà. Souhaitez-vous demander à rejoindre ce club
> ou créer une structure différente ?

Actions : `Demander à rejoindre ce club` / `Ce n'est pas mon club`. La demande peut
préciser l'équipe à créer. Un responsable autorisé du club accepte ; Coach 2 devient
membre, l'équipe est créée dans le club existant, **aucun deuxième club n'est créé**.

L'endpoint de recherche de club est soumis à des exigences de sécurité strictes (§24.4).

### 4.4 Détection — suggestion, jamais preuve

Signaux indicatifs : nom normalisé, ville, code postal, sport, logo, identifiant
fédéral futur. Le résultat est une **suggestion**, jamais une fusion automatique.

### 4.5 Doublons de clubs — **hors V1**

**Décision v4 :** le rapprochement/fusion complet de deux clubs et tout changement
transversal de `club_id` sont **retirés de la V1**. La V1 couvre uniquement :

- recherche d'un club existant ;
- suggestion limitée ;
- demande de rattachement ;
- création d'un club distinct si la suggestion est un faux positif ;
- **signalement manuel** d'un doublon à Clubero (aucune action automatique).

Aucune fusion automatique ou semi-automatique de clubs, ni de deux équipes équivalentes,
en V1. Le rapprochement de clubs devient un **chantier ultérieur indépendant** (voir
§28, ancien Lot 8 redéfini).

---

## 5. Limite de joueurs de l'offre Découverte

La limite (15 joueurs **actifs**) s'applique **uniquement** à Découverte ; Équipe et
Club sont illimités.

Ne comptent **pas** : parents, responsables légaux, coaches, assistants, staff, joueurs
archivés ou supprimés. La notion de « joueur actif » est définie précisément dans une
**fonction centrale** unique (voir Lot 0 bis).

### 5.1 Comportement au-delà de la limite (branche éligible)

Si une équipe **éligible à Découverte** (voir §6) termine son essai avec 22 joueurs :
aucun joueur supprimé/masqué, les 22 restent utilisables, l'ajout et l'import de
joueurs supplémentaires sont bloqués, la restauration d'un archivé qui augmenterait le
nombre d'actifs est bloquée.

> Votre équipe compte plus de 15 joueurs actifs, limite de l'offre Découverte. Vos
> données sont conservées, mais vous devez passer à l'offre Équipe pour ajouter ou
> réactiver d'autres joueurs.

### 5.2 Chemins à protéger (contrôle serveur + DB pour les chemins critiques)

création manuelle ; import CSV ; import multiple ; restauration d'un archivé ; transfert
d'un joueur vers l'équipe ; duplication ; RPC / appels Supabase directs ; server
functions. **Le front affiche le message mais ne constitue jamais la protection.**

### 5.3 Contrôle **atomique** obligatoire

**Décision v4 :** la limite doit résister aux écritures concurrentes. Interdire un simple
`count` puis `insert` applicatif. Voir la stratégie détaillée en Lot 0 bis §3 :
fonction/RPC transactionnelle, verrou sur l'équipe, vérification + insertion dans la
**même transaction**, trigger de défense en profondeur, import CSV traité comme un lot
cohérent. **Recommandation import : refuser le lot entier avant insertion** s'il
dépasserait le quota (plutôt que ligne par ligne). Test obligatoire : deux insertions
concurrentes à 14 joueurs → jamais plus de 15.

### 5.4 Anti-contournement (V1 raisonnable)

Empêcher : archiver puis recréer les mêmes joueurs ; créer plusieurs équipes Découverte
fictives pour répartir un effectif ; comptes multiples pour dépasser la limite par
utilisateur ; déplacements en boucle entre équipes gratuites. Privilégier des règles
vérifiables + journalisation + alertes plutôt qu'un moteur anti-fraude complexe.

---

## 6. Durée d'essai et bascule vers Découverte

**Décisions validées :** essai Équipe **14 jours** ; fin d'essai → bascule vers
Découverte **si éligible**.

### 6.1 Éligibilité à la bascule Découverte (Option A — stricte)

À la fin de l'essai sans paiement, la bascule automatique vers Découverte n'est
autorisée **que si** :

```text
- le club possède moins de 2 équipes Découverte ACTIVES (hors celle-ci) ; ET
- le créateur/bénéficiaire de l'équipe ne possède pas déjà une équipe Découverte ACTIVE.
```

Si **l'un** des quotas est déjà atteint :

```text
fin d'essai
→ conservation intégrale des données
→ équipe en LECTURE SEULE (coverage = 'expired')
→ proposition Offre Équipe ou Offre Club
```

**Il n'y a pas de grandfathering** permettant de dépasser les quotas Découverte.

Exemple :

```text
U13 — Découverte (Coach 1)   → 1/1 Coach 1 ; 1/2 club
U15 — Découverte (Coach 2)   → 2/2 club
U17 — essai (créé par Coach 1)
```

À la fin de l'essai de U17 : bascule Découverte **refusée** (quota club atteint ET quota
de Coach 1 atteint) → U17 passe en **lecture seule**, données conservées.

### 6.2 Déterminisme

- « Équipe Découverte active » = `coverage = 'discovery'` uniquement (ni essai, ni
  payant, ni lecture seule/expiré). Une équipe `expired` **ne consomme pas** de créneau.
- **Pas de promotion silencieuse** : une équipe `expired` ne redevient pas
  automatiquement `discovery` quand un créneau se libère. La promotion
  `expired → discovery` ne se fait que par **action explicite** de l'utilisateur si un
  créneau est disponible. Le job planifié (§17.1) ne calcule l'atterrissage
  `trial → discovery|expired` **qu'une fois**, à l'expiration.

### 6.3 Anti-abus essai

Un seul essai Équipe par utilisateur **ou** customer Stripe ; pas de nouvel essai
automatique par équipe créée ; vérifier les essais précédents du créateur et du customer ;
validation ou refus en cas de comportement suspect.

---

## 7. Fonctionnalités par offre

### 7.1 Offre Découverte (liste à figer en Lot 0 bis)

Au minimum : gestion basique de l'équipe ; jusqu'à 15 joueurs actifs ; staff illimité ;
création d'événements ; convocations ; réponses parents/joueurs ; présences ;
communication de base ; test réel du produit. Certaines fonctions avancées peuvent être
limitées commercialement sans rendre l'offre inutilisable.

### 7.2 Offre Équipe

joueurs illimités ; parents/responsables légaux ; coaches/staff illimités ; matchs ;
entraînements ; événements ; convocations ; réponses ; présences ; compositions ;
disponibilités joueurs & staff ; besoins d'événement ; mur d'équipe ; mur staff ;
sondages ; documents d'équipe ; notifications ; emails transactionnels ; calendrier ;
statistiques individuelles & équipe existantes ; invitations ; import de joueurs.

### 7.3 Offre Club uniquement (exclu de Découverte & Équipe)

mur général du club ; communication globale ; groupes transverses ; statistiques
consolidées ; tableau de bord central ; gestion centralisée de tous les membres ;
réunions Club ; documents communs ; gestion financière globale ; CRM ; sponsoring ;
fonctions premium Club futures ; **création et administration de tournois via l'offre
Club**.

---

## 8. Modèle technique de couverture — `clubs.billing_mode`

```sql
billing_mode text NOT NULL DEFAULT 'club'
CHECK (billing_mode IN ('club', 'per_team'))
```

- `club` (défaut) : comportement historique intégral — tous les clubs existants,
  **zéro régression**.
- `per_team` : club réel dont les équipes sont couvertes individuellement (Découverte,
  essai ou abonnement Équipe). Pas d'essai Club auto (trigger ignoré), couverture
  évaluée par équipe, fonctionnalités Club bloquées, identité gérable.

Le trigger `auto_create_trial_subscription` doit ignorer les clubs `per_team`. Le
parcours tournoi personnel existant reste inchangé.

---

## 9. Garde-fous DB obligatoires

Les invariants critiques ne dépendent **pas** du seul code applicatif ni des tests.

### 9.1 Interdiction d'une offre Club active sur un club `per_team`

Garde-fou DB empêchant qu'une ligne `subscriptions` **active, en essai ou exemptée**
soit associée durablement à un club `per_team`. Seule exception : le flux contrôlé de
passage vers l'offre Club, qui bascule explicitement `billing_mode='club'`. Le garde-fou
doit couvrir les écritures **service role / `supabaseAdmin`**. Implémentation (au choix
selon le modèle retenu) : trigger, fonction transactionnelle DB, ou RPC SECURITY
DEFINER dédiée — un simple `CHECK` inter-tables est impossible.

### 9.2 Tournois

Modifier `can_create_tournament` pour vérifier **explicitement** :

```text
clubs.billing_mode = 'club' AND club_has_active_subscription(club_id) = true
```

Ne pas déduire le mode commercial de la seule existence d'une souscription. Tests :

```text
club per_team + équipe Découverte           → tournoi refusé
club per_team + équipe payante              → tournoi refusé
club per_team + plusieurs équipes payantes  → tournoi refusé
club per_team + ligne subscriptions injectée→ tournoi refusé
club club + abonnement Club actif           → tournoi autorisé
entitlement Tournoi valide                  → comportement existant conservé
```

---

## 10. Table `team_subscriptions`

Une ligne couvrant exactement une équipe (modèle `tournament_entitlements`) :

```text
id, team_id, club_id, billing_owner_user_id,
stripe_customer_id, stripe_subscription_id, stripe_price_id,
plan_code (team_monthly | team_yearly),
status (enum subscription_status réutilisé),
trial_start, trial_end, current_period_start, current_period_end,
cancel_at_period_end, canceled_at,
exempt_from_billing, exempt_until, exemption_reason, exempted_by,
created_at, updated_at
```

- `club_id` dénormalisé pour la RLS, **toujours** = club de l'équipe (trigger de
  cohérence à l'INSERT et au transfert).
- **Ne pas** ajouter `grace`, `expired`, `read_only` dans l'enum `subscription_status` :
  ce sont des états **dérivés** Clubero (§17), pas des statuts Stripe.
- **Ne pas toucher** à la table `subscriptions`, à son UNIQUE `club_id`, ni à la
  sémantique de `club_has_active_subscription`.

---

## 11. Souscriptions incomplètes & index d'unicité

Garde-fou d'unicité (un seul abonnement vivant par équipe) **sans** bloquer l'utilisateur
par une erreur SQL brute pendant ~24 h à cause d'un checkout `incomplete` abandonné.
Avant tout nouveau checkout :

1. rechercher une souscription vivante ou incomplète ;
2. vérifier son état réel auprès de Stripe ;
3. réutiliser une session récente reprenable ;
4. sinon, si Stripe confirme l'expiration → passer la ligne à `incomplete_expired` ;
5. sinon invalider proprement ;
6. **seulement ensuite** créer une nouvelle session.

L'index partiel reste le garde-fou **ultime**, jamais la logique principale ; ne jamais
exposer d'erreur d'unicité brute.

---

## 12. Exemptions de facturation

Exemptions Équipe **validées**. Règle unique (pour Club **et** Équipe) :

```text
exempt_from_billing = true AND (exempt_until IS NULL OR exempt_until > now())
```

**Corriger d'abord** le bug SQL Club où `exempt_until` est ignoré — **après audit
préalable des données** (voir §12.1 et Lot 0 bis §7). Ne pas étendre une logique
d'exemption incorrecte aux équipes. Helpers centraux :

```text
club_billing_exemption_is_active(club_id)
team_billing_exemption_is_active(team_id)
```

Une exemption active couvre l'équipe/le club **sans** créer de fausse souscription Stripe.

### 12.1 Audit préalable obligatoire avant le correctif SQL

Produire la liste des clubs correspondant à :

```text
exempt_from_billing = true AND exempt_until IS NOT NULL AND exempt_until <= now()
```

Pour chacun : identifiant, nom, date d'expiration, motif éventuel, accès actuellement
obtenu à cause du bug, impact de la correction, action de régularisation. **Ne pas
déployer** le correctif avant décision sur ces données (éviter une coupure de production
silencieuse).

---

## 13. Responsable de facturation (billing owner)

Chaque `team_subscription` possède **exactement un** billing owner fonctionnel : il paie,
accède au portail Stripe, change la périodicité, annule, réactive, reçoit les
notifications financières. Il ne reçoit **aucun** droit sportif ; réciproquement, être
coach ne donne pas accès à la facturation.

### 13.1 Permissions distinctes

```text
can_view_team_billing_status
can_manage_team_billing
```

- **Billing owner** : gestion complète de sa souscription.
- **Financial admin explicitement autorisé** : selon les règles définies.
- **Admin/dirigeant du club** : voit couverture, plan, statut et identité du billing
  owner ; ne voit pas les factures personnelles ni le moyen de paiement ; ne reçoit pas
  automatiquement l'accès au portail Stripe du payeur.
- **Coach non-payeur** : reçoit uniquement le statut fonctionnel nécessaire (active,
  essai, grâce, lecture seule) ; ne lit pas directement `team_subscriptions`.
- **Superadmin Clubero** : accès opérationnel nécessaire et audité.

### 13.2 Transfert

Transactionnel côté base, journalisé, notifié, sécurisé, **sans recréer** la souscription
Stripe. Vérifier l'éligibilité du nouveau responsable. Empêcher le départ du billing owner
tant que la responsabilité n'est pas transférée / la souscription annulée / la situation
résolue. Le départ d'un coach non-payeur n'a aucun impact. Ne jamais exposer aux autres
coaches : moyen de paiement, factures, adresse de facturation, identifiants Stripe.

---

## 14. Suppression / anonymisation RGPD du billing owner

Avant toute suppression/anonymisation de compte, vérifier :

```text
user_has_active_billing_responsibilities(user_id)
```

Couvrir : souscription active ; essai ; `incomplete` ; paiement en échec ; annulation
programmée ; migration vers Club en cours ; exemption dont l'utilisateur est responsable ;
obligations Stripe encore actives. Si une responsabilité existe → **suppression bloquée**
→ transfert ou annulation obligatoire. Modifier le flux `privacy.functions` (ou
équivalent). Ne jamais produire : une `team_subscription` pointant vers un utilisateur
supprimé ; un customer Stripe sans responsable Clubero ; une facture active sans
interlocuteur fonctionnel.

---

## 15. RLS & paywall à portée équipe

Le paywall **ne repose pas** sur les seules server functions : le code contient de
nombreux appels **directs** client → Supabase.

> **Exigence :** toute mutation utilisateur portant sur une équipe **sans couverture
> d'écriture** doit être refusée au niveau **RLS ou via une RPC sécurisée**. Front-end et
> server functions sont complémentaires, jamais la protection principale.

### 15.1 Inventaire obligatoire (Lot 0 bis)

Avant modification, inventorier toutes les mutations directes Supabase portant sur des
données d'équipe. Pour chacune : fichier ; table/RPC ; opération ; rôle utilisateur ;
colonne d'où l'équipe est déductible ; couverture requise ou non ; policy actuelle ;
modification proposée ; risque de régression.

### 15.2 Classification des mutations (réconciliée avec §16)

- **A. Gestion (couverture d'écriture obligatoire — `canManageTeamContent`)** : créer/
  modifier/supprimer un événement ; gérer joueurs ; gérer membres ; publier sur le mur ;
  créer un sondage ; créer des documents ; créer des besoins ; gérer des compositions ;
  modifier la configuration d'équipe.
- **B. Réponses à un objet existant (`canRespondToExistingObjects`,
  `canAcceptTeamInvitation`)** : répondre à une convocation, indiquer une disponibilité,
  répondre à un sondage, candidater à un besoin, accepter une invitation. **Peuvent rester
  autorisées** pendant grâce/lecture seule pour ne pas casser l'usage des familles sur des
  événements déjà créés. Ces actions **ne sont pas** gardées par `canManageTeamContent`.
- **C. Système** : webhooks, cron, service role, traitements internes. Non bloqués par la
  RLS utilisateur mais correctement gardés et audités.
- **D. Lectures** : généralement consultables après expiration.

---

## 16. Entitlements V1 — API centrale typée

Pas de moteur générique de plans. Fonctions serveur :

```text
get_team_coverage(team_id)
get_team_entitlements(user_id, team_id)
team_has_paid_access(team_id)
team_has_write_access(team_id)
club_has_any_team_coverage(club_id)
```

Objet cible (avec la séparation gestion/réponses de la décision v4) :

```ts
{
  coverage:
    | "club_plan" | "team_plan" | "team_trial" | "discovery"
    | "grace" | "expired" | "none",

  canReadTeam: boolean,
  canWriteTeam: boolean,               // droit d'écriture global (dérivé de la couverture)
  canManageTeamContent: boolean,       // catégorie A (§15.2)
  canRespondToExistingObjects: boolean,// catégorie B (§15.2) — survit à grâce/lecture seule
  canAcceptTeamInvitation: boolean,    // catégorie B (§15.2)
  canManageTeam: boolean,
  canInviteTeamStaff: boolean,
  canManagePlayers: boolean,
  canCreateEvents: boolean,
  canUseTeamWall: boolean,
  canUseClubFeatures: boolean,
  canManageClubIdentity: boolean,
  canCreateTournament: boolean,
  maxPlayers: number | null,           // null = illimité
  discoveryTeamsRemainingForClub: number | null,
  discoveryTeamsRemainingForCreator: number | null
}
```

`get_team_coverage` est la **source unique** des états dérivés. La correspondance
`coverage → capabilities` (dont le maintien de la catégorie B en `grace`/`expired`) est
figée en Lot 0 bis §5.

---

## 17. Machine à états — grâce, expiration, lecture seule

États dérivés des données Stripe + dates (jamais de statut Stripe artificiel) :

```text
active + période valide                       → team_plan
trialing + trial_end future                   → team_trial
Découverte valide                             → discovery
past_due + grace_end future                   → grace
past_due + grace_end dépassée                 → expired
unpaid                                         → expired
cancel_at_period_end + current_period_end fut.→ team_plan jusqu'à l'échéance
canceled + current_period_end dépassée        → discovery (si éligible §6.1) sinon expired
Club actif                                     → club_plan (prioritaire sur tous)
```

### 17.1 Job planifié idempotent

Route cron / tâche planifiée pour : détecter fins d'essai ; basculer vers Découverte
**selon l'éligibilité §6.1** (sinon `expired`) ; détecter fins de grâce ; journaliser les
transitions ; notifier ; détecter les incohérences ; réconcilier Stripe ↔ Clubero.
Préciser : fréquence, verrouillage, idempotence, journalisation, reprise après échec
(détaillé en Lot 0 bis §4/§5).

---

## 18. Passage de l'offre Équipe à l'offre Club (même club)

Aucun changement de `club_id`, aucun déplacement de données. **Saga idempotente**, pas une
transaction SQL unique.

### 18.1 Ordre obligatoire — aucun trou de couverture

```text
1.  lancer le checkout Club
2.  attendre la confirmation Stripe de l'abonnement Club actif
3.  enregistrer/confirmer la souscription Club
4.  basculer billing_mode='club' via le flux contrôlé
5.  la précédence club_plan couvre immédiatement toutes les équipes
6.  identifier toutes les team_subscriptions encore vivantes
7.  marquer la migration financière « en cours »
8.  demander à Stripe leur arrêt selon la stratégie commerciale
9.  traiter les webhooks de confirmation
10. journaliser chaque résultat
11. marquer la migration « terminée » quand toutes sont résolues
```

La couverture Club est **toujours active avant** l'arrêt des abonnements Équipe.

### 18.2 Prorata (décision validée)

Activation immédiate de l'offre Club ; arrêt immédiat des abonnements Équipe ; **prorata/
crédit calculé exclusivement par Stripe**. Aucun calcul maison ; ne jamais promettre un
remboursement avant le résultat Stripe. Prévoir une **reprise manuelle** si une annulation
Stripe échoue. Cas de test : une/plusieurs équipes mensuelles, annuelle, périodicités
mixtes, dates de renouvellement différentes, paiement échoué, annulation déjà programmée,
webhook rejoué.

---

## 19. Anti-double facturation

- **Club actif → Équipe** : interdire tout nouveau checkout Équipe ; signaler que
  l'équipe est déjà couverte ; ne jamais créer de `team_subscription`.
- **Équipe → Club** : saga §18.
- **Résiliation Club** : aucune souscription Équipe recréée automatiquement ; aucune carte
  débitée sans consentement ; les équipes deviennent Découverte **si éligibles (§6.1)**,
  sinon lecture seule ; checkout explicite requis pour repasser en Équipe.

Le front-end ne décide jamais seul d'un droit payant : contrôles serveur et, pour les
chemins critiques, RLS / RPC SECURITY DEFINER.

---

## 20. Inventaire des lecteurs de `subscriptions`

Avant Lot 1, recenser tout ce qui suppose qu'un club possède une ligne `subscriptions` :
`.single()`, `.maybeSingle()`, jointures, helpers, hooks, gardes de routes, dashboards,
superadmin, assistant IA, feature contexts, pages de facturation, exemptions, trial
reminders, notifications, scripts et tests. Tableau : `Fichier/fonction · Hypothèse
actuelle · Comportement sur club per_team · Risque · Modification requise · Lot`. Un club
`per_team` peut **légitimement** n'avoir aucune ligne `subscriptions` ; aucun écran ni
helper ne doit planter. Détail en Lot 0 bis §3 (inventaire lecteurs).

---

## 21. CI & dette existante

Contrôles déjà rouges sur `main` : `bun run check:i18n` (clés `common.groups.*`
manquantes) et `bun run lint`. Avant d'utiliser ces commandes comme _exit gates_ :

- **Option recommandée** — corriger la dette d'abord : clés `groups.*` manquantes ; lint ;
  bug SQL `exempt_until`.
- **Option de repli** — baseline documentée (erreurs présentes, nombre exact, fichiers) ;
  critère de sortie = « **aucune nouvelle erreur vs baseline** », pas un faux « vert ».

---

## 22. RLS de `team_subscriptions`

Lecture directe limitée à : billing owner ; financial admin autorisé ; superadmin ;
éventuellement admin du club pour une vue restreinte (via RPC/vue dédiée). Les coaches
non-payeurs n'ont **pas** d'accès direct à la table. RPC de statut simplifié pour les
membres :

```text
get_team_billing_status(team_id)
→ coverage, plan public, trial_end éventuel, current_period_end éventuel,
  can_manage_billing, upgrade_required
```

Ne jamais exposer : identifiants Stripe, moyen de paiement, factures, adresse de
facturation, customer Stripe, infos personnelles non nécessaires du billing owner.
Conserver les **REVOKE colonne** sur les identifiants Stripe. Écritures uniquement par
fonctions serveur / webhook / service role contrôlé.

---

## 23. Webhooks Stripe

Étendre le handler existant (`stripe-webhook-handler.server.ts`) — **pas** de second
webhook. Metadata (sur session Checkout **et** souscription Stripe) :

```text
metadata.purpose = "team_plan"
metadata.team_id, metadata.club_id, metadata.billing_owner_user_id, metadata.plan
```

Événements : `checkout.session.completed`,
`customer.subscription.created/updated/deleted/trial_will_end/paused/resumed`,
`invoice.payment_succeeded`, `invoice.payment_failed`. Idempotence via
`stripe_webhook_events`. Réconciliation par `stripe_subscription_id` si metadata
absentes/partielles. Un événement **sans** `purpose='team_plan'` continue le flux Club/
Tournoi actuel (routage strict sur `metadata.purpose`, défaut = comportement existant).

---

## 24. Onboarding

Choix (libellés simplifiables en UI) :

```text
Je souhaite tester Clubero avec une équipe
Je souhaite gérer une ou plusieurs équipes
Je représente un club
Je souhaite organiser un tournoi
```

### 24.1 Parcours Découverte / Équipe

1. création du compte ; 2. **recherche d'un club existant** ; 3. demande de rattachement
   éventuelle ; 4. sinon création d'un vrai club ; 5. nom, logo optionnel, sport,
   localisation ; 6. première équipe ; 7. choix Découverte / mensuel / annuel ; 8. essai
   éventuel ; 9. invitation du staff. Le club est créé en `billing_mode='per_team'`.

### 24.2 Club existant détecté

Ne jamais ajouter automatiquement l'utilisateur → proposer une demande de rattachement.
Création d'un club différent possible si faux positif.

### 24.3 Limites Découverte (vérifiées avant création)

Vérifier : nombre d'équipes Découverte créées par cet utilisateur ; nombre d'équipes
Découverte actives dans le club ; éligibilité à un nouvel essai. Si atteint :

> Ce club utilise déjà le nombre maximum d'équipes en offre Découverte. Vous pouvez créer
> cette équipe avec l'offre Équipe à 9,99 €/mois ou passer à l'offre Club.

### 24.4 Recherche de club sécurisée (décision v4)

L'endpoint doit : être **rate-limité fail-closed** ; imposer une longueur minimale de
recherche ; limiter le nombre de résultats ; ne retourner que des données publiques
strictement nécessaires ; **ne jamais** exposer membres, emails, rôles, facturation ou
équipes privées ; journaliser les comportements suspects ; créer les demandes de
rattachement **côté serveur**. Réponse publique réduite à :

```text
nom public, logo public éventuel, sport, ville approximative, token/identifiant opaque
```

### 24.5 Friction assumée coach multi-équipes (décision v4)

Règles V1 : 1 équipe Découverte max/utilisateur ; 2 max/club ; 1 essai Équipe
max/utilisateur. Un coach seul créant une 2ᵉ équipe doit donc choisir **immédiatement**
l'offre Équipe payante — sauf si cette 2ᵉ équipe est créée et portée par un **autre**
coach éligible du même club. Restriction intentionnelle, **annoncée avant la fin du
wizard**.

---

## 25. Upsell Club (informatif, jamais forcé)

Ne jamais bloquer l'ajout d'une équipe payante. Seuils :

```text
3 équipes payantes → information discrète
4 équipes payantes → recommandation visible
5 équipes payantes → recommandation forte
```

Coût mensuel normalisé pour périodicités mixtes (`99,99 € / 12` pour l'annuel). Message à
5 équipes :

> Vos abonnements Équipe représentent environ 49,95 €/mois. L'offre Club à 49 €/mois est
> plus avantageuse et inclut les fonctionnalités centrales du club.

---

## 26. Upsell Tournoi

L'offre Équipe ne permet ni création ni administration de tournois ; la participation à un
tournoi tiers reste possible (flux existants). À la tentative de création :

> La création de tournois n'est pas incluse dans l'offre Équipe. Vous pouvez activer
> séparément une offre Tournoi.

CTA `Découvrir l'offre Tournoi` ; afficher les offres existantes (tournoi unique, pass/
annuel, contact). Tracker `tournament_upsell_viewed`.

---

## 27. Exigences de tests

### 27.1 RLS — matrice de profils

anonyme ; utilisateur sans lien ; joueur ; parent ; coach ; assistant coach ; dirigeant ;
admin ; financial admin ; coach autre équipe même club ; membre autre club ; billing
owner ; ancien billing owner ; superadmin. Pour chaque policy : autorisé ; refusé ;
cross-club ; après changement de rôle ; après transfert du billing owner ; après
expiration de couverture.

### 27.2 Découverte

```text
1re équipe Découverte d'un utilisateur                         → autorisée
2e équipe Découverte du même utilisateur                       → refusée
1re équipe Découverte du club                                  → autorisée
2e équipe Découverte du club par un autre coach                → autorisée
3e équipe Découverte du club                                   → refusée
15 joueurs actifs                                              → autorisé
16e joueur                                                     → refusé
joueur archivé                                                → non compté
restauration au-dessus de la limite                           → refusée
fin d'essai avec 22 joueurs, quota disponible                 → Découverte, ajout bloqué
fin d'essai, quota club OU créateur atteint                   → lecture seule (§6.1)
deux insertions concurrentes à 14 joueurs                     → jamais > 15 (§5.3)
```

### 27.3 Tournois

Garde-fous DB + `can_create_tournament` explicites (§9.2).

### 27.4 Stripe

checkout ; checkout abandonné ; reprise ; `incomplete_expired` ; succès ; échec ;
annulation ; réactivation ; changement mensuel/annuel ; passage Club ; rejeu webhook ;
métadonnées manquantes ; plusieurs équipes ; plusieurs billing owners ; utilisateur
multi-clubs.

### 27.5 RGPD

suppression : coach sans facturation ; billing owner actif ; billing owner avec annulation
programmée ; ancien billing owner ; billing owner pendant migration Club ; user supprimé
après transfert valide.

---

## 28. Découpage en lots

- **Lot 0 — Architecture initiale** : audit et modèle général (produits).
- **Lot 0 bis — Durcissement & inventaires** : _obligatoire avant tout code fonctionnel_
  (`offre-equipe-lot-0-bis.md`).
- **Lot 1 — Modèle de couverture** : `clubs.billing_mode` ; modèle Découverte ;
  `team_subscriptions` (+ exemptions corrigées) ; helpers de couverture ; garde-fous DB
  (§9) ; trigger d'essai ajusté ; RLS de base ; tests tournoi ; feature flag.
- **Lot 2 — Onboarding & rattachement simple** : recherche de club ; demande de rejoindre ;
  création de club ; première équipe ; choix Découverte/Équipe ; limites gratuites ;
  invitation staff. _(Le rapprochement complet de clubs est hors V1.)_
- **Lot 3 — Stripe & facturation Équipe** : checkout ; webhook ; portail ; changement de
  périodicité ; `incomplete` ; paiement échoué ; grâce ; annulation ; réactivation ;
  exemptions.
- **Lot 4 — Équipes supplémentaires** : plusieurs équipes ; limites Découverte par
  créateur & club ; périodicités mixtes ; synthèse ; upsell Club.
- **Lot 5 — Enforcement transverse (HAUT RISQUE, revue table par table)** : RLS/RPC des
  mutations ; lecture seule à portée équipe ; fonctionnalités autorisées ; exclusions
  Club ; tournois ; i18n ; tracking.
- **Lot 6 — Billing owner & RGPD** : transfert ; permissions financières ; suppression de
  compte ; confidentialité ; multi-clubs ; audit.
- **Lot 7 — Passage vers Club** : saga idempotente ; couverture Club d'abord ; arrêt
  Stripe ensuite ; prorata Stripe ; réconciliation ; reprise après échec.
- **Lot 8 — (Redéfini / hors V1) Rapprochement de clubs** : chantier ultérieur indépendant
  (détection avancée, rapprochement de doublons, transfert d'équipe inter-clubs, conflits,
  archivage) — **retiré de la V1** (décision v4 §4.5). Aucune fusion automatique.

---

## 29. Feature flag

Créer `team_plan_v1`. Il masque : nouveaux parcours d'onboarding ; pricing Équipe ; CTA ;
checkout ; pages de facturation Équipe ; ajout d'équipes payantes. Il ne doit **jamais**
désactiver : webhooks ; synchronisation Stripe ; cron ; lecture des souscriptions
existantes ; gestion des utilisateurs déjà engagés. Les Lots 7 et 8 doivent pouvoir avoir
des flags séparés.

---

## 30. Critères d'acceptation consolidés

1. Tout utilisateur Découverte/Équipe appartient à un vrai club visible.
2. Deux coaches d'un même club peuvent créer chacun une équipe Découverte dans le même
   espace.
3. Un utilisateur ne peut créer qu'une équipe Découverte active.
4. Un club ne peut avoir que deux équipes Découverte actives.
5. Une équipe Découverte est limitée à 15 joueurs actifs.
6. Parents, coaches et staff ne sont jamais comptés dans la limite.
7. Une équipe Équipe/Club a un nombre illimité de joueurs.
8. Aucun joueur n'est supprimé lors d'une bascule vers Découverte.
9. Toutes les limites sont contrôlées côté serveur et, pour les chemins critiques, en
   RLS/RPC — **de façon atomique** (§5.3).
10. **Fin d'essai** : bascule Découverte uniquement si éligible (§6.1) ; sinon lecture
    seule, données conservées, **sans grandfathering**.
11. Les clubs similaires sont suggérés, jamais fusionnés automatiquement.
12. Aucun transfert/rapprochement de club sans validation ; **aucune fusion de clubs en
    V1** ; deux équipes équivalentes jamais fusionnées automatiquement.
13. Une offre Équipe ne permet jamais de créer un tournoi.
14. Le blocage tournoi est protégé par la DB **et** par `can_create_tournament` (§9.2).
15. Une ligne `subscriptions` ne peut pas débloquer accidentellement un club `per_team`
    (§9.1).
16. `club_has_active_subscription` conserve sa sémantique Club exclusive.
17. Les états Découverte/grâce/lecture seule sont dérivés par une **source unique**
    (`get_team_coverage`).
18. Un job idempotent traite les fins d'essai et de grâce.
19. Le passage Équipe → Club active toujours la couverture Club **avant** d'arrêter les
    abonnements Équipe.
20. Stripe calcule les proratas ; aucun calcul maison de remboursement.
21. Une suppression RGPD ne peut laisser une souscription orpheline.
22. Les checkouts `incomplete` sont gérés proprement (pas d'erreur d'unicité brute).
23. Les coaches non-payeurs ne voient aucune donnée financière personnelle.
24. Les admins voient la couverture sans recevoir automatiquement l'accès au portail du
    payeur.
25. Les mutations directes Supabase sont inventoriées et sécurisées (§15).
26. Les lecteurs de `subscriptions` supportent l'absence de ligne pour les clubs
    `per_team`.
27. Les exemptions expirées ne donnent plus accès (bug `exempt_until` corrigé, après
    audit §12.1).
28. La CI ne subit aucune nouvelle régression par rapport à la baseline validée (§21).
29. Aucun Lot 1 ne commence avant validation du Lot 0 bis.
30. `bun run check:i18n`, `bun run check:guards`, `bun run test:rls` passent (ou respectent
    la baseline documentée).

---

## 31. Décisions validées & points encore ouverts

### Décisions validées (ne pas re-présenter comme bloquantes)

```text
Essai Équipe : 14 jours
Fin d'essai : bascule vers Découverte SI éligible, sinon lecture seule (Option A stricte)
Limite Découverte : 15 joueurs actifs
Quota Découverte : 1 par créateur, 2 par club (strict, appliqué aussi à la fin d'essai)
Offre Équipe : joueurs et staff illimités
Exemptions Équipe : oui
Feature flag : oui
Passage Club : couverture immédiate puis arrêt des team subscriptions
Prorata : Stripe uniquement
Upsell Club : informatif à 3, visible à 4, fort à 5
Tournoi : offre séparée existante
Pas de fusion automatique d'équipes ; rapprochement de clubs HORS V1
Recherche de club : endpoint sécurisé fail-closed, données publiques minimales
```

### Points à figer pendant le Lot 0 bis (non bloquants pour démarrer le Lot 0 bis)

- Liste précise des fonctionnalités **Découverte** (§7.1).
- Durée exacte de la **période de grâce** (`grace_end`) et cadence du job (§17.1).
- Résultat de l'**audit `exempt_until`** (§12.1) et plan de régularisation.
- Comportement précis des joueurs « temporairement inactifs » dans le comptage (§5).
