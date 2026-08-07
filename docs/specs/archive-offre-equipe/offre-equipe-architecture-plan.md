# Offre Équipe — Plan d'architecture

> Plan technique correspondant à `docs/specs/offre-equipe-team-plan.md` (v4 consolidée).
> Les investigations bloquantes sont dans `docs/specs/offre-equipe-lot-0-bis.md`.
>
> Basé sur un audit réel du dépôt. Aucun code fonctionnel n'accompagne ce plan ; il attend
> validation du Lot 0 bis.

## 1. Schéma SQL

### 1.1 `clubs`

```sql
ALTER TABLE public.clubs
  ADD COLUMN coverage_mode text NOT NULL DEFAULT 'club'
  CHECK (coverage_mode IN ('club', 'per_team'));

-- Nécessaire à la suggestion de club existant (§4.4 du prompt) — vérifier si une
-- colonne de localisation existe déjà avant de l'ajouter.
ALTER TABLE public.clubs
  ADD COLUMN city text,
  ADD COLUMN postal_code text;
```

`'club'` par défaut : tous les clubs existants conservent un comportement strictement
identique. Pas de nouvel enum Postgres — un `CHECK` sur text s'étend sans migration
d'enum.

### 1.2 `teams` et `team_members`

```sql
ALTER TABLE public.teams
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id);

-- Appartenance active à une équipe : la notion n'existe pas aujourd'hui.
-- team_members ne contient que id, team_id, user_id, player_id, role, created_at.
ALTER TABLE public.team_members
  ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'archived'));

-- Comptage du quota Découverte : index partiel dédié
CREATE INDEX team_members_active_players_idx
  ON public.team_members (team_id)
  WHERE player_id IS NOT NULL AND status = 'active';

-- Empêche deux lignes joueur pour le même couple (équipe, joueur)
CREATE UNIQUE INDEX team_members_unique_player_per_team
  ON public.team_members (team_id, player_id)
  WHERE player_id IS NOT NULL;
```

`created_by_user_id` : provenance historique, distincte du porteur de quota Découverte
(§1.4). Backfill impossible pour l'existant → colonne nullable, jamais utilisée comme
source d'autorisation.

`status` avec DEFAULT `'active'` : toutes les lignes existantes deviennent actives, ce qui
est le comportement actuel — aucune régression. L'archivage dans une équipe ne touche ni
`players.deleted_at` ni l'historique sportif.

**Vérifier avant migration** l'absence de doublons `(team_id, player_id)` existants, qui
feraient échouer l'index unique.

### 1.3 `team_subscriptions`

```sql
CREATE TABLE public.team_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  club_id uuid NOT NULL REFERENCES public.clubs(id),      -- dénormalisé pour RLS
  billing_owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_code text NOT NULL CHECK (plan_code IN ('team_monthly', 'team_yearly')),
  status public.subscription_status NOT NULL DEFAULT 'incomplete',  -- enum réutilisé
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_started_at timestamptz,                            -- posé UNE FOIS, jamais écrasé
  grace_end timestamptz,                                   -- grace_started_at + 14 j
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  exempt_from_billing boolean NOT NULL DEFAULT false,
  exempt_until timestamptz,
  exemption_reason text,
  exempted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garde-fou ultime. NB : 'incomplete' reste "vivant" — la réconciliation Stripe (§6)
-- doit passer la ligne à 'incomplete_expired' avant tout nouveau checkout.
CREATE UNIQUE INDEX team_subscriptions_one_live_per_team
  ON public.team_subscriptions (team_id)
  WHERE status NOT IN ('canceled', 'incomplete_expired');

CREATE INDEX team_subscriptions_club_idx  ON public.team_subscriptions (club_id);
CREATE INDEX team_subscriptions_owner_idx ON public.team_subscriptions (billing_owner_user_id);
```

`subscription_status` est réutilisé tel quel. **`grace`, `expired` et `read_only` n'y sont
pas ajoutés** : ce sont des états dérivés Clubero (§5).

### 1.4 `team_discovery_coverage`

Table dédiée plutôt qu'un statut sur `teams`, parce que le quota Découverte est porté par
un utilisateur identifié et transférable.

