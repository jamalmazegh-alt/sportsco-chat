# Offre Clubero Équipe à 9,99 € — spécification produit consolidée (v4)

> **Statut** : spécification de référence. Consolide la v4 rédigée hors dépôt, la revue
> Cursor associée, et les vérifications faites directement dans le code de ce dépôt.
> Remplace toutes les versions antérieures.
>
> Documents liés :
> - `docs/specs/offre-equipe-architecture-plan.md` — plan d'architecture technique
> - `docs/specs/offre-equipe-lot-0-bis.md` — durcissement, inventaires et prérequis
> - `docs/specs/IMPLEMENTATION_ORDER.md` — **ordre de développement et stratégie de
>   déploiement ; ne jamais développer par fonctionnalité, ni remplacer avant d'avoir
>   comparé**
>
> **Aucun développement fonctionnel ne commence avant validation du Lot 0 bis.**
>
> **Cette spécification décrit la cible fonctionnelle, pas le rythme de déploiement.**
> Sur une application déjà en production, la cible s'atteint par phases : additif pur,
> puis mode sombre, puis nouveaux clubs seulement, puis enforcement club par club. Toute
> modification d'une policy, d'un trigger ou d'une fonction SQL existante relève d'une
> release dédiée — voir `IMPLEMENTATION_ORDER.md`, qui prévaut sur toute lecture de ce
> document qui suggérerait un déploiement direct.

---

## 0. Faits vérifiés dans le dépôt

Ces constats proviennent d'une lecture directe du code. Ne pas les réinventer ; les
re-vérifier rapidement avant de coder.

**Stack.** TanStack Start (React 19 + Vite) sur Cloudflare Workers (`wrangler.jsonc`,
`src/server.ts`). **Il n'existe aucune Supabase Edge Function** : la logique serveur vit
dans les server functions TanStack (`src/lib/*.functions.ts`, `src/modules/*/*.functions.ts`)
et les routes API (`src/routes/api/**`, `src/routes/webhooks/**`). Bun. Schéma de
référence : `src/integrations/supabase/types.ts`.

**Modèle.** `clubs → teams` ; `teams.club_id` est **NOT NULL** et doit le rester.
`clubs.is_personal` + `get_or_create_personal_club` existent mais sont réservés au
parcours organisateur de tournoi.

**Rôles.** Enum `app_role` = `admin | coach | parent | player | dirigeant |
financial_admin`. `club_members.roles text[]` porte les rôles fins (`assistant_coach`,
`staff`, `tournament_manager`…). `team_members.role` est un enum simple. Ne pas inventer
de rôles.

**Joueurs — point critique.** La table `players` possède `deleted_at` (soft delete) mais
**aucun état « archivé »**. La table `team_members` ne contient que `id`, `team_id`,
`user_id`, `player_id`, `role`, `created_at` : **ni `status`, ni `member_type`, ni
`deleted_at`**. Une ligne joueur s'y identifie par `player_id IS NOT NULL`.

La notion d'appartenance active à une équipe n'existe donc pas aujourd'hui et doit être
créée : `team_members.status` (§5). Ne pas écrire de prédicat s'appuyant sur
`member_type` ou `team_members.deleted_at` — ces colonnes n'existent pas.

**Facturation existante.** Table `subscriptions` **une ligne par club** (contrainte UNIQUE
sur `club_id`, `upsert(onConflict: "club_id")` dans le webhook). Enums
`subscription_plan = monthly | yearly` et `subscription_status = trialing | active |
past_due | canceled | incomplete | incomplete_expired | unpaid | paused`. Server functions
complètes dans `src/lib/billing.functions.ts`, **toutes verrouillées « club admin »**.
Webhook signé et idempotent (`src/lib/stripe-webhook-handler.server.ts`, table
`stripe_webhook_events`). Prix dans `src/lib/stripe.server.ts` via env avec défauts
(Club : 49 €/mois, 490 €/an).

**Piège — trigger d'essai.** `auto_create_trial_subscription` (AFTER INSERT ON `clubs`,
`20260604212414_…sql`) crée un essai **Club de 14 jours** pour tout club non-personnel.
Sans ajustement, un club créé en offre Découverte ou Équipe recevrait un essai Club
complet, débloquant les fonctionnalités Club et la création de tournois.

**Piège — `exempt_until` ignoré en SQL.** `club_has_active_subscription`
(`20260622120000_subscription_billing_exemption.sql:36`) teste `exempt_from_billing = true`
**sans regarder `exempt_until`**, alors que `isBillingExempt`
(`src/lib/has-paid-access.ts:22-25`) l'honore. La colonne a été ajoutée après
(`20260622170729_…sql:1`) sans mise à jour de la fonction. **Une exemption expirée donne
donc encore accès via RLS et `can_create_tournament`.** Correction obligatoire mais
soumise à l'audit préalable du Lot 0 bis §28.7 : corriger à l'aveugle couperait des clubs
en production.

**Piège — rate limiter fail-open.** `checkRateLimit`
(`src/lib/rate-limit.server.ts:46-52`) retourne `true` en cas d'erreur DB. Toute exigence
fail-closed impose une variante dédiée.

**Tournois.** Module complet dans `src/modules/tournaments/`. `can_create_tournament`
autorise : superadmin, OU entitlement tournoi actif, OU admin/dirigeant d'un club dont
`club_has_active_subscription()` est vrai.

**Entitlements.** Aucun système centralisé, aucun quota, aucun `max_players` n'existe.
Mécanismes en place : `has-paid-access`, `club_has_active_subscription`, entitlements
tournois, feature flags V2 (`src/config/features.ts` + table `app_flags`).

**i18n.** 7 locales (`fr, en, de, es, it, nl, pt`), parité vérifiée en CI
(`bun run check:i18n`). Les libellés français cités ici sont la version `fr` des clés.

**Sécurité.** RLS par helpers SECURITY DEFINER (`is_team_staff`, `user_is_in_team`,
`has_club_role`…). Sur `subscriptions`, colonnes Stripe protégées par **REVOKE au niveau
colonne**. Tests : `tests/rls/`, `bun run test:rls`, `bun run check:guards`.

---

## 1. Modèle commercial cible

### 1.1 Offre Découverte (gratuite)

Portée : une équipe. Joueurs actifs : **maximum 15**. Coaches et staff : **illimités**.
Objectif : permettre une vraie découverte du produit.

L'offre ne doit pas permettre à un club entier d'utiliser gratuitement Clubero en
multipliant les équipes gratuites. Règles anti-contournement, configurables côté serveur
et jamais codées en dur dans les écrans :

```text
DISCOVERY_MAX_ACTIVE_PLAYERS_PER_TEAM = 15
DISCOVERY_MAX_TEAMS_PER_CREATOR       = 1
DISCOVERY_MAX_TEAMS_PER_CLUB          = 2
```

La couverture Découverte est rattachée à **l'équipe**, pas définitivement à son créateur ;
le quota par créateur s'évalue au moment de l'octroi (voir §6.1).

**Seules les équipes réellement en état Découverte consomment un quota.** Une équipe en
lecture seule ne réserve jamais une place Découverte — ni pour elle-même, ni pour son
porteur. Une équipe en essai, payante, couverte par le Club, archivée ou expirée ne
consomme rien.

```text
U13 Découverte · U15 Découverte · U17 lecture seule   → club à 2/2, pas 3/2
puis U13 devient payante                              → club à 1/2
→ U17 peut alors redevenir Découverte, sur demande explicite (§6.4)
```

