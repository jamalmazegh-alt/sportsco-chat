# Offre Équipe — Plan d'architecture (Lot 0)

> Livrable de l'étape d'architecture exigée par le prompt
> (`docs/specs/offre-equipe-team-plan.md`, §23). Basé sur l'audit du dépôt du 2026-07-25.
> Mis à jour avec les décisions v4 : quotas Découverte, contrôle atomique de la limite de
> joueurs, états d'accès A/B/C/D, recherche de club sécurisée, fusion de clubs hors V1,
> audit `exempt_until`.
>
> Les investigations bloquantes sont détaillées dans
> `docs/specs/offre-equipe-lot-0-bis.md`. Aucun code fonctionnel n'accompagne ce plan.

## 1. Schéma SQL proposé

### 1.1 `clubs.billing_mode`

```sql
ALTER TABLE public.clubs
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'club'
  CHECK (billing_mode IN ('club', 'per_team'));
```

`'club'` (défaut) : comportement actuel intégral — tous les clubs existants inchangés.
`'per_team'` : posé par l'onboarding Équipe (pas d'essai Club automatique, couverture par
équipe, fonctionnalités Club bloquées, identité gérable).
Pas de nouvel enum Postgres : un `CHECK` sur text s'étend sans migration d'enum.

### 1.2 `team_subscriptions`

```sql
CREATE TABLE public.team_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  club_id uuid NOT NULL REFERENCES public.clubs(id),      -- dénormalisé pour RLS
  billing_owner_user_id uuid NOT NULL,                     -- auth.users
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_code text NOT NULL CHECK (plan_code IN ('team_monthly', 'team_yearly')),
  status public.subscription_status NOT NULL DEFAULT 'incomplete',  -- enum réutilisé
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX team_subscriptions_one_live_per_team
  ON public.team_subscriptions (team_id)
  WHERE status NOT IN ('canceled', 'incomplete_expired');

CREATE INDEX team_subscriptions_club_idx ON public.team_subscriptions (club_id);
CREATE INDEX team_subscriptions_owner_idx ON public.team_subscriptions (billing_owner_user_id);
```

Réutilise l'enum `subscription_status` existant ; aucune modification de `subscriptions`
ni de sa contrainte UNIQUE. Trigger de cohérence : à l'INSERT,
`club_id = (SELECT club_id FROM teams WHERE id = team_id)` ; mis à jour lors d'un
rattachement (Lot 8).

### 1.3 `team_discovery_coverage` (offre Découverte)

Table dédiée plutôt qu'un statut sur `teams` : le quota Découverte est porté par un
utilisateur identifié, information qui n'existe nulle part aujourd'hui (`teams` n'a pas de
`created_by` — voir Lot 0 bis §0 bis.1.1).

```sql
CREATE TABLE public.team_discovery_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  discovery_owner_user_id uuid NOT NULL,   -- porteur du quota utilisateur
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,                  -- libération du quota
  source text NOT NULL CHECK (source IN ('signup', 'trial_downgrade', 'manual'))
);

-- Une seule couverture Découverte vivante par équipe
CREATE UNIQUE INDEX discovery_one_live_per_team
  ON public.team_discovery_coverage (team_id) WHERE revoked_at IS NULL;

-- Quota utilisateur : 1 équipe Découverte active par utilisateur
CREATE UNIQUE INDEX discovery_one_live_per_user
  ON public.team_discovery_coverage (discovery_owner_user_id) WHERE revoked_at IS NULL;
```

L'index partiel `discovery_one_live_per_user` **rend le quota utilisateur inviolable au
niveau base**, indépendamment de toute logique applicative. Le quota club (2 maximum) ne
peut pas s'exprimer par un index unique : il est garanti par la transaction verrouillée
(§5.3) et par un trigger de défense en profondeur.

### 1.4 Journal d'audit de facturation