```sql
CREATE TABLE public.team_discovery_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  discovery_owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  source text NOT NULL CHECK (source IN ('signup', 'trial_downgrade', 'manual'))
);

CREATE UNIQUE INDEX discovery_one_live_per_team
  ON public.team_discovery_coverage (team_id) WHERE revoked_at IS NULL;

-- Quota par porteur : garanti au niveau base, indépendamment de tout code applicatif
CREATE UNIQUE INDEX discovery_one_live_per_owner
  ON public.team_discovery_coverage (discovery_owner_user_id) WHERE revoked_at IS NULL;
```

Le quota **par club** (2 maximum) n'est pas exprimable par un index unique : il est garanti
par la transaction verrouillée (§4.3) plus un trigger de défense en profondeur.

### 1.5 Saga, audit, rattachement

```sql
CREATE TABLE public.club_plan_migrations (         -- saga Équipe → Club (§7)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  state text NOT NULL CHECK (state IN
    ('pending','club_confirmed','mode_switched','stopping','completed','failed_partial')),
  stripe_subscription_id text,
  teams_total int, teams_stopped int,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.team_billing_events (          -- journal d'audit
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  team_subscription_id uuid REFERENCES public.team_subscriptions(id),
  event_type text NOT NULL CHECK (event_type IN (
    'created','owner_transferred','interval_changed','canceled','reactivated',
    'payment_failed','grace_started','read_only_started','stopped_for_club_plan',
    'discovery_granted','discovery_refused_quota','discovery_revoked','exemption_granted')),
  actor_user_id uuid, from_user_id uuid, to_user_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.club_attach_requests (         -- rattachement (§4.3 du prompt)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_club_id uuid NOT NULL REFERENCES public.clubs(id),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id),
  requested_team_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','refused','cancelled','blocked_conflict')),
  conflict_reason text,
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`club_plan_migrations` rend la saga observable et reprenable — c'est ce qui la distingue
d'une suite d'appels Stripe non traçable.

### 1.6 Terrain préparé, non implémenté en V1 — `billing_delegates`

En V1, `team_subscriptions.billing_owner_user_id` porte **un seul** responsable. Le besoin
« le président souscrit, le trésorier gère Stripe » viendra ; il ne doit pas imposer une
refonte.

Préparation retenue, **sans table créée en V1** :

- `can_manage_team_billing(_user_id, _team_id)` est déjà une **fonction**, pas une
  comparaison `billing_owner_user_id = auth.uid()` en dur. Toutes les server functions et
  policies passent par elle. Le jour où les délégués existent, seule cette fonction
  change ;
- aucun appel ne compare directement `billing_owner_user_id` à l'utilisateur courant —
  règle à faire respecter en revue de code, sous peine de disperser la logique ;
- nom réservé pour la table future :

```sql
-- FUTUR — hors V1, ne pas créer maintenant
-- billing_delegates (team_subscription_id, user_id, granted_by, granted_at, revoked_at)
-- can_manage_team_billing() consultera cette table en plus du billing_owner
```

Le modèle V1 est donc un cas particulier du modèle cible (zéro délégué), pas un modèle
concurrent.

### 1.7 Hors périmètre V1

Pas de moteur d'entitlements en base (module serveur typé, §3). Pas de `max_players` en
base (config serveur surchargeable par env). **Pas de table ni de procédure de fusion de
clubs** (§4.5 du prompt). Pas de table `billing_delegates` (§1.6).

## 2. Migrations — ordre

1. `clubs.coverage_mode` (+ `city`, `postal_code` si absentes).
2. Ajustement du trigger `auto_create_trial_subscription` : early return si
   `NEW.coverage_mode = 'per_team'` (même motif que l'exclusion `is_personal` existante,
   `20260604212414_…sql:8`).
3. `teams.created_by_user_id`.
4. `team_subscriptions` + index + triggers (cohérence `club_id`, `updated_at`).
5. `team_discovery_coverage` + index partiels.
6. `club_plan_migrations`, `team_billing_events`, `club_attach_requests`.
7. Fonctions SECURITY DEFINER (§3) et helpers d'exemption.
8. RPC transactionnelles (§4).
9. Garde-fous : trigger anti-abonnement Club sur `per_team`, trigger quota joueurs,
   trigger quota Découverte club.
10. `can_create_tournament` avec contrôle explicite de `coverage_mode`.
11. Policies RLS + REVOKE colonnes.
12. **Correctif `exempt_until`** — uniquement après l'audit du Lot 0 bis §28.7.

Toutes additives sauf 2, 10 et 12, qui modifient des objets existants avec un comportement
**identique** pour les clubs `coverage_mode='club'` (soit 100 % de l'existant).

**Cette numérotation est un ordre logique, pas un plan de déploiement.** Chaque migration
touchant `team_members`, `clubs`, `subscriptions` ou `teams` part **seule**, suivie de 24
à 48 h d'observation avant la suivante (règle R1 de `IMPLEMENTATION_ORDER.md`). Les
étapes 2, 10 et 12 relèvent en outre de releases dédiées, isolées du reste.

## 3. Fonctions et RLS

### Fonctions de couverture (SECURITY DEFINER, STABLE, `search_path = public`)

```text
get_team_coverage(_team_id)            → club_plan | team_plan | team_trial | discovery
                                         | grace | expired | none