Cette règle est structurellement garantie : le quota se compte sur les lignes de
couverture Découverte vivantes, et une équipe en lecture seule n'en possède aucune.

### 1.2 Offre Équipe

9,99 €/mois ou 99,99 €/an **par équipe**. Joueurs illimités. Coaches et staff illimités.
Toutes les fonctionnalités opérationnelles d'une équipe.

Chaque équipe possède sa propre souscription, sa propre périodicité et son propre
responsable de facturation :

```text
USAG Uckange
├── U13 — Offre Équipe mensuelle
├── U15 — Offre Équipe annuelle
├── U17 — Offre Découverte
└── Seniors — sans couverture, lecture seule
```

### 1.3 Offre Club (existante)

49 €/mois ou 490 €/an. Joueurs, équipes, coaches et membres illimités. Fonctionnalités
centrales et transverses. Couvre **toutes** les équipes rattachées au club.

---

## 2. Principe structurant : un vrai club existe toujours

Même en Découverte ou en offre Équipe, l'utilisateur crée ou rejoint un **vrai club
visible** :

```text
Club
└── Équipe          ← toujours

Compte personnel
└── Équipe isolée   ← jamais
```

`clubs.is_personal` reste réservé au parcours organisateur de tournoi existant et ne doit
pas servir de modèle produit.

L'utilisateur gère l'identité minimale de son club — nom, logo, sport principal,
informations publiques essentielles — sans accéder aux fonctionnalités centrales
réservées à l'offre Club.

---

## 3. Séparation stricte des concepts

```text
Club              = organisation, identité, rattachement des équipes
Équipe            = unité sportive
Couverture Découverte = couverture gratuite limitée d'une équipe
Team subscription = abonnement payant couvrant exactement une équipe
Club subscription = abonnement couvrant l'ensemble du club
Billing owner     = responsable du paiement d'une souscription Équipe
Créateur d'équipe = personne ayant créé l'équipe, sans propriété absolue sur les données
```

Notions à matérialiser :

```text
teams.created_by_user_id
team_subscriptions.billing_owner_user_id
couverture Découverte rattachée à l'équipe, avec un porteur de quota identifié
```

Le créateur ne devient pas propriétaire permanent des données du club. Il peut quitter
l'équipe à condition qu'un autre responsable opérationnel soit présent ou désigné, et —
s'il est billing owner — après transfert ou annulation (§13.2, §14).

---

## 4. Plusieurs coaches du même club

### 4.1 Coach 1 crée la première équipe

```text
USAG Uckange
└── U13 — Découverte — créée par Coach 1
```

### 4.2 Coach 2, déjà membre du club, ajoute une équipe

Coach 2 voit un bouton **« Ajouter une équipe »** et crée directement dans le club
existant — il ne recrée jamais le club :

```text
USAG Uckange
├── U13 — Découverte (Coach 1)
└── U15 — Découverte (Coach 2)
```

Chaque équipe a sa propre limite de 15 joueurs actifs. Les droits restent **à portée
équipe** : Coach 1 administre la U13, Coach 2 la U15, aucun ne reçoit automatiquement de
droits sportifs sur l'autre équipe. Les admins et dirigeants autorisés du club disposent
d'une vue transversale adaptée.

### 4.3 Coach 2 n'est pas encore membre du club

L'onboarding recherche les clubs similaires :

> Un espace « USAG Uckange » existe déjà sur Clubero. Souhaitez-vous demander à rejoindre
> ce club ou créer une structure différente ?
>
> [ Demander à rejoindre ce club ] [ Ce n'est pas mon club ]

La demande peut préciser : « Coach 2 souhaite rejoindre USAG Uckange et créer l'équipe
U15. » Après acceptation par un responsable autorisé : Coach 2 devient membre, la U15 est
créée dans le club existant, aucun second club n'est créé.

**Jamais d'ajout automatique** : la création d'un club distinct reste possible en cas de
faux positif.

### 4.4 Détection d'un club existant

La détection ne fusionne jamais automatiquement deux clubs sur le seul nom. Signaux
**indicatifs** : nom normalisé, ville, code postal, sport, logo, éventuel identifiant
fédéral futur. Le résultat est une suggestion, jamais une preuve.

Exigences de sécurité de l'endpoint de recherche (§0 : le limiteur existant est
fail-open, donc variante dédiée obligatoire) :

- rate limit **fail-closed** ;
- longueur minimale de recherche ;
- nombre de résultats plafonné, sans pagination ;
- **uniquement** : nom public, logo public, sport, ville approximative, identifiant
  opaque de demande ;
- jamais de membres, emails, rôles, facturation ni équipes privées ;
- journalisation des comportements suspects ;
- demandes de rattachement créées **côté serveur**.

### 4.5 Deux clubs identiques créés en parallèle — hors V1

Le cas existe :

```text
Club A : USAG Uckange — U13 — Coach 1
Club B : USAG Uckange — U15 — Coach 2
```

**Le rapprochement complet de deux clubs est explicitement hors périmètre V1.** Il
implique des changements de `club_id` sur toutes les équipes et leurs tables filles,
c'est-à-dire la zone la plus risquée de tout le chantier.

Périmètre V1 : signalement manuel du doublon à Clubero, et traitement hors produit. Le
rapprochement de clubs devient un chantier ultérieur indépendant, avec sa propre
spécification.

Ce qui reste en V1 : la **demande de rattachement** d'un utilisateur à un club existant
(§4.3), qui ne déplace aucune donnée.

---

## 5. Limite de joueurs de l'offre Découverte

```text
Découverte : 15 joueurs actifs
Équipe     : illimité
Club       : illimité
```

Ne **jamais** compter : parents, responsables légaux, coaches, assistants, membres du
staff, joueurs supprimés.

### 5.0 Définition du joueur actif — décision tranchée

La notion d'activité appartient à **la relation entre le joueur et l'équipe**, pas au
profil global. Un joueur peut être actif dans une équipe, archivé dans une autre,
transféré, ou rattaché à plusieurs contextes sportifs.

Ajouter sur `team_members` :

```text
status = 'active' | 'archived'      (défaut 'active')
```

Deux états suffisent en V1 ; `pending` et `left` pourront être ajoutés plus tard.

Prédicat de comptage — **adapté aux colonnes réellement présentes** (`team_members` n'a ni
`member_type` ni `deleted_at`, §0) :

```sql
team_members.team_id = :team_id
AND team_members.player_id IS NOT NULL   -- une ligne joueur, pas un membre du staff
AND team_members.status = 'active'
AND players.deleted_at IS NULL           -- profil global non supprimé
```

La suppression globale dans `players` reste réservée à la suppression ou à
l'anonymisation du profil — **jamais** à une simple sortie d'effectif. L'archivage dans
une équipe ne supprime ni le profil global ni l'historique sportif, ce qui préserve :
convocations, statistiques, présences, compositions et anciens événements.

Ce prédicat doit vivre dans une fonction centrale unique, jamais dupliqué.

### 5.1 Dépassement après essai

Une équipe qui termine son essai avec 22 joueurs et bascule en Découverte :

- aucun joueur supprimé, aucun joueur masqué ;
- les 22 joueurs restent pleinement utilisables ;
- l'ajout d'un nouveau joueur est bloqué ;
- l'import de joueurs supplémentaires est bloqué ;
- la restauration d'un joueur qui augmenterait l'effectif actif est bloquée.

> Votre équipe compte actuellement plus de 15 joueurs actifs, limite de l'offre
> Découverte. Vos données sont conservées, mais vous devez passer à l'offre Équipe pour
> ajouter ou réactiver d'autres joueurs.