```sql
CREATE TABLE public.team_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_subscription_id uuid REFERENCES public.team_subscriptions(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'owner_transferred', 'interval_changed', 'canceled', 'reactivated',
    'payment_failed', 'grace_started', 'read_only_started', 'stopped_for_club_plan',
    'discovery_granted', 'discovery_refused_quota', 'discovery_revoked'
  )),
  actor_user_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Couvre la journalisation des transferts et la traçabilité des refus de bascule Découverte
(exploitable pour le tracking `discovery_switch_refused_quota`).

### 1.5 `club_attach_requests` (rattachement, périmètre V1 réduit)

```sql
CREATE TABLE public.club_attach_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_club_id uuid NOT NULL REFERENCES public.clubs(id),
  requester_user_id uuid NOT NULL,
  team_id uuid REFERENCES public.teams(id),        -- null = demande d'adhésion simple
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'refused', 'cancelled', 'blocked_conflict')),
  conflict_reason text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`blocked_conflict` matérialise le cas « équipe équivalente déjà présente dans le club
cible » : la demande est conservée et tracée, mais jamais exécutée automatiquement.

### 1.6 Ce qui n'est PAS créé en V1

- Pas de moteur d'entitlements en base : les capacités par offre vivent dans un module
  serveur typé (§4).
- Pas de `max_players` en base : constante de config serveur (surchargeable par env),
  servie par les entitlements.
- Pas de table ni de procédure de **fusion de clubs** : hors périmètre V1 (prompt §10).
- Champs d'exemption sur `team_subscriptions` : seulement si décision §21.7 = oui.

## 2. Migrations à créer (ordre)

1. `clubs.billing_mode` (backfill implicite par le DEFAULT, aucun UPDATE).
2. Ajustement du trigger `auto_create_trial_subscription` : ajouter
   `IF NEW.billing_mode = 'per_team' THEN RETURN NEW; END IF;` (même motif que
   l'exclusion `is_personal` existante, `20260604212414_…sql:8`).
3. `team_subscriptions` + index + triggers (cohérence `club_id`, `updated_at`).
4. `team_discovery_coverage` + index partiels.
5. `team_billing_events`, `club_attach_requests`.
6. Fonctions SECURITY DEFINER (§3).
7. RPC transactionnelles : `add_player_to_team`, `import_players_to_team`,
   `downgrade_team_to_discovery` (§5).
8. Triggers de défense en profondeur (quota joueurs, quota Découverte club).
9. Policies RLS + REVOKE colonnes.
10. **Correctif `exempt_until`** — uniquement après l'audit du Lot 0 bis §0 bis.3.

Toutes additives ; aucun renommage ni suppression. Seule modification d'un objet
existant : le corps du trigger d'essai (rétrocompatible — comportement identique pour
`billing_mode='club'`) et, en fin de séquence, `club_has_active_subscription`.

## 3. RLS et fonctions SECURITY DEFINER

Motif identique aux helpers existants (`STABLE`, `SECURITY DEFINER`,
`SET search_path = public`).

### Fonctions de couverture

```text
team_has_paid_access(_team_id)       → couverture Équipe active/en essai (bornes de
                                       période comme has-paid-access.ts) OU
                                       club_has_active_subscription(club de l'équipe)
get_team_coverage(_team_id)          → 'club_plan' | 'team_plan' | 'team_trial'
                                       | 'discovery' | 'grace' | 'expired' | 'none'
get_team_access_state(_team_id)      → 'A' | 'B' | 'C' | 'D'   (§7)
can_manage_team_billing(_user_id, _team_id)
club_has_any_team_coverage(_club_id)
count_active_discovery_teams(_club_id)
user_has_active_discovery_team(_user_id)
```

`club_has_active_subscription` **conserve sa sémantique** (offre Club active ou exemption
Club valide) ; seul le traitement d'`exempt_until` sera corrigé, sous contrôle de l'audit.
`can_create_tournament` n'est pas modifiée : le non-déblocage est garanti par l'absence de
ligne `subscriptions` active sur les clubs `per_team`, verrouillé par tests de régression.

### Policies

- `team_subscriptions` — `SELECT` : billing owner ; admins/dirigeants du club ; staff de
  l'équipe (colonnes sensibles couvertes par le REVOKE). `INSERT/UPDATE/DELETE` :
  **aucune policy** pour `authenticated` (écritures service role uniquement, comme
  `subscriptions`).

```sql
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  ON public.team_subscriptions FROM authenticated, anon;
```

- `team_discovery_coverage` — `SELECT` : membres du club concerné. Écritures service role.
- `team_billing_events` — `SELECT` : `can_manage_team_billing`. Écritures service role.
- `club_attach_requests` — `SELECT` : demandeur + admins du club cible. Écritures via
  server functions uniquement.