get_team_access_state(_team_id)        → active | grace | restricted | locked
team_has_paid_access(_team_id)         → couverture quelconque active
team_can_manage_content(_team_id)      → catégorie A  (création/administration)
team_can_operate_events(_team_id)      → catégorie A′ (annulation, notification) — vrai
                                         aussi en restricted
team_can_respond(_team_id, _user_id)   → catégorie B  — vrai aussi en restricted
count_active_players(_team_id)         → team_members joueur actif + players non supprimé
club_has_any_team_coverage(_club_id)
can_manage_team_billing(_user_id, _team_id)
can_view_team_billing_status(_user_id, _team_id)
club_billing_exemption_is_active(_club_id)
team_billing_exemption_is_active(_team_id)
count_active_discovery_teams(_club_id)
user_has_active_discovery_team(_user_id)
user_has_active_billing_responsibilities(_user_id)
get_team_billing_status(_team_id)      → RPC de statut simplifié pour les membres
```

`club_has_active_subscription` **conserve sa sémantique Club** ; seul son traitement
d'`exempt_until` est corrigé, sous contrôle de l'audit.

`can_create_tournament` est modifiée pour tester **explicitement**
`clubs.coverage_mode = 'club'` en plus de `club_has_active_subscription(club_id)` —
plus sûr que de dépendre de l'absence d'une ligne `subscriptions`.

### Policies

- `team_subscriptions` — `SELECT` : billing owner, financial admin autorisé, superadmin ;
  admin du club via vue restreinte ou RPC uniquement. **Les coaches non-payeurs n'y
  accèdent jamais directement** : ils passent par `get_team_billing_status`.
  `INSERT/UPDATE/DELETE` : aucune policy pour `authenticated` (service role uniquement,
  comme `subscriptions`).

```sql
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  ON public.team_subscriptions FROM authenticated, anon;
```

- `team_discovery_coverage` — `SELECT` : membres du club. Écritures service role.
- `team_billing_events`, `club_plan_migrations` — `SELECT` : `can_manage_team_billing` /
  superadmin. Écritures service role.
- `club_attach_requests` — `SELECT` : demandeur + admins du club cible. Écritures via
  server functions.
- **Mutations d'équipe existantes** : ajout de `team_can_manage_content()` sur les
  policies de **catégorie A uniquement**, selon l'inventaire du Lot 0 bis §28.2. Les
  catégories A′, B, C et D ne sont pas touchées — en particulier, l'annulation d'un
  événement et les réponses des familles restent possibles en `restricted`.

### 4.5 `import_players_to_team` — calcul du quota consommé

Le comptage ne porte pas sur le nombre de lignes du fichier, mais sur ce qui **augmente
réellement l'effectif actif** :

```text
consommation = nouveaux joueurs uniques
             + joueurs archivés réactivés
  (hors doublons internes au fichier, doublons déjà présents dans l'équipe,
   et joueurs existants simplement mis à jour — qui ne consomment rien)