### 5.2 Chemins à protéger

Création manuelle ; import CSV ; import multiple ; restauration d'un joueur ; transfert
d'un joueur vers l'équipe ; duplication éventuelle ; RPC et appels Supabase directs ;
server functions.

Le contrôle est **côté serveur et dans la base** pour les chemins critiques. Le front
affiche le message mais ne constitue jamais la protection.

### 5.3 Atomicité — exigence non négociable

Un contrôle applicatif `count` puis `insert` est **interdit** : deux imports concurrents
voyant chacun 14 joueurs peuvent monter à 16 ou plus.

Exigence : vérification et insertion dans **une même transaction**, avec verrou de ligne
sur l'équipe ; RPC transactionnelle comme seul chemin d'ajout ; trigger de défense en
profondeur.

**Le verrou ne s'applique qu'aux offres à quota.** Résoudre le quota **avant** de prendre
le verrou : si `maxPlayers = null` (offre Équipe ou Club), aucun verrou, aucun comptage,
insertion directe.

```text
quota = resolve_quota(team_id)
SI quota EST NULL  → insertion normale, sans verrou ni comptage
SINON              → FOR UPDATE, comptage, contrôle, insertion
```

Sans cette règle, une équipe de 300 joueurs en offre Club sérialiserait tous ses ajouts
sur un verrou qui ne sert à rien. La contention n'est justifiée que là où une limite
existe, c'est-à-dire uniquement en Découverte.

Test obligatoire : équipe à 14 joueurs actifs, quota 15, deux insertions concurrentes
réelles → **jamais plus de 15**.

### 5.3.1 Import CSV — refus atomique du lot entier

**Aucune insertion si l'import ferait dépasser le quota.** Pas d'insertion partielle.

```text
Équipe : 12 joueurs actifs — capacité restante : 3
CSV    : 6 nouveaux joueurs valides
Résultat : 0 joueur importé
```

> Cet import contient 6 nouveaux joueurs alors que votre équipe ne dispose que de 3 places
> en offre Découverte. Retirez au moins 3 joueurs du fichier ou passez à l'offre Équipe.

Avant écriture, calculer précisément ce qui **consomme réellement** du quota :

- joueurs actifs actuels ;
- nouveaux joueurs réellement uniques ;
- doublons internes au fichier ;
- doublons déjà présents dans l'équipe ;
- joueurs existants qui seraient simplement **mis à jour** (ne consomment rien) ;
- joueurs archivés qui seraient **réactivés** (consomment du quota).

Seules les créations et les réactivations augmentant l'effectif actif consomment le quota.
Validation et insertion dans une transaction cohérente ; deux imports concurrents ne
doivent jamais dépasser la limite.

### 5.4 Anti-contournement

Empêcher : archiver puis recréer les mêmes joueurs ; créer plusieurs équipes Découverte
fictives pour répartir un effectif ; créer des comptes différents pour dépasser la limite
par utilisateur ; déplacer en boucle les joueurs entre équipes gratuites.

Rester raisonnable pour la V1 : règles vérifiables, journalisation et alertes, plutôt
qu'un moteur anti-fraude complexe.

---

## 6. Essai, fin d'essai et éligibilité Découverte