### Matrice de tests RLS

`tests/rls/team-subscriptions.rls.ts` et `tests/rls/team-discovery.rls.ts` : les 13
profils du prompt §19, avec pour chaque policy un cas autorisé, un refusé, un cross-club,
un après changement de rôle/responsable, plus les sept tests critiques (dont
« une offre Équipe ne permet jamais la création d'un tournoi » et « la recherche publique
de club n'expose aucun membre »).

## 4. Server functions à créer / modifier

### Nouveau : `src/lib/team-billing.functions.ts`

Conventions de `billing.functions.ts` (garde d'authentification, autorisation explicite,
`supabaseAdmin` pour les écritures), mais autorisation par `can_manage_team_billing` —
pas « club admin » :

```text
createTeamCheckoutSession({ teamId, plan })
createTeamPortalSession({ teamId })
cancelTeamSubscriptionAtPeriodEnd({ teamId })
reactivateTeamSubscription({ teamId })
changeTeamSubscriptionInterval({ teamId, plan })
transferTeamBillingOwner({ teamId, toUserId })   → transactionnel + journal + notifications
getTeamSubscription({ teamId })
listMyBilledTeams()
```

Anti-double-couverture dans `createTeamCheckoutSession` : refus si
`club_has_active_subscription(club_id)` est vrai ou si une souscription vivante existe
(index partiel en garde-fou).

### Nouveau : `src/lib/team-coverage.server.ts`

`getTeamCoverage(teamId)`, `getTeamAccessState(teamId)`,
`getTeamEntitlements(userId, teamId)` retournant l'objet typé du prompt §8 (avec
`accessState`, `canManageTeamContent`, `canRespondToExistingObjects`,
`canAcceptTeamInvitation`, `canManageClubIdentity`, `maxPlayers`).
Hook client `useTeamEntitlements(teamId)` (motif de `use-club-subscription.ts`).

### Nouveau : `src/lib/club-search.functions.ts` (§6)

`searchPublicClubs({ query })` et `requestClubAttachment({ clubId, teamId })`.

### Nouveau : `src/lib/discovery.server.ts`