SI count_active_players + consommation > quota → RAISE, lot entier rejeté
```

Le message d'erreur remonte le nombre de places restantes et le nombre de lignes
consommatrices, pas le nombre de lignes du fichier — sinon l'utilisateur ne comprend pas
le refus quand son fichier contient surtout des mises à jour.

## 4. Stratégies transactionnelles

### 4.1 `add_player_to_team`

Seul chemin d'ajout autorisé. **Ordre imposé — la résolution du quota précède le verrou :**

```text
quota := resolve_quota(_team_id)

IF quota IS NULL THEN                     -- offre Équipe ou Club
  INSERT directement                      -- aucun verrou, aucun comptage
  RETURN
END IF

SELECT ... FROM teams WHERE id = _team_id FOR UPDATE   -- Découverte uniquement
count := count_active_players(_team_id)
IF count >= quota THEN RAISE 'CLUBERO_PLAYER_QUOTA_EXCEEDED'
INSERT player + team_members
```

Prendre le verrou avant de savoir s'il y a un quota sérialiserait inutilement les ajouts
sur les équipes illimitées : une équipe de 300 joueurs en offre Club paierait la contention
d'une limite qui ne s'applique pas à elle. Le verrou porte sur la ligne `teams`, donc deux
ajouts sur des équipes différentes ne se bloquent jamais.

Trigger de défense en profondeur sur `team_members` — lui aussi court-circuité quand le
quota est `null`.

### 4.2 `import_players_to_team`

Même ordre : quota résolu d'abord, verrou seulement si `quota IS NOT NULL`. Rejet du **lot
entier avant toute insertion** si `count + consommation > quota` (§4.5). Aucune insertion
partielle.

### 4.3 `downgrade_team_to_discovery`

Verrou sur le club → `count_active_discovery_teams >= 2` → refus →
`user_has_active_discovery_team(owner)` → refus → insertion dans
`team_discovery_coverage` (index partiels en double garantie) → journal.
En cas de refus : état `restricted`, journal `discovery_refused_quota`, notification avec
upsell. Ordre déterministe entre équipes : `trial_end` puis `created_at` croissants.

### 4.4 `transfer_team_billing_owner`

Transactionnel : vérification d'éligibilité → mise à jour de `billing_owner_user_id`
**sans appel Stripe** → journal → notifications aux deux parties.

## 5. Machine à états

Source unique `get_team_coverage`. Dérivation complète en Lot 0 bis §28.5.
Priorité absolue : `club_plan` (ou exemption Club) l'emporte sur tout le reste.

**Période de grâce : `TEAM_BILLING_GRACE_DAYS = 14`**, constante serveur surchargeable par
env — pas une valeur en base, donc modifiable sans migration.

Implémentation critique dans le handler `invoice.payment_failed` :

```text
IF grace_started_at IS NULL THEN
  grace_started_at := now()
  grace_end        := now() + TEAM_BILLING_GRACE_DAYS