**Essai Équipe : 14 jours** (décision validée, alignée sur l'essai Club existant).

### 6.1 Fin d'essai — règle consolidée

À la fin de l'essai sans paiement, la bascule vers Découverte a lieu **si et seulement si
l'équipe y est éligible** au moment de la bascule :

```text
quota club     : le club a strictement moins de 2 équipes Découverte actives
quota porteur  : le bénéficiaire n'a pas déjà une équipe Découverte active
```

Si les deux quotas sont respectés :

```text
Essai Équipe → Découverte
→ données intégralement conservées
→ limite de 15 joueurs actifs (effectif existant conservé même s'il dépasse — §5.1)
→ fonctionnalités Découverte
```

Si l'un des quotas est atteint :

```text
Essai Équipe → lecture seule (état « restricted », §16)
→ conservation intégrale des données
→ proposition Offre Équipe ou Offre Club
```

**Aucun grandfathering** ne permet de dépasser les quotas Découverte.

Exemple de référence :

```text
U13 — Découverte, portée par Coach 1   → club 1/2, Coach 1 : 1/1
U15 — Découverte, portée par Coach 2   → club 2/2
U17 — essai payant, créé par Coach 1

Fin de l'essai U17 : quota club atteint ET quota Coach 1 atteint
→ bascule refusée, U17 passe en lecture seule, upsell affiché
```

> Cette règle résout la contradiction entre « fin d'essai → Découverte » et les quotas
> Découverte : la bascule est **conditionnelle**, jamais automatique.

L'évaluation se fait **au moment de la bascule**, pas au début de l'essai — les quotas
peuvent avoir été consommés entre-temps. Elle doit être transactionnelle et verrouillée
(deux fins d'essai simultanées dans un même club ne doivent jamais produire 3 équipes
Découverte).

### 6.2 Anti-abus sur les essais

Un seul essai Équipe par utilisateur ou customer Stripe ; pas de nouvel essai automatique
pour chaque équipe créée ; vérification des essais précédents du créateur et du customer ;
refus ou validation manuelle en cas de comportement suspect.

### 6.3 Friction produit assumée

Avec « 1 Découverte par créateur » et « 1 essai par utilisateur », un coach seul gérant
deux catégories ne peut avoir ni deux équipes gratuites ni deux essais : **sa deuxième
équipe est payante immédiatement**, sauf si elle est créée et portée par un autre coach
éligible du même club.

C'est une décision UX assumée, pas un défaut. Elle doit être **annoncée avant la fin du
wizard**, avec un message distinguant les deux causes (quota utilisateur vs quota club),
car la solution proposée diffère.

### 6.4 Libération des quotas Découverte

Une équipe libère **immédiatement** sa place Découverte lorsqu'elle devient payante, passe
sous couverture Club, est archivée, est supprimée logiquement, ou perd son statut
Découverte.

**Aucune autre équipe ne bascule automatiquement vers Découverte.** Une bascule
rétroactive silencieuse serait dangereuse : une modification de facturation sur une équipe
provoquerait un changement d'offre sur une autre.

```text
U13 — Découverte      U15 — Découverte      U17 — lecture seule (fin d'essai)
puis U13 devient payante
→ une place Découverte se libère pour le club
→ U17 NE bascule PAS automatiquement
```

L'équipe en lecture seule peut demander explicitement l'activation :

> Une place en offre Découverte est désormais disponible pour ce club. Activer l'offre
> Découverte pour cette équipe.

Au clic, revérifier **atomiquement** : quota du club, quota du bénéficiaire, statut de
l'équipe, absence de conflit concurrent. **Aucune place n'est réservée implicitement** —
deux équipes peuvent demander la même place, une seule l'obtient.

---

## 7. Fonctionnalités par offre

### 7.1 Découverte

À préciser dans le Lot 0 bis, mais au minimum : gestion basique de l'équipe ; jusqu'à
15 joueurs actifs ; staff illimité ; création d'événements ; convocations ; réponses des
parents et joueurs ; présences ; communication de base. Certaines fonctions avancées
peuvent être limitées commercialement, **sans rendre l'offre inutilisable**.

### 7.2 Équipe

Joueurs illimités ; parents et responsables légaux ; coaches et staff illimités ; matchs ;
entraînements ; événements ; convocations ; réponses ; présences ; compositions ;
disponibilités joueurs et staff ; besoins d'événement ; mur d'équipe ; mur staff ;
sondages ; documents d'équipe ; notifications ; emails transactionnels ; calendrier ;
statistiques individuelles et d'équipe existantes ; invitations ; import de joueurs.

### 7.3 Club uniquement

Exclus de Découverte et d'Équipe : mur général du club ; communication globale ; groupes
transverses ; statistiques consolidées ; tableau de bord central ; gestion centralisée de
tous les membres ; réunions Club ; documents communs ; gestion financière globale ; CRM ;
sponsoring ; fonctions premium Club futures ; création et administration de tournois via
l'offre Club.

---

## 8. Modèle technique de couverture

```sql
clubs.coverage_mode text NOT NULL DEFAULT 'club'
  CHECK (coverage_mode IN ('club', 'per_team'))
```

```text
club     = offre Club actuelle et comportement historique
per_team = club réel dont les équipes sont couvertes individuellement
           par Découverte, essai ou abonnement Équipe
```

Tous les clubs existants restent en `coverage_mode='club'`. L'onboarding Découverte ou
Équipe crée un club en `per_team`. Le trigger `auto_create_trial_subscription` doit
**ignorer les clubs `per_team`**. Le parcours tournoi personnel reste inchangé.

---

## 9. Garde-fous en base de données

Les invariants critiques ne doivent dépendre ni du code applicatif ni des tests.

### 9.1 Interdiction d'une offre Club active sur un club `per_team`

Garde-fou DB empêchant qu'une ligne `subscriptions` active, en essai ou exemptée soit
associée **durablement** à un club `coverage_mode='per_team'`. Seule exception : le flux
contrôlé de passage vers l'offre Club, qui bascule explicitement le club en
`coverage_mode='club'`.

Un `CHECK` inter-tables étant impossible, utiliser un trigger, une fonction
transactionnelle ou une RPC SECURITY DEFINER dédiée. **Le garde-fou doit couvrir les
écritures via service role et `supabaseAdmin`.**

### 9.2 Tournois — contrôle explicite

Modifier `can_create_tournament` pour vérifier explicitement :

```text
clubs.coverage_mode = 'club'
AND club_has_active_subscription(club_id) = true
```

Ne pas déduire le mode commercial de la seule existence d'une souscription. Tests :

```text
club per_team + équipe Découverte                     → tournoi refusé
club per_team + équipe payante                        → tournoi refusé
club per_team + plusieurs équipes payantes            → tournoi refusé
club per_team + ligne subscriptions injectée par erreur → tournoi refusé
club club + abonnement Club actif                     → tournoi autorisé
entitlement Tournoi valide                            → comportement existant conservé
```

---

## 10. Table `team_subscriptions`

Couvre exactement une équipe. Champs : `id`, `team_id`, `club_id`,
`billing_owner_user_id`, `stripe_customer_id`, `stripe_subscription_id`,
`stripe_price_id`, `plan_code`, `status`, `trial_start`, `trial_end`,
`current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`,
`exempt_from_billing`, `exempt_until`, `exemption_reason`, `exempted_by`, `created_at`,
`updated_at`.

`club_id` est dénormalisé pour la RLS et doit toujours correspondre au club de l'équipe
(trigger de cohérence).

Réutiliser l'enum `subscription_status` existant pour les statuts Stripe. **Ne pas y
ajouter `grace`, `expired` ou `read_only`** : ce sont des états dérivés Clubero (§17).

---

## 11. Souscriptions incomplètes et unicité

Conserver un garde-fou empêchant plusieurs souscriptions concurrentes pour une équipe.

Mais un checkout abandonné en statut `incomplete` **ne doit pas bloquer l'utilisateur
avec une erreur SQL** pendant ~24 heures. Avant tout nouveau checkout :

1. rechercher une souscription vivante ou incomplète ;
2. vérifier son état réel auprès de Stripe ;
3. si une session récente est reprenable, la réutiliser ;
4. si Stripe confirme l'expiration, passer la ligne à `incomplete_expired` ;
5. si elle doit être abandonnée, l'invalider proprement ;
6. seulement ensuite créer une nouvelle session.

**Ne jamais exposer une erreur d'unicité brute.** L'index reste un garde-fou ultime, pas
la logique applicative.

---

## 12. Exemptions de facturation

Exemptions Équipe : **validées**. Champs `exempt_from_billing`, `exempt_until`,
`exemption_reason`, `exempted_by`. Règle unique :

```text
exempt_from_billing = true
AND (exempt_until IS NULL OR exempt_until > now())
```

**Corriger d'abord le bug existant** où `exempt_until` est ignoré côté SQL pour l'offre
Club (§0) — sous contrôle de l'audit du Lot 0 bis §28.7. Ne pas étendre une logique
d'exemption incorrecte aux équipes.

Helpers centraux : `club_billing_exemption_is_active(club_id)`,
`team_billing_exemption_is_active(team_id)`. Une exemption active couvre l'équipe **sans
créer de fausse souscription Stripe**.

---

## 13. Responsable de facturation

Chaque souscription Équipe possède **exactement un** billing owner fonctionnel. Il paie,
accède au portail Stripe, change la périodicité, annule, réactive, reçoit les
notifications financières. Il ne reçoit **aucun droit sportif supplémentaire**.

### 13.1 Permissions distinctes

Deux notions séparées : `can_view_team_billing_status` et `can_manage_team_billing`.

| Profil | Droits |
|---|---|
| Billing owner | Gestion complète de sa souscription |
| Financial admin explicitement autorisé | Gestion selon les règles définies |
| Admin ou dirigeant du club | Voit couverture, plan, statut et identité du billing owner. **Ne voit pas** les factures personnelles ni le moyen de paiement. **Ne reçoit pas** automatiquement l'accès au portail Stripe du payeur |
| Coach non-payeur | Statut fonctionnel uniquement (`active`, essai, grâce, lecture seule). **Ne lit pas** directement `team_subscriptions` |
| Superadmin Clubero | Accès opérationnel nécessaire et audité |

### 13.2 Transfert

Transactionnel côté base, journalisé, notifié, sécurisé, **sans recréation de la
souscription Stripe**. Vérifier l'éligibilité du nouveau responsable. Empêcher le départ
du billing owner tant que la responsabilité n'est pas transférée, la souscription
annulée, ou la situation explicitement résolue.

Le départ d'un coach non-payeur n'a aucun impact sur la souscription.

---

## 14. Suppression et anonymisation RGPD du billing owner

Avant toute suppression ou anonymisation de compte, vérifier :

```text
user_has_active_billing_responsibilities(user_id)
```

Couvrir : souscription active ; période d'essai ; statut `incomplete` ; paiement en
échec ; annulation programmée ; migration vers Club en cours ; exemption dont
l'utilisateur est responsable ; obligations Stripe encore actives.

### 14.1 Ne jamais bloquer indéfiniment une demande de suppression

Le droit à l'effacement n'est pas absolu — certaines données peuvent être conservées
lorsqu'une obligation légale, comptable ou la défense de droits en justice l'exige — mais
il ne peut pas être **suspendu indéfiniment** au motif qu'un transfert n'a pas eu lieu.
Forcer une personne à rester cliente n'est pas une option.

Flux produit retenu :

1. demande de suppression enregistrée ;
2. **proposition de transfert** à un autre responsable éligible ;
3. en l'absence de transfert : désactivation du renouvellement de la souscription ;
4. retrait **immédiat** des accès personnels et opérationnels non nécessaires (portail
   Stripe, rôles opérationnels) ;
5. maintien de la couverture **jusqu'à la fin de la période déjà payée**
   (`current_period_end`) — le service déjà réglé n'est pas coupé pour les autres membres ;
6. à l'échéance : bascule de l'équipe vers Découverte si éligible, sinon lecture seule ;
7. suppression des données de profil non nécessaires ;
8. isolation et conservation **restreinte** des seules données requises par les
   obligations comptables, fiscales ou contentieuses, en environnement d'archivage à accès
   limité ;
9. effacement à l'expiration des durées légales applicables.

### 14.2 Pseudonymisation ≠ anonymisation

Remplacer le nom du payeur par un identifiant technique **n'est pas une anonymisation**
si Clubero ou Stripe peut encore relier cet identifiant à la personne : c'est une
pseudonymisation, et les obligations RGPD continuent de s'appliquer. Une anonymisation
véritable rend l'identification irréversible. Ne jamais présenter la substitution par une
identité technique comme un effacement définitif.

### 14.3 Invariants techniques

Ne jamais produire : une `team_subscription` renouvelable sans responsable ; un customer
Stripe sans interlocuteur fonctionnel ; une facture active sans destinataire ; ni la
suppression de preuves comptables requises.

### 14.4 Validation juridique requise

Point ouvert assumé, à instruire hors chantier technique : durée de conservation selon la
société estonienne et les marchés servis ; rôle exact de Stripe et de Clubero
(responsable de traitement / sous-traitant) ; données minimales à conserver ; information
remise à la personne ; distinction explicite entre suppression du compte, résiliation de
l'abonnement et archivage légal.

---

## 15. RLS et paywall à portée équipe

Le paywall ne doit pas reposer uniquement sur les server functions : le code contient de
nombreux appels directs du client vers Supabase.

**Exigence.** Toute mutation utilisateur portant sur une équipe sans couverture d'écriture
doit être refusée **au niveau RLS ou via une RPC sécurisée**. Les contrôles front-end et
server functions sont complémentaires, jamais la protection principale.

### 15.1 Inventaire obligatoire

Avant modification, inventorier toutes les mutations directes Supabase portant sur des
données d'équipe : fichier ; table ou RPC ; opération ; rôle utilisateur ; équipe
déductible depuis quelle colonne ; couverture requise ou non ; policy actuelle ;
modification proposée ; risque de régression. Livrable du Lot 0 bis §28.2.

### 15.2 Classification des mutations (A/B/C/D)

Ne pas ajouter aveuglément `team_has_paid_access()` dans toutes les policies.

**A — Création et administration** (`canManageTeamContent`). Bloquée après la grâce :
créer un événement ; modifier substantiellement un événement ; envoyer une nouvelle
convocation ; ajouter des joueurs ; créer une publication ; créer un sondage ; créer un
besoin ; inviter de nouveaux membres ; ajouter un document ; gérer les compositions ;
modifier la configuration d'équipe.

**A′ — Continuité et sécurité d'événements existants** (`canOperateExistingEvents`).
**Maintenue même en lecture seule** : annuler un événement existant ; notifier une
annulation ; consulter les réponses ; retirer une convocation erronée ; clôturer un
besoin.

> Justification : il serait dangereux d'empêcher un coach d'annuler un entraînement parce
> que le paiement a expiré. Les familles se déplaceraient pour un événement annulé sans en
> être informées. La continuité et la sécurité priment sur le levier commercial.

**B — Réponses à un objet existant** (`canRespondToExistingObjects`,
`canAcceptTeamInvitation`). **Autorisées pendant la grâce et en lecture seule**, tant que
l'objet existe et que l'utilisateur y est légitimement lié : répondre présent ou absent ;
modifier sa réponse avant l'événement ; répondre à un sondage existant ; indiquer une
disponibilité ; candidater à un besoin existant ; consulter les informations d'un
événement ; télécharger un document déjà accessible ; accepter une invitation.

**C — Mutations système.** Webhooks, cron, service role, traitements internes : non
bloquées par la RLS utilisateur, mais gardées et auditées.

**D — Lectures.** Les données restent généralement consultables après expiration.

> Cette classification A/B/C/D porte sur les **mutations**. Les **états d'accès** sont
> nommés `active / grace / restricted / locked` (§17) pour éviter toute confusion.

---

## 16. Entitlements V1

Ne pas construire un moteur générique de plans. API centrale typée :

```text
get_team_coverage(team_id)
get_team_entitlements(user_id, team_id)
team_has_paid_access(team_id)
team_has_write_access(team_id)
club_has_any_team_coverage(club_id)
```

Objet cible :

```ts
{
  coverage:
    | "club_plan" | "team_plan" | "team_trial" | "discovery"
    | "grace" | "expired" | "none",
  accessState: "active" | "grace" | "restricted" | "locked",

  canReadTeam: boolean,

  // Trois niveaux distincts — ne PAS retomber sur un unique canWriteTeam
  canManageTeamContent: boolean,        // catégorie A  — création et administration
  canOperateExistingEvents: boolean,    // catégorie A′ — continuité et sécurité
  canRespondToExistingObjects: boolean, // catégorie B  — réponses
  canAcceptTeamInvitation: boolean,     // catégorie B

  canManageTeam: boolean,
  canInviteTeamStaff: boolean,
  canManagePlayers: boolean,
  canCreateEvents: boolean,
  canUseTeamWall: boolean,

  canUseClubFeatures: boolean,
  canManageClubIdentity: boolean,     // nom, logo, sport — distinct du précédent
  canCreateTournament: boolean,

  maxPlayers: number | null,          // null = illimité
  discoveryTeamsRemainingForClub: number | null,
  discoveryTeamsRemainingForCreator: number | null
}
```

`get_team_coverage` est la **source unique** des états dérivés.

Correspondance états → droits :

```text
active     : tout autorisé selon l'offre (canUseClubFeatures false hors offre Club)

grace      : usage complet conservé + alerte au billing owner
             canManageTeamContent      = true
             canOperateExistingEvents  = true
             canRespondToExistingObjects = true

restricted : canManageTeamContent      = false
             canOperateExistingEvents  = true    ← annulation, notification, retrait
             canRespondToExistingObjects = true
             canAcceptTeamInvitation   = true
             lectures conservées

locked     : équipe archivée ou suspendue — lectures seules
```

Pendant la grâce, l'usage reste **complet** : plutôt que de créer un état intermédiaire
complexe, on conserve le service et on alerte le payeur.

---

## 17. Machine à états : grâce, expiration, lecture seule

États dérivés des données Stripe et des dates :

```text
subscription active + période valide          → team_plan        (active)
trialing + trial_end future                   → team_trial       (active)
Découverte valide                             → discovery        (active)
past_due + grace_end future                   → grace            (grace)
past_due + grace_end dépassée                 → expired          (restricted)
unpaid                                        → expired          (restricted)
cancel_at_period_end + period_end future      → team_plan jusqu'à l'échéance
canceled + period_end dépassée                → discovery ou expired selon éligibilité §6.1
Club actif                                    → club_plan, prioritaire sur tout le reste
exemption active (club ou équipe)             → couverture équivalente sans souscription
```

Ne pas créer de statuts Stripe artificiels.

### 17.1 Job planifié

Route cron ou tâche planifiée **idempotente** pour : détecter les fins d'essai ; évaluer
l'éligibilité Découverte et basculer ou passer en lecture seule (§6.1) ; détecter les
fins de grâce ; journaliser les transitions ; envoyer les notifications ; détecter les
incohérences ; réconcilier périodiquement Stripe et Clubero.

Préciser : fréquence ; mécanisme de verrouillage ; idempotence ; journalisation ; reprise
après échec.

### 17.2 Période de grâce — décision tranchée

```text
TEAM_BILLING_GRACE_DAYS = 14
```

Configurable côté serveur, **sans migration**. La grâce démarre au **premier** échec de
paiement ouvrant la période, et **n'est jamais réinitialisée** par les tentatives Stripe
suivantes ni par le rejeu d'un webhook :

```text
invoice.payment_failed le 1er septembre
→ grace_started_at = 1er septembre   (posé une seule fois)
→ grace_end        = 15 septembre

invoice.payment_failed le 5 septembre (relance Stripe)
→ grace_started_at INCHANGÉ, grace_end INCHANGÉ
```

C'est ce qui distingue `grace_started_at` (posé une fois, jamais écrasé) d'un simple
`last_payment_failed_at`. Sans cette règle, les relances automatiques de Stripe
prolongeraient la grâce indéfiniment.

Pendant la grâce, l'usage est complet (§16). À l'expiration : Découverte si tous les
quotas sont respectés (§6.1), sinon lecture seule.

---

## 18. Passage de l'offre Équipe à l'offre Club

Sur le **même club**. Aucun changement de `club_id`, aucun déplacement de joueurs ou
d'événements. C'est une **saga idempotente**, pas une transaction SQL unique.

### 18.1 Ordre obligatoire, sans trou de couverture

1. lancer le checkout Club ;
2. attendre la confirmation Stripe de l'abonnement Club actif ;
3. enregistrer ou confirmer la souscription Club ;
4. basculer `coverage_mode='club'` via le flux contrôlé (§9.1) ;
5. la précédence `club_plan` couvre immédiatement toutes les équipes ;
6. identifier toutes les `team_subscriptions` encore vivantes ;
7. marquer la migration financière comme en cours ;
8. demander à Stripe leur arrêt selon la stratégie commerciale ;
9. traiter les webhooks de confirmation ;
10. journaliser chaque résultat ;
11. marquer la migration terminée lorsque toutes sont résolues.

**La couverture Club est toujours active avant l'arrêt des abonnements Équipe.**

### 18.2 Prorata

Décision retenue : activation immédiate de l'offre Club, arrêt immédiat des abonnements
Équipe, **prorata ou crédit calculé exclusivement par Stripe**. Aucun calcul maison. Ne
jamais promettre un remboursement avant le résultat réel de Stripe.

Tester : une équipe mensuelle ; plusieurs mensuelles ; une annuelle ; périodicités
mixtes ; dates de renouvellement différentes ; paiement échoué ; annulation déjà
programmée ; webhook rejoué. Prévoir une reprise manuelle si une annulation Stripe échoue.

---

## 19. Anti-double facturation

**Club actif → Équipe.** Si un club possède une offre Club active : interdire tout nouveau
checkout Équipe ; signaler que l'équipe est déjà couverte ; ne jamais créer de
`team_subscription` supplémentaire.

**Équipe → Club.** Suit la saga §18.

**Résiliation Club.** Aucune souscription Équipe recréée automatiquement ; aucune carte
débitée sans consentement ; les équipes deviennent Découverte **si elles sont éligibles**
(§6.1), sinon lecture seule ; un checkout explicite est requis pour l'offre Équipe.

---

## 20. Inventaire des lecteurs de `subscriptions`

Avant le Lot 1, rechercher tous les endroits supposant qu'un club possède une ligne dans
`subscriptions` : `.single()`, `.maybeSingle()`, jointures, helpers, hooks, gardes de
routes, dashboards, superadmin, assistant IA, feature contexts, pages de facturation,
exemptions, trial reminders, notifications, scripts et tests.

Tableau attendu : fichier/fonction ; hypothèse actuelle ; comportement sur club
`per_team` ; risque ; modification requise ; lot concerné.

**Un club `per_team` peut légitimement n'avoir aucune ligne `subscriptions`. Aucun écran
ni helper ne doit planter dans ce cas.** Livrable du Lot 0 bis §28.3.

---

## 21. CI et dette existante

Le projet possède déjà des contrôles rouges. Avant d'utiliser `bun run check:i18n`,
`bun run lint`, `bun run check:guards`, `bun run test:rls` comme critères de sortie :

**Option recommandée** — corriger la dette existante avant le Lot 1 (clés `groups.*`
manquantes, lint existant, bug SQL `exempt_until`).

**Option de repli** — baseline documentée : erreurs présentes avant le chantier, nombre
exact, fichiers concernés, aucun nouveau défaut autorisé. Les critères de sortie sont
alors formulés « aucune nouvelle erreur par rapport à la baseline », et non comme un faux
vert inatteignable.

---

## 22. RLS de `team_subscriptions`

Lecture directe limitée à : billing owner ; financial admin autorisé ; superadmin ;
éventuellement admin du club pour une vue restreinte via RPC ou vue dédiée. **Les coaches
non-payeurs n'accèdent jamais directement à la table.**

RPC de statut simplifié pour les membres de l'équipe :

```text
get_team_billing_status(team_id)
→ coverage, plan public, trial_end éventuel, current_period_end éventuel,
  can_manage_billing, upgrade_required
```

Ne jamais exposer : identifiants Stripe ; moyen de paiement ; factures ; adresse de
facturation ; customer Stripe ; informations personnelles non nécessaires du billing
owner. Conserver les **REVOKE colonne** sur les identifiants Stripe. Écritures uniquement
par fonctions serveur, webhook ou service role contrôlé.

---

## 23. Webhooks Stripe

Étendre le handler existant — **ne pas créer de second webhook**. Metadata posées **à la
fois sur la session Checkout et sur la souscription Stripe** :

```text
metadata.purpose = "team_plan"
metadata.team_id, metadata.club_id, metadata.billing_owner_user_id, metadata.plan
```

Événements : `checkout.session.completed` ;
`customer.subscription.created/updated/deleted/trial_will_end/paused/resumed` ;
`invoice.payment_succeeded` ; `invoice.payment_failed`.

Idempotence via `stripe_webhook_events`. Réconciliation par `stripe_subscription_id`
lorsque les metadata sont absentes ou partielles. **Un événement sans
`purpose='team_plan'` continue de suivre le flux Club ou Tournoi actuel.**

---

## 24. Onboarding

Choix proposés (libellés simplifiables en UI) :

```text
Je souhaite tester Clubero avec une équipe
Je souhaite gérer une ou plusieurs équipes
Je représente un club
Je souhaite organiser un tournoi
```

### 24.1 Parcours Découverte ou Équipe

1. création du compte ; 2. recherche d'un club existant ; 3. demande de rattachement
éventuelle ; 4. sinon création d'un vrai club ; 5. nom, logo optionnel, sport,
localisation ; 6. création de la première équipe ; 7. choix Découverte, mensuel ou
annuel ; 8. essai éventuel ; 9. invitation du staff.

### 24.2 Club existant détecté

Jamais d'ajout automatique — demande de rattachement. La création d'un club différent
reste possible en cas de faux positif.

### 24.3 Limites Découverte annoncées en amont

Avant création d'une équipe Découverte, vérifier : nombre d'équipes Découverte créées par
cet utilisateur ; nombre d'équipes Découverte actives dans le club ; éligibilité à un
nouvel essai.

> Ce club utilise déjà le nombre maximum d'équipes en offre Découverte. Vous pouvez créer
> cette équipe avec l'offre Équipe à 9,99 € par mois ou passer à l'offre Club.

---

## 25. Upsell Club

**Ne jamais bloquer l'ajout d'une équipe payante.** Seuils :

```text
3 équipes payantes → information discrète
4 équipes payantes → recommandation visible
5 équipes payantes et plus → recommandation forte
```

Calcul : 4 × 9,99 € = 39,96 €/mois ; 5 × 9,99 € = 49,95 €/mois ; offre Club = 49 €/mois.
Pour les abonnements annuels, coût mensuel normalisé : 99,99 € / 12.

> Vos abonnements Équipe représentent actuellement environ 49,95 € par mois. L'offre Club
> à 49 € par mois est plus avantageuse et inclut les fonctionnalités centrales du club.

Upsell informatif, jamais forcé.

---

## 26. Upsell Tournoi

L'offre Équipe ne permet ni la création ni l'administration de tournois. Elle permet à
l'équipe de **participer** à un tournoi tiers selon les flux existants.

> La création de tournois n'est pas incluse dans l'offre Équipe. Vous pouvez activer
> séparément une offre Tournoi.

CTA principal : **Découvrir l'offre Tournoi**. Afficher les offres existantes (tournoi
unique, pass ou offre annuelle, contact Clubero). Jamais d'erreur technique ni de page
vide. Tracker `tournament_upsell_viewed`.