`evaluateDiscoveryEligibility(teamId)` et `downgradeTeamToDiscovery(teamId)` (appelées
par le job de fin d'essai), s'appuyant sur la RPC transactionnelle §5.3.

### Modifié

- `src/lib/stripe.server.ts` : `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_YEARLY`
  (env + défauts), `getTeamPriceId`.
- `src/lib/billing.functions.ts` (Lot 7) : au checkout Club d'un club `per_team`,
  afficher les `team_subscriptions` vivantes concernées ; l'arrêt effectif est déclenché
  par le webhook.
- Chemins d'ajout de joueurs → redirigés vers la RPC `add_player_to_team` (§5.1).
- `src/lib/superadmin-import/import.functions.ts` → lot atomique (§5.2).
- Onboarding : chemin « équipes » créant `clubs (billing_mode='per_team')` +
  `club_members(admin)` + première équipe.
- `subscription-notify.server.ts` : variantes « équipe » + notification de refus de
  bascule Découverte.

`bun run check:guards` doit passer sur toutes les nouvelles server functions.

## 5. Stratégies transactionnelles (concurrence)

### 5.1 Limite de joueurs — `add_player_to_team`

Seul chemin autorisé d'ajout. Dans une seule transaction :

```text
SELECT ... FROM teams WHERE id = _team_id FOR UPDATE   -- sérialise par équipe
→ résolution du quota (null = illimité → court-circuit immédiat)
→ comptage des joueurs actifs
→ IF count >= quota THEN RAISE 'CLUBERO_PLAYER_QUOTA_EXCEEDED'
→ INSERT player + team_members
```

Le verrou porte sur la ligne `teams`, donc deux ajouts sur des équipes différentes ne se
bloquent jamais. Pour les offres payantes (`maxPlayers = null`), le court-circuit évite
tout coût de comptage.

Trigger de défense en profondeur sur l'insertion de `team_members` : recompte et refuse
le dépassement, couvrant tout chemin contournant la RPC. Filet, pas mécanisme principal.

Le contrôle applicatif subsiste pour l'ergonomie (bouton désactivé, compteur) mais n'est
jamais la garantie.

### 5.2 Import CSV — lot atomique

`import_players_to_team(_team_id, _rows)` : même verrou, comptage, puis
`IF count + valid_rows > quota THEN RAISE` **avant toute insertion**. Aucune insertion
partielle ; le message indique les places disponibles et le nombre de lignes soumises.

### 5.3 Bascule Découverte — `downgrade_team_to_discovery`

```text
SELECT ... FROM clubs WHERE id = _club_id FOR UPDATE
→ count_active_discovery_teams(_club_id) >= 2      → refus
→ user_has_active_discovery_team(_owner)           → refus
→ INSERT team_discovery_coverage                   (index partiels = double garantie)
→ journal team_billing_events
```

En cas de refus : l'équipe passe en état C, journal `discovery_refused_quota`,
notification au bénéficiaire avec l'upsell.

Ordre déterministe en cas de fins d'essai simultanées : traitement par `trial_end` puis
`created_at` croissants (le job itère dans cet ordre ; le verrou club sérialise).

### 5.4 Tests de concurrence obligatoires

Exécutés avec **deux transactions réelles simultanées**, pas une simulation séquentielle :

- équipe à 14 joueurs, quota 15, deux insertions concurrentes → exactement une réussite,
  effectif final 15, jamais 16 ;
- deux bascules Découverte concurrentes sur un club à 1 équipe Découverte → exactement
  une réussite ;
- deux bascules concurrentes pour le même bénéficiaire → exactement une réussite
  (garantie par l'index partiel) ;
- import de 10 lignes sur une équipe à 8/15 → lot rejeté, effectif inchangé.

## 6. Recherche de club sécurisée

Route publique dédiée (`src/routes/api/public/club-search.ts`), **pas** une requête
Supabase directe depuis le client.

| Exigence | Implémentation |
|---|---|
| Rate limit **fail-closed** | Variante dédiée du helper : `checkRateLimitStrict()` retournant `false` en cas d'erreur DB. Le helper existant (`src/lib/rate-limit.server.ts:46-52`) est **fail-open** et ne peut pas être réutilisé tel quel |
| Longueur minimale | Rejet sous 3 caractères (à confirmer) avant toute requête |
| Résultats plafonnés | `LIMIT 10`, sans pagination (empêche l'énumération exhaustive) |
| Données publiques uniquement | Vue ou RPC `search_public_clubs` retournant exclusivement : nom public, logo public, sport, ville approximative, identifiant opaque |
| Aucune exposition | Ni membres, ni emails, ni rôles, ni facturation, ni équipes privées — garanti par la projection de la fonction, pas par un filtre applicatif |
| Journalisation | Requêtes suspectes (rafales, requêtes très courtes répétées, balayage alphabétique) tracées pour revue |
| Demandes côté serveur | `requestClubAttachment` écrit dans `club_attach_requests` via server function ; jamais d'insertion directe depuis le client |

L'identifiant retourné est **opaque** (token de demande), pas le `clubs.id` réel, pour ne
pas offrir un oracle d'existence exploitable ailleurs.

## 7. États d'accès A/B/C/D et lecture seule à portée équipe

Le verrouillage actuel est club entier (`src/routes/_authenticated.tsx`). Ajout d'une
couche à portée équipe pour les clubs `per_team`, implémentant les quatre états :

- garde dans le layout d'équipe (`teams/$teamId`) : `get_team_access_state` pilote
  l'affichage (bannière, boutons désactivés) ;
- **application serveur** : deux familles de gardes distinctes, car elles ne se
  comportent pas pareil en état C —
  - mutations de **gestion** (création/modification d'événements, convocations,
    compositions, sondages, besoins, documents, joueurs, invitations émises) → exigent
    `canManageTeamContent` (états A/B) ;
  - mutations de **réponse** (réponse à convocation, disponibilité, réponse à sondage ou
    à besoin existant) et **acceptation d'invitation** → exigent
    `canRespondToExistingObjects` / `canAcceptTeamInvitation` (états A/B/C) ;
- RLS en défense en profondeur sur les chemins critiques ;
- la garde club existante est étendue : pour un club `per_team`, ne pas afficher
  `ClubSubscriptionExpiredScreen` (qui suppose une offre Club) — le club est ouvert si
  `club_has_any_team_coverage`, chaque équipe portant son propre état.

Inventaire à produire au Lot 5 : la liste exhaustive des server functions de mutation,
classées « gestion » ou « réponse ». C'est le point le plus susceptible d'erreur — une
mutation de réponse mal classée bloquerait des parents légitimes.

## 8. Écrans et routes

| Surface | Action |
|---|---|
| `_authenticated.tsx` (`NoMembershipScreen`) | 3e choix « gérer une ou plusieurs équipes » → recherche de club → formulaire club → première équipe → annonce des quotas |
| Nouvelle route de checkout Équipe (+ succès) | motif des routes tournoi pricing/success |
| `_authenticated/teams.tsx` | « Ajouter une équipe » → création + checkout dans le même club |
| Nouvelle page « Facturation et abonnements » | liste des équipes avec couverture, actions selon permissions, CTA, upsell Club |
| `_authenticated/admin/billing.tsx` | clubs `per_team` : synthèse des couvertures + CTA passage offre Club (Cas A) |
| Écrans de blocage | bannière lecture seule par état (C vs D) ; écran upsell Tournoi ; upsell limite de joueurs ; admin club restreint à l'identité |
| `pricing.tsx` + marketing | grille Découverte / Équipe / Club |
| `superadmin/billing.tsx` | onglet `team_subscriptions` + inventaire des exemptions expirées (§10) |

## 9. Stripe : produits, checkout, webhook

- Une souscription Stripe distincte par équipe ; customer réutilisé par payeur (rattaché
  à l'utilisateur payeur, pas au club — divergence assumée avec la logique Club actuelle).
- Checkout : `mode: "subscription"`, `subscription_data.metadata = { purpose: "team_plan",
  team_id, club_id, billing_owner_user_id, plan }` — posées sur la **souscription** pour
  que `customer.subscription.updated/deleted` les portent.
- Webhook : nouvelle branche dans `handleStripeWebhookPost`, à côté des branches tournoi.
  Routage sur `metadata.purpose` — **`upsertSubscription` (club) n'est appelé que si la
  métadonnée est absente**, préservant le flux Club existant. Résolution de secours par
  `stripe_subscription_id`.
- Passage à l'offre Club (Lot 7) : à `customer.subscription.created` Club sur un club
  `per_team` → job idempotent qui programme l'annulation des `team_subscriptions`
  vivantes, journalise `stopped_for_club_plan`, bascule `billing_mode='club'`. Rejouable
  sans effet double (idempotence par état).
- Idempotence globale : `stripe_webhook_events` (dédup par `event_id`).

## 10. Correctif `exempt_until` — séquencement

Divergence vérifiée : la fonction SQL ignore `exempt_until`
(`20260622120000_…sql:36`), le TypeScript l'honore (`has-paid-access.ts:22-25`). Une
exemption expirée donne encore accès via RLS et `can_create_tournament`.

**Option retenue (à valider) : Option 1 — traiter avant le Lot 1**, pour que la nouvelle
couverture soit bâtie sur une sémantique saine. Séquence imposée : inventaire (lecture
seule) → décision de régularisation club par club → application des régularisations →
déploiement du correctif → vérification post-déploiement. Détail complet en Lot 0 bis
§0 bis.3.

Les nouvelles fonctions (`team_has_paid_access`, `get_team_coverage`) honorent
`exempt_until` dès leur écriture, quelle que soit l'option retenue.

## 11. Impacts

**Onboarding.** Troisième chemin dans `NoMembershipScreen` (le parcours
`tournament_organizer` sert de précédent). Le club `per_team` ne reçoit pas l'essai Club
(migration §2.2) ; l'essai Équipe est créé par le checkout. `clubs.is_personal` inchangé,
réservé au parcours tournoi.

**Offre Club existante.** Aucun changement de schéma sur `subscriptions` ; trigger
identique pour `billing_mode='club'` ; webhook Club inchangé (nouvelle branche isolée par
`metadata.purpose`). Cas A sans changement de `club_id` ni déplacement de données.
Résiliation Club → équipes non couvertes, aucune souscription Équipe recréée
automatiquement.

**Module Tournoi.** `can_create_tournament` inchangée ; non-déblocage garanti par
l'absence de `subscriptions` active sur les clubs `per_team`, verrouillé par tests de
régression (club `per_team` avec N équipes couvertes → création refusée). Écran d'upsell
à la place de tout état vide. Participation à un tournoi tiers inchangée.

**i18n.** Nouvelles clés dans les namespaces existants, déclinées dans les 7 locales
(attention à la couverture inégale de `nl` constatée à l'audit). `bun run check:i18n` en
critère de sortie de chaque lot UI.

## 12. Tests

- **Unitaires** : résolution de couverture (matrice statuts × trial × périodes), mapping
  couverture → état A/B/C/D → entitlements, éligibilité Découverte, anti-double-couverture,
  transfert de billing owner.
- **Concurrence** (§5.4) : deux transactions réelles simultanées, quatre scénarios.
- **Intégration webhook** : événements `team_plan` (création, échec, annulation, bascule
  Club), rejeu (idempotence), événement sans metadata → flux Club inchangé.
- **RLS** (`bun run test:rls`) : matrice complète du prompt §19.
- **Sécurité recherche de club** : rate limit fail-closed sous erreur DB simulée,
  longueur minimale, plafond de résultats, absence de champs sensibles dans la réponse.
- **E2E** : onboarding Équipe, ajout d'équipe, page facturation, état C (réponse à une
  convocation autorisée, création bloquée), upsell tournoi, limite de joueurs.
- **Régression** : suite existante verte ; `check:guards` ; `check:i18n`.

## 13. Risques de régression

| Risque | Mitigation |
|---|---|
| Trigger d'essai modifié casse la création de clubs classiques | Early return `per_team` uniquement ; test « club classique reçoit toujours son essai 14 j » |
| Branche webhook `team_plan` intercepte des événements Club | Routage strict sur `metadata.purpose` ; défaut = flux actuel ; tests sur les deux flux |
| Régression du verrouillage des clubs Club | `billing_mode='club'` suit le chemin de code actuel à l'identique |
| Déblocage tournois par une souscription posée par erreur sur un club `per_team` | Invariant testé ; garde refusant un checkout Club hors flux Cas A ; monitoring superadmin |
| **Mutation de « réponse » mal classée en « gestion »** | Inventaire exhaustif au Lot 5 + tests E2E état C sur chaque famille de réponse |
| **Correctif `exempt_until` coupant des clubs actifs sans préavis** | Audit obligatoire, régularisation, déploiement séquencé (Lot 0 bis §0 bis.3) |
| **Quota joueurs contourné par concurrence** | RPC verrouillée + trigger de défense + tests deux transactions |
| **Quota Découverte contourné par concurrence** | Index partiels (quota utilisateur) + verrou club (quota club) + trigger |
| Recherche de club utilisée pour énumérer la base | Fail-closed, longueur minimale, plafond sans pagination, identifiants opaques, journalisation |
| Fenêtre de double facturation au passage Cas A | Annulation programmée par défaut, job idempotent, dates affichées |
| Rattachement Lot 8 : rayon RLS du changement de `club_id` | Lot isolé en fin de chantier, inventaire préalable des tables filles, conflits bloqués |
| Parité i18n (CI rouge) | Clés livrées dans les 7 locales à chaque lot |

## 14. Déploiement et rollback

- **Feature flag** `app_flags` (ex. `team_plan_v1`) masquant l'onboarding Équipe, les CTA
  d'achat et la page de facturation. Rollback = désactivation du flag ; les données
  restent en place (migrations additives).
- Prix Stripe créés en amont (test puis live), IDs injectés par env.
- Ordre : Lot 0 → 0 bis → 1 → 8. Chaque lot shippable derrière le flag ; les lots 7 et 8
  activables séparément.
- Les webhooks continuent d'être traités même flag off : `team_subscriptions` reste la
  projection fidèle de Stripe, aucun état orphelin.

## Points bloquants avant le Lot 1

Les 11 décisions du prompt §21, plus les trois sorties du Lot 0 bis :

1. quotas Découverte — définitions requêtables, porteur, ordre déterministe, libération ;
2. limite de joueurs — RPC spécifiée, définition du « joueur actif », stratégie d'import ;
3. `exempt_until` — inventaire renseigné et décisions de régularisation.