END IF
-- sinon : ne rien faire. Les relances Stripe et les webhooks rejoués
-- ne doivent JAMAIS repousser grace_end.
```

Remise à zéro de `grace_started_at` / `grace_end` uniquement sur
`invoice.payment_succeeded` (le club a régularisé). Sans cette écriture conditionnelle, le
*smart retry* de Stripe prolongerait la grâce indéfiniment.

**Job planifié** idempotent : fins d'essai avec évaluation d'éligibilité Découverte, fins
de grâce, journalisation, notifications, réconciliation Stripe ↔ Clubero. Précédent à
suivre dans le dépôt : `src/routes/api/public/hooks/trial-reminders.ts`. Contrainte
Cloudflare Workers : vérifier le mécanisme de planification disponible (Cron Triggers ou
ordonnanceur externe).

## 6. Stripe

- **Une souscription distincte par équipe** ; customer réutilisé par payeur (rattaché à
  l'utilisateur, pas au club — divergence assumée avec la logique Club actuelle).
- Metadata posées **sur la session Checkout ET sur la souscription** :
  `purpose="team_plan"`, `team_id`, `club_id`, `billing_owner_user_id`, `plan`.
- **Réconciliation avant checkout** (traite le blocage `incomplete`) : rechercher une
  souscription vivante ou incomplète → interroger Stripe → réutiliser une session
  reprenable, ou passer la ligne à `incomplete_expired`, ou l'invalider → seulement
  ensuite créer une session. Jamais d'erreur d'unicité brute exposée.
- Webhook : branche `metadata.purpose === "team_plan"` dans `handleStripeWebhookPost`, à
  côté des branches tournoi. Idempotence par `stripe_webhook_events`.

  **Invariant R2 — la branche historique est la branche par défaut, en permanence.**
  Sans condition ni date d'expiration, quel que soit le nombre d'abonnements Équipe :

  ```text
  metadata.purpose = "team_plan"                       → branche Équipe
  toute autre valeur, absente ou inconnue              → branche historique, inchangée
  ```

  Le routage se fait **exclusivement** sur la présence et la valeur exacte de
  `metadata.purpose`. Le nouveau code n'est jamais atteint par défaut : événement mal
  formé, métadonnée manquante, valeur inconnue ou événement ancien rejoué retombent tous
  sur le chemin existant.

  La résolution de secours par `stripe_subscription_id` ne s'applique qu'**à l'intérieur**
  de la branche `team_plan`, jamais pour décider d'y entrer.

  *Test de non-régression initial, distinct de l'invariant* : tant qu'aucune ligne
  `team_subscriptions` n'existe, les effets doivent être strictement identiques à
  aujourd'hui. Cette condition n'est pas le critère de routage — elle cesse seulement
  d'être observable une fois la première souscription Équipe créée.

  Avant déploiement : rejouer un échantillon d'événements Stripe réels antérieurs au
  chantier et vérifier que les écritures produites sont identiques à celles du code
  actuel. C'est le composant qui casse le plus discrètement — une erreur ne se voit pas
  dans l'UI, mais sur les abonnements des clubs existants, plusieurs jours plus tard.
- Nouveaux prix `STRIPE_PRICE_TEAM_MONTHLY` (9,99 €) et `STRIPE_PRICE_TEAM_YEARLY`
  (99,99 €) dans `src/lib/stripe.server.ts`, surchargeables par env comme les prix
  existants.

## 7. Saga Équipe → Club

Persistée dans `club_plan_migrations`. Les onze étapes du §18.1 du prompt, avec
l'invariant : **couverture Club active avant tout arrêt d'abonnement Équipe**.

Chaque étape est idempotente et rejouable. `failed_partial` déclenche une alerte et une
reprise manuelle : une équipe dont l'arrêt Stripe a échoué reste facturée, ce qui doit être
visible en console superadmin, pas silencieux.

## 8. Server functions

**Nouveau.** `src/lib/team-billing.functions.ts` (checkout avec réconciliation, portail,
annulation, réactivation, changement de périodicité, transfert de billing owner, synthèse
— autorisation par `can_manage_team_billing`, **pas** « club admin ») ;
`src/lib/team-coverage.server.ts` (couverture, état, entitlements + hook client
`useTeamEntitlements`) ; `src/lib/club-search.functions.ts` (recherche fail-closed,
demande de rattachement) ; `src/lib/discovery.server.ts` (éligibilité, bascule) ;
`src/lib/club-plan-migration.server.ts` (saga).

**Modifié.** `stripe.server.ts` (prix Équipe) ; `billing.functions.ts` (déclenchement de
la saga) ; `privacy.functions.ts` (contrôle RGPD avant suppression) ;
`superadmin.functions.ts` (visibilité `team_subscriptions`, exemptions expirées) ;
`subscription-notify.server.ts` (notifications Équipe) ; chemins d'ajout de joueurs
redirigés vers la RPC ; `import.functions.ts` (lot atomique).

`bun run check:guards` doit passer sur toutes les nouvelles server functions.

## 9. Sécurité de la recherche de club

| Exigence | Implémentation |
|---|---|
| Rate limit **fail-closed** | Variante dédiée `checkRateLimitStrict()`. Le helper existant (`src/lib/rate-limit.server.ts:46-52`) est **fail-open** et ne peut être réutilisé |
| Longueur minimale | Rejet sous 3 caractères avant toute requête |
| Résultats plafonnés | `LIMIT 10`, sans pagination |
| Projection stricte | RPC `search_public_clubs` : nom public, logo, sport, ville approximative, identifiant **opaque** — la projection est dans la fonction, pas un filtre applicatif |
| Journalisation | Rafales, requêtes courtes répétées, balayage alphabétique |
| Écriture serveur | `requestClubAttachment` uniquement |

## 10. Écrans

| Surface | Action |
|---|---|
| `_authenticated.tsx` (`NoMembershipScreen`) | 4 choix d'onboarding ; recherche de club ; formulaire club ; première équipe ; annonce des quotas |
| Nouvelles routes checkout Équipe (+ succès) | motif des routes tournoi pricing/success |
| `_authenticated/teams.tsx` | « Ajouter une équipe » dans le club courant |
| Nouvelle page « Facturation et abonnements » | couverture par équipe, actions selon permissions, upsell Club (seuils 3/4/5) |
| `admin/billing.tsx` | clubs `per_team` : synthèse + CTA passage Club |
| Écrans de blocage | bannières par état (`grace`, `restricted`, `locked`) ; upsell Tournoi ; upsell limite de joueurs ; admin club restreint à l'identité |
| `pricing.tsx` + marketing | grille Découverte / Équipe / Club, 7 locales |
| `superadmin/billing.tsx` | `team_subscriptions`, exemptions expirées, sagas bloquées |

## 11. Impacts

**Onboarding.** Quatrième chemin ; le club `per_team` ne reçoit pas l'essai Club (§2.2) ;
`clubs.is_personal` inchangé, réservé au parcours tournoi.

**Offre Club.** Aucun changement de schéma sur `subscriptions` ; trigger identique pour
`coverage_mode='club'` ; webhook Club inchangé. Cas A sans changement de `club_id`.

**Tournois.** Contrôle explicite `coverage_mode` + garde-fou DB ; six tests de régression
(§9.2 du prompt) dont « ligne `subscriptions` injectée par erreur → refusé ».

**i18n.** Nouvelles clés dans les 7 locales (couverture inégale de `nl` constatée) ;
`check:i18n` en critère de sortie de chaque lot UI.

## 12. Tests

Unitaires (couverture, dérivation d'état, éligibilité Découverte, entitlements,
anti-double-couverture) ; **concurrence** (4.1–4.3, deux transactions réelles) ;
intégration webhook (branches `team_plan` et Club, rejeu, metadata absentes) ; saga (huit
scénarios Stripe, échec partiel, reprise) ; RLS (matrice 14 profils) ; RGPD (six cas de
suppression) ; sécurité recherche de club ; E2E (onboarding, ajout d'équipe, facturation,
état `restricted` avec réponse à convocation autorisée, upsell) ; régression
(`check:guards`, `check:i18n`, `test:rls`).

## 13. Risques

| Risque | Mitigation |
|---|---|
| **Mutation de catégorie B classée en A** → parents bloqués sur des événements existants | Inventaire exhaustif des 56 fichiers (Lot 0 bis §28.2) + E2E état `restricted` par famille de réponse |
| **Correctif `exempt_until` coupant des clubs actifs** | Audit obligatoire, régularisation, déploiement séquencé |
| **Écran plantant sur un club `per_team` sans ligne `subscriptions`** | Inventaire des 39 sites de lecture + test de non-régression traversant |
| **Quota contourné par concurrence** | RPC verrouillées, index partiels, triggers, tests deux transactions |
| **Checkout bloqué par une ligne `incomplete`** | Réconciliation Stripe avant checkout ; index en garde-fou ultime |
| Saga bloquée en `failed_partial` → équipe encore facturée | État persisté, alerte, reprise manuelle, visibilité superadmin |
| Trigger d'essai modifié cassant la création de clubs classiques | Early return `per_team` ; test « club classique reçoit son essai 14 j » |
| Branche webhook interceptant des événements Club | Routage strict sur `metadata.purpose` ; défaut = flux actuel |
| Déblocage tournois accidentel | Contrôle explicite `coverage_mode` + garde-fou DB + 6 tests |
| Recherche de club servant à énumérer la base | Fail-closed, longueur minimale, plafond sans pagination, identifiants opaques |
| Suppression RGPD laissant une souscription orpheline | `user_has_active_billing_responsibilities` avant suppression |
| Rattachement Lot 8 : rayon RLS du changement de `club_id` | Lot isolé en fin de chantier, conflits bloqués, fusion de clubs hors V1 |
| CI déjà rouge masquant une régression | Correction préalable ou baseline chiffrée (Lot 0 bis §28.7) |

## 14. Déploiement et rollback

> Stratégie complète dans `docs/specs/IMPLEMENTATION_ORDER.md`. Ce paragraphe n'en donne
> que les invariants techniques.

**Deux flags, pas un.** Un flag UI `team_plan_v1` (table `app_flags`) masquant onboarding,
pricing, CTA, checkout, pages de facturation, ajout d'équipes payantes — **et** un flag de
**comportement serveur** posé *avant* toute migration sensible, car un flag UI ne protège
ni un trigger, ni une policy, ni une fonction SQL remplacée.

Le flag ne désactive jamais les webhooks, la synchronisation Stripe, les tâches cron, la
lecture des souscriptions existantes ni la gestion des utilisateurs déjà engagés — sinon
un utilisateur ayant payé se retrouverait sans couverture au rollback. Flags séparés pour
les lots 5, 7 et 8.

**Le rollback n'est PAS « flag off ».** C'est vrai pour l'UI et pour les tables neuves,
faux pour tout le reste : un trigger modifié, une policy remplacée, `can_create_tournament`
réécrite, un index créé, des données déjà écrites par un webhook et une opération Stripe
déjà exécutée ne reviennent pas en arrière avec un flag.

Chaque changement sensible est donc livré avec **sept éléments** : migration aller,
migration de retour écrite *et testée*, requête de vérification avant, requête de
vérification après, condition d'arrêt du déploiement, métrique d'alerte, procédure de
restauration.

**Ajouter avant de remplacer.** Toute fonction SQL existante touchée passe par une version
`_v2` comparée en parallèle sur des cas réels avant substitution ; l'ancienne définition
est conservée pour la migration de retour ; aucune colonne ni fonction ancienne n'est
supprimée dans le même chantier.

**Stripe.** Aucune opération financière ne se rattrape par un rollback logiciel. Toute
action irréversible (annulation d'abonnement, facturation, prorata) est derrière un flag
séparé et une activation volontaire. Prix créés en amont (test puis live), IDs injectés
par env.

## Prérequis avant le Lot 1

Toutes les décisions produit et techniques sont tranchées (§32 du prompt). Restent des
**travaux d'exécution**, pas des arbitrages :

1. **Correctif `exempt_until`** — **chantier correctif distinct, avec sa propre release**,
   observé avant le démarrage du Lot 1. Séquence : inventaire des exemptions expirées →
   analyse d'impact → régularisation manuelle → communication éventuelle → correction SQL
   → observation. Ne jamais le livrer dans la même release que les fondations de l'offre
   Équipe : en cas d'incident, on ne saurait pas lequel des deux l'a causé.
2. **Dette CI** — corriger les contrôles bloquants (dont `check:i18n`) avant le Lot 1 ;
   baseline chiffrée uniquement pour la dette réellement indépendante et risquée à
   corriger. Aucune nouvelle erreur autorisée par rapport à cette baseline.
3. **Inventaires du Lot 0 bis** — mutations directes (56 fichiers, classification
   A/A′/B/C/D), lecteurs de `subscriptions` (39 sites).
4. **Vérification pré-migration** — absence de doublons `(team_id, player_id)` avant la
   création de l'index unique sur `team_members`.

Seul point ouvert, non bloquant : les **paramètres juridiques** de la conservation des
données après suppression d'un billing owner (durées, périmètre d'archivage). Le flux
produit est arrêté ; ces paramètres doivent être des constantes de configuration.