---

## 27. Exigences de tests

### 27.1 RLS

Matrice minimale — 14 profils : anonyme ; utilisateur sans lien ; joueur ; parent ;
coach ; assistant coach ; dirigeant ; admin ; financial admin ; coach d'une autre équipe
du même club ; membre d'un autre club ; billing owner ; ancien billing owner ; superadmin.

Pour chaque policy : autorisé ; refusé ; cross-club ; après changement de rôle ; après
transfert du billing owner ; après expiration de couverture.

### 27.2 Découverte

```text
1re équipe Découverte d'un utilisateur          → autorisée
2e équipe Découverte du même utilisateur        → refusée
1re équipe Découverte du club                   → autorisée
2e équipe Découverte du club par un autre coach → autorisée
3e équipe Découverte du club                    → refusée
15 joueurs actifs                               → autorisé
16e joueur                                      → refusé
joueur supprimé                                 → non compté
restauration au-dessus de la limite             → refusée
fin d'essai avec 22 joueurs, quotas OK          → Découverte, données conservées, ajout refusé
fin d'essai, quota club atteint                 → lecture seule, pas de Découverte
fin d'essai, quota créateur atteint             → lecture seule, pas de Découverte
deux fins d'essai simultanées, 1 place libre    → exactement une bascule
deux insertions concurrentes à 14/15 joueurs    → exactement une réussite, jamais 16
```

### 27.3 Tournois

Les six cas du §9.2, garde-fous DB inclus.

### 27.4 Stripe

Checkout ; checkout abandonné ; reprise ; `incomplete_expired` ; succès ; échec ;
annulation ; réactivation ; changement mensuel/annuel ; passage Club ; rejeu webhook ;
métadonnées manquantes ; plusieurs équipes ; plusieurs billing owners ; utilisateur
multi-clubs.

### 27.5 RGPD

Suppression : coach sans facturation ; billing owner actif ; billing owner avec annulation
programmée ; ancien billing owner ; billing owner pendant migration Club ; utilisateur
supprimé après transfert valide.

### 27.6 Sécurité de la recherche de club

Rate limit fail-closed sous erreur DB simulée ; longueur minimale ; plafond de résultats ;
absence de tout champ sensible dans la réponse.

---

## 28. Lot 0 bis obligatoire

Document dédié (`docs/specs/offre-equipe-lot-0-bis.md`) contenant :

```text
28.1 Garde-fous DB
28.2 Inventaire des mutations directes Supabase
28.3 Inventaire des lecteurs de subscriptions
28.4 Saga Équipe → Club
28.5 Machine à états
28.6 RGPD et billing owner
28.7 Dette CI et bug exempt_until
28.8 Clubs identiques et rattachement
28.9 Quotas Découverte et définition du joueur actif
```

---

## 29. Découpage des lots

- **Lot 0 — Architecture initiale.** Produit.
- **Lot 0 bis — Durcissement et inventaires.** Obligatoire avant tout code fonctionnel.
- **Lot 1 — Modèle de couverture.** `clubs.coverage_mode` ; modèle Découverte ;
  `team_subscriptions` ; exemptions corrigées ; helpers de couverture ; garde-fous DB ;
  trigger d'essai ; RLS de base ; tests tournoi ; feature flag.
- **Lot 2 — Onboarding et rattachement simple.** Recherche de club ; demande de
  rejoindre ; création de club ; première équipe ; choix Découverte ou Équipe ; limites
  gratuites annoncées ; invitation staff.
- **Lot 3 — Stripe et facturation Équipe.** Checkout ; webhook ; portail ; changement de
  périodicité ; gestion `incomplete` ; paiement échoué ; grâce ; annulation ;
  réactivation ; exemptions.
- **Lot 4 — Équipes supplémentaires.** Plusieurs équipes ; limites Découverte par créateur
  et par club ; périodicités mixtes ; écran de synthèse ; upsell Club.
- **Lot 5 — Enforcement transverse.** RLS/RPC des mutations ; lecture seule ;
  fonctionnalités autorisées ; exclusions Club ; tournois ; i18n ; tracking.
  **Lot à haut risque : à revoir table par table.**
- **Lot 6 — Billing owner et RGPD.** Transfert ; permissions financières ; suppression de
  compte ; confidentialité ; multi-clubs ; audit.
- **Lot 7 — Passage vers Club.** Saga idempotente ; couverture Club d'abord ; arrêt Stripe
  ensuite ; prorata Stripe ; réconciliation ; reprise après échec.
- **Lot 8 — Transfert d'une équipe vers un autre club.** Invitation ; validation ;
  détection et **blocage** des conflits d'équipes ; changement de `club_id` ; impact RLS ;
  conservation des données. **Le rapprochement de deux clubs est hors périmètre et fait
  l'objet d'un chantier ultérieur indépendant** (§4.5).

---

## 30. Feature flag

Flag `team_plan_v1` masquant : nouveaux parcours d'onboarding ; pricing Équipe ; CTA ;
checkout ; pages de facturation ; ajout d'équipes payantes.

Le flag ne doit **jamais** désactiver : webhooks ; synchronisation Stripe ; tâches cron ;
lecture des souscriptions existantes ; gestion des utilisateurs déjà engagés.

Les lots 7 et 8 doivent pouvoir avoir des flags séparés.

---

## 31. Critères d'acceptation consolidés

1. Tout utilisateur Découverte ou Équipe appartient à un vrai club visible.
2. Deux coaches du même club peuvent créer chacun une équipe Découverte dans le même
   espace.
3. Un utilisateur ne peut créer qu'une équipe Découverte.
4. Un club ne peut avoir que deux équipes Découverte actives.
5. Une équipe Découverte est limitée à 15 joueurs actifs.
6. Les parents, coaches et staff ne sont jamais comptés dans la limite.
7. Une équipe en offre Équipe ou Club a un nombre illimité de joueurs.
8. Aucun joueur n'est supprimé lors d'une bascule vers Découverte ; un effectif de 22
   joueurs reste utilisable, seuls les ajouts sont bloqués.
9. **La bascule en fin d'essai vers Découverte n'a lieu que si les deux quotas sont
   respectés ; sinon l'équipe passe en lecture seule. Aucun grandfathering.**
10. **Les limites de joueurs et les quotas Découverte résistent aux écritures
    concurrentes** : deux opérations simultanées ne dépassent jamais le quota.
11. Toutes les limites sont contrôlées côté serveur et, pour les chemins critiques, en
    RLS/RPC.
12. Les clubs similaires sont suggérés, jamais fusionnés automatiquement.
13. Aucun transfert n'est effectué sans validation ; deux équipes équivalentes ne sont
    jamais fusionnées automatiquement.
14. **Aucun rapprochement de deux clubs n'est implémenté en V1.**
15. Une offre Équipe ou Découverte ne permet jamais de créer un tournoi.
16. Le blocage tournoi est protégé par la DB **et** par le contrôle explicite de
    `coverage_mode` dans `can_create_tournament`.
17. Une ligne `subscriptions` injectée par erreur ne débloque pas un club `per_team`.
18. `club_has_active_subscription` conserve sa sémantique Club.
19. Les états Découverte, grâce et lecture seule sont dérivés par une source unique.
20. Un job idempotent traite les fins d'essai et de grâce.
21. Le passage Équipe → Club active toujours la couverture Club **avant** d'arrêter les
    abonnements Équipe.
22. Stripe calcule les proratas ; aucun calcul maison de remboursement.
23. Une suppression RGPD ne peut laisser une souscription orpheline.
24. Les checkouts `incomplete` sont gérés proprement, sans erreur d'unicité brute.
25. Les coaches non-payeurs ne voient aucune donnée financière personnelle.
26. Les admins voient la couverture sans recevoir automatiquement l'accès au portail du
    payeur.
27. **Les mutations de catégorie B (réponses, acceptation d'invitation) restent
    autorisées en grâce et en lecture seule.**
27 bis. **Les mutations de catégorie A′ restent autorisées en lecture seule** : un coach
    peut annuler un événement existant et en notifier les participants même après
    expiration de la couverture.
27 ter. **La grâce dure 14 jours à compter du premier échec** et n'est jamais réinitialisée
    par une relance Stripe ou un webhook rejoué.
27 quater. **Un import CSV dépassant le quota est refusé intégralement**, en ne comptant
    comme consommatrices que les créations et réactivations.
27 quinquies. **La libération d'une place Découverte ne déclenche aucune bascule
    automatique** ; la réactivation est explicite et revérifiée atomiquement.
27 sexies. **Une demande de suppression RGPD n'est jamais bloquée indéfiniment** : le
    renouvellement est désactivé, la couverture court jusqu'à `current_period_end`, puis
    l'équipe bascule en Découverte ou en lecture seule.
28. Les mutations directes Supabase sont inventoriées et sécurisées.
29. Les lecteurs de `subscriptions` supportent l'absence de ligne pour un club `per_team`.
30. Les exemptions expirées ne donnent plus accès, après régularisation documentée.
31. La CI ne subit aucune nouvelle régression par rapport à la baseline validée.
32. Aucun Lot 1 ne commence avant validation du Lot 0 bis.

---

## 32. Décisions validées

```text
Essai Équipe : 14 jours
Fin d'essai : bascule vers Découverte SI ÉLIGIBLE, sinon lecture seule — sans grandfathering
Limite Découverte : 15 joueurs actifs
Une équipe Découverte par créateur
Deux équipes Découverte par club
Offre Équipe : joueurs et staff illimités
Exemptions Équipe : oui
Feature flag : oui
Passage Club : couverture immédiate puis arrêt des team subscriptions
Prorata : Stripe uniquement
Upsell Club : informatif à 3, visible à 4, fort à 5
Tournoi : offre séparée existante
Pas de fusion automatique d'équipes ni de clubs
Rapprochement de deux clubs : hors V1, chantier ultérieur
Contrôle tournoi : coverage_mode explicite + garde-fou DB

— tranché en dernier lieu —
Période de grâce : TEAM_BILLING_GRACE_DAYS = 14, configurable, non réinitialisable
Grâce : usage complet conservé (pas d'état intermédiaire)
Joueur actif : porté par team_members.status, pas par players.deleted_at seul
Quota Découverte : libéré immédiatement, réactivation sur demande explicite uniquement
Correctif exempt_until : chantier et RELEASE distincts, observés avant le Lot 1
Dette CI : contrôles bloquants corrigés avant Lot 1, baseline pour la dette indépendante
Import CSV : refus atomique du lot entier
Entitlements : 3 niveaux (canManageTeamContent / canOperateExistingEvents /
                          canRespondToExistingObjects) — plus de canWriteTeam unique
Suppression du billing owner : jamais bloquée indéfiniment, flux en 9 étapes
```

## 33. Points encore ouverts

**Aucune décision produit ou technique ne reste bloquante pour le Lot 1.**

Un seul point demeure ouvert, et il ne bloque pas le démarrage : la **mise en œuvre
juridique exacte de la suppression du billing owner** (§14.4) — durées de conservation
selon la société estonienne et les marchés servis, rôle exact de Stripe et de Clubero,
données minimales à conserver, information remise à la personne, distinction entre
suppression du compte, résiliation et archivage légal.

Le flux produit (§14.1) est arrêté et implémentable ; seuls les **paramètres de durée et
de périmètre d'archivage** dépendent de la validation juridique. Ils doivent être des
constantes de configuration, pas des valeurs codées en dur, afin d'être ajustées sans
migration une fois l'avis rendu.

Le Lot 0 bis reste un prérequis bloquant, mais il ne contient plus de décisions à
prendre : uniquement des **inventaires à produire** (mutations directes, lecteurs de
`subscriptions`, exemptions expirées) et des spécifications à rédiger à partir des
décisions ci-dessus.

## 34. Contradictions résolues dans cette version

| Contradiction | Résolution |
|---|---|
| « Fin d'essai → Découverte » (inconditionnel) vs quotas Découverte | Bascule **conditionnelle** à l'éligibilité (§6.1), sinon lecture seule, sans grandfathering |
| Rapprochement de clubs en V1 vs risque `club_id` cross-club | **Hors V1** (§4.5) ; seule la demande de rattachement reste |
| A/B/C/D employé à la fois pour les mutations et les états d'accès | A/B/C/D = **mutations** (§15.2) ; états d'accès nommés `active / grace / restricted / locked` (§16) |
| « Ne pas compter les joueurs archivés » alors qu'aucun état « archivé » n'existe | **Résolu** : `team_members.status` à créer ; l'activité appartient à l'appartenance, pas au profil (§5.0) |
| `member_type` et `team_members.deleted_at` employés dans le prédicat de comptage | **Résolu** : ces colonnes n'existent pas ; le prédicat s'appuie sur `player_id IS NOT NULL` (§5.0) |
| Grâce prolongeable indéfiniment par les relances Stripe | **Résolu** : `grace_started_at` posé une seule fois, jamais écrasé (§17.2) |
| Blocage indéfini d'une suppression RGPD faute de transfert | **Résolu** : flux en 9 étapes, couverture jusqu'à `current_period_end`, jamais de blocage indéfini (§14.1) |
| Un seul `canWriteTeam` pour des actions de nature différente | **Résolu** : trois niveaux, dont `canOperateExistingEvents` pour l'annulation d'événements (§15.2) |
| `can_create_tournament` inchangée vs contrôle explicite | **Contrôle explicite retenu** (§9.2) : plus sûr que de dépendre de l'absence de ligne |
| Index d'unicité bloquant un retry de checkout `incomplete` | Réconciliation Stripe avant nouveau checkout (§11) |
