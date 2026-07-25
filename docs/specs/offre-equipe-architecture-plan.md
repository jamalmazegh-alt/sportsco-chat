# Offre Équipe — Plan d'architecture (Lot 0)

> Livrable de l'étape d'architecture exigée par le prompt v3
> (`docs/specs/offre-equipe-team-plan.md`, §25). Basé sur l'audit du dépôt du 2026-07-25.
> Aucun code fonctionnel n'accompagne ce plan ; il attend validation.

## 1. Schéma SQL proposé

### 1.1 `clubs.billing_mode`

```sql
ALTER TABLE public.clubs
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'club'
  CHECK (billing_mode IN ('club', 'per_team'));
```

- `'club'` (défaut) : comportement actuel intégral — tous les clubs existants gardent ce
  mode, zéro changement de comportement.
- `'per_team'` : posé par l'onboarding Équipe. Pas d'essai Club automatique, couverture
  évaluée par équipe, fonctionnalités Club bloquées, identité gérable (nom/logo/sport).
- Pas de nouvel enum Postgres (un `CHECK` sur text suffit et s'étend sans migration
  d'enum).

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

-- Une seule souscription "vivante" par équipe (l'historique résilié reste consultable)
CREATE UNIQUE INDEX team_subscriptions_one_live_per_team
  ON public.team_subscriptions (team_id)
  WHERE status NOT IN ('canceled', 'incomplete_expired');

CREATE INDEX team_subscriptions_club_idx ON public.team_subscriptions (club_id);
CREATE INDEX team_subscriptions_owner_idx ON public.team_subscriptions (billing_owner_user_id);
```

Réutilise l'enum `subscription_status` existant (tous les statuts Stripe y sont déjà) —
aucune modification de la table `subscriptions` ni de sa contrainte UNIQUE sur `club_id`.

Cohérence `club_id` : trigger léger qui vérifie à l'INSERT que
`club_id = (SELECT club_id FROM teams WHERE id = team_id)`, et mise à jour lors d'un
transfert Cas B (voir §10 du prompt et Lot 8).

### 1.3 Journal d'audit de facturation

```sql
CREATE TABLE public.team_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_subscription_id uuid NOT NULL REFERENCES public.team_subscriptions(id),
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'owner_transferred', 'interval_changed', 'canceled', 'reactivated',
    'payment_failed', 'grace_started', 'read_only_started', 'stopped_for_club_plan'
  )),
  actor_user_id uuid,
  from_user_id uuid,        -- transferts
  to_user_id uuid,          -- transferts
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Couvre l'exigence « journaliser le transfert » et donne une piste d'audit générale.

### 1.4 Ce qui n'est PAS créé en V1

- Pas de table de plans générique ni de moteur d'entitlements en base : les capacités
  par offre vivent dans un module serveur typé (voir §4). Extensible plus tard.
- Pas de champ `max_players` en base : la limite Découverte est une constante de config
  serveur (surchargeable par env), servie par les entitlements — l'offre Découverte
  elle-même est hors périmètre tant que la décision §24.2 du prompt n'est pas prise.
- Champs d'exemption (`exempt_from_billing`…) sur `team_subscriptions` : ajoutés
  seulement si la décision §24.5 est oui (migration additive triviale).

## 2. Migrations à créer (ordre)

1. `clubs.billing_mode` (+ backfill implicite par le DEFAULT — aucun UPDATE nécessaire).
2. Ajustement du trigger `auto_create_trial_subscription` :
   ajouter `IF NEW.billing_mode = 'per_team' THEN RETURN NEW; END IF;`
   (même motif que l'exclusion `is_personal` existante, migration
   `20260604212414_…sql:8`).
3. `team_subscriptions` + index + trigger de cohérence `club_id` + trigger `updated_at`.
4. `team_billing_events`.
5. Fonctions SECURITY DEFINER (§3) — `team_has_paid_access`, `get_team_coverage`,
   `can_manage_team_billing`, `club_has_any_team_coverage`.
6. Policies RLS + REVOKE colonnes (§3).

Toutes additives ; aucun renommage, aucune suppression, aucun changement des objets
existants hormis le corps du trigger d'essai (rétrocompatible : le comportement pour
`billing_mode='club'` est identique).

## 3. RLS et fonctions SECURITY DEFINER

Motif identique aux helpers existants (`STABLE`, `SECURITY DEFINER`,
`SET search_path = public`).

### Fonctions

```text
team_has_paid_access(_team_id)      → couverture Équipe active/en essai (avec bornes de
                                      période, comme has-paid-access.ts) OU
                                      club_has_active_subscription(club de l'équipe)
get_team_coverage(_team_id)         → 'club_plan' | 'team_plan' | 'team_trial' | 'grace'
                                      | 'expired' | 'none'
can_manage_team_billing(_user_id, _team_id)
                                    → billing_owner OU admin du club de l'équipe
club_has_any_team_coverage(_club_id)→ au moins une équipe du club couverte
                                      (pour la garde applicative des clubs per_team)
```

`club_has_active_subscription` n'est **pas modifiée** — sa sémantique reste « offre Club
active ou exemption Club ». `can_create_tournament` n'est **pas modifiée** non plus : le
non-déblocage des tournois est garanti par le fait qu'un club `per_team` n'a jamais de
ligne `subscriptions` active (trigger ajusté) ; verrouillé par tests de régression.

### Policies `team_subscriptions`

- `SELECT` : billing owner ; admins/dirigeants du club de l'équipe ; staff de l'équipe
  (`is_team_staff`) pour les colonnes non sensibles — la restriction des colonnes
  sensibles passe par le REVOKE ci-dessous, comme sur `subscriptions`.
- `INSERT` / `UPDATE` / `DELETE` : **aucune policy** pour `authenticated` — écritures
  uniquement par le service role (server functions + webhook), comme pour
  `subscriptions`.

```sql
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  ON public.team_subscriptions FROM authenticated, anon;
```

- `team_billing_events` : SELECT limité à `can_manage_team_billing` ; écritures service
  role uniquement.

### Matrice de tests RLS

Implémenter dans `tests/rls/team-subscriptions.rls.ts` la matrice complète du prompt §17 :
13 profils (anonyme → superadmin), avec pour chaque policy un cas autorisé, un refusé, un
cross-club, un après changement de rôle/responsable, plus les six tests critiques
(dont « une offre Équipe ne permet jamais la création d'un tournoi » via
`can_create_tournament`).

## 4. Server functions à créer / modifier

### Nouveau : `src/lib/team-billing.functions.ts`

Mêmes conventions que `billing.functions.ts` (garde d'authentification, vérification
d'autorisation explicite, `supabaseAdmin` pour les écritures), mais autorisation par
`can_manage_team_billing` — pas « club admin » :

```text
createTeamCheckoutSession({ teamId, plan })        → session Stripe, metadata purpose="team_plan"
createTeamPortalSession({ teamId })                → portail du billing owner
cancelTeamSubscriptionAtPeriodEnd({ teamId })
reactivateTeamSubscription({ teamId })
changeTeamSubscriptionInterval({ teamId, plan })
transferTeamBillingOwner({ teamId, toUserId })     → transactionnel : éligibilité, update,
                                                     journal team_billing_events, notifications
getTeamSubscription({ teamId })                    → vue filtrée selon permissions
listMyBilledTeams()                                → page « Facturation et abonnements »
```

Vérification anti-double-couverture dans `createTeamCheckoutSession` : refus si
`club_has_active_subscription(club_id)` est vrai ou si une souscription vivante existe
déjà pour l'équipe (index partiel en garde-fou).

### Nouveau : `src/lib/team-coverage.server.ts` + hook client

- `getTeamCoverage(teamId)` / `getTeamEntitlements(userId, teamId)` côté serveur,
  retournant l'objet typé du prompt §7 (`coverage`, `canManageTeam`, …,
  `canManageClubIdentity`, `maxPlayers: number | null`).
- Hook `useTeamEntitlements(teamId)` (motif de `use-club-subscription.ts`) pour le front.

### Modifié

- `src/lib/stripe.server.ts` : `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_YEARLY`
  (env + défauts) ; extension de `getPriceId` ou fonction dédiée `getTeamPriceId`.
- `src/lib/billing.functions.ts` (Lot 7) : au checkout Club d'un club `per_team`,
  inclure la liste des `team_subscriptions` vivantes dans la confirmation affichée ;
  l'arrêt effectif est déclenché par le webhook (voir §5).
- Onboarding : le chemin « équipes » crée `clubs` avec `billing_mode='per_team'` +
  `club_members(admin)` + première équipe, puis enchaîne sur le checkout.
- `subscription-notify.server.ts` : variantes « équipe » des notifications financières.

`bun run check:guards` doit passer sur toutes les nouvelles server functions.

## 5. Stripe : produits, checkout, webhook

- **Un abonnement Stripe distinct par équipe.** Customer réutilisé par payeur : recherche
  d'un `stripe_customer_id` existant pour l'utilisateur (dans `team_subscriptions` puis,
  à défaut, création) — à valider : la logique actuelle crée des customers côté club ;
  le customer Équipe est rattaché à l'utilisateur payeur, pas au club.
- Checkout : `mode: "subscription"`, `subscription_data.metadata = { purpose: "team_plan",
  team_id, club_id, billing_owner_user_id, plan }` — posées sur la **souscription** pour
  que `customer.subscription.updated/deleted` les portent, et sur la session pour
  `checkout.session.completed`.
- Webhook : nouvelle branche dans `handleStripeWebhookPost`
  (`stripe-webhook-handler.server.ts`), à côté des branches tournoi :
  - `checkout.session.completed` (purpose `team_plan`) → upsert `team_subscriptions`
    keyed sur `stripe_subscription_id` ;
  - `customer.subscription.created/updated/deleted/trial_will_end/paused/resumed` :
    router sur `metadata.purpose` — **ne touche `upsertSubscription` (club) que si la
    métadonnée est absente**, préservant le flux Club existant ;
  - `invoice.payment_succeeded` / `invoice.payment_failed` : résolution par
    `subscription` → `team_subscriptions.stripe_subscription_id` ;
  - passage à l'offre Club (Lot 7) : à `customer.subscription.created` Club sur un club
    `per_team` → job idempotent qui programme l'annulation des `team_subscriptions`
    vivantes du club selon la règle commerciale (§24.4), journalise
    `stopped_for_club_plan`, bascule `billing_mode='club'`. Rejouable sans effet double
    (idempotence par état : n'annule que les souscriptions encore vivantes).
- Idempotence globale : table `stripe_webhook_events` existante (dédup par `event_id`).

## 6. Écrans et routes

| Surface | Action |
|---|---|
| `src/routes/_authenticated.tsx` (`NoMembershipScreen`) | 3e choix « Je souhaite gérer une ou plusieurs équipes » → mini-formulaire club (nom, logo, sport) + première équipe |
| Nouvelle route de checkout Équipe (+ succès) | motif des routes tournoi pricing/success existantes |
| `src/routes/_authenticated/teams.tsx` | bouton « Ajouter une équipe » → création + checkout dans le même club (clubs `per_team`) |
| Nouvelle page « Facturation et abonnements » (par ex. `_authenticated/billing-teams.tsx`) | liste des équipes avec couverture, actions selon permissions, CTA ajouter une équipe, upsell Club |
| `src/routes/_authenticated/admin/billing.tsx` | pour clubs `per_team` : synthèse des couvertures d'équipes + CTA passage offre Club (Cas A) |
| Écrans de blocage | bannière/écran lecture seule à portée équipe ; écran upsell Tournoi (remplace tout état vide) ; admin club restreint à l'identité (`canManageClubIdentity`) |
| `src/routes/pricing.tsx` + marketing | grille Découverte / Équipe / Club |
| `src/routes/superadmin/billing.tsx` | onglet/liste `team_subscriptions` |

## 7. Lecture seule à portée équipe

Le verrouillage actuel est club entier (`_authenticated.tsx`). Ajout d'une deuxième
couche à portée équipe, active uniquement pour les clubs `per_team` :

- garde dans le layout d'équipe (`teams/$teamId`) : `get_team_coverage` ∈
  {`grace`, `expired`, `none`} → bannière + UI en lecture seule ;
- application serveur : les mutations d'équipe passent par `team_has_paid_access` dans
  les server functions concernées (helper unique, pas de conditions dispersées) ; RLS en
  défense en profondeur sur les chemins critiques si nécessaire ;
- la garde club existante est étendue : pour un club `per_team`, ne pas afficher
  `ClubSubscriptionExpiredScreen` (qui suppose une offre Club) — le club est « ouvert »
  si `club_has_any_team_coverage`, et chaque équipe porte son propre état ;
- données toujours conservées ; consultation toujours possible ; bouton de réactivation.

## 8. Impacts sur l'onboarding

- `NoMembershipScreen` : troisième chemin (le parcours `tournament_organizer` existant
  sert de précédent pour un chemin alternatif).
- Le club créé en mode `per_team` **ne reçoit pas** l'essai Club du trigger (migration
  §2.2) ; l'essai Équipe est créé par le checkout (trial Stripe) ou par une souscription
  `trialing` posée côté serveur selon la décision §24.1–2.
- `clubs.is_personal` / `get_or_create_personal_club` : inchangés, réservés au parcours
  tournoi. Le parcours Équipe n'en dépend pas (club réel directement).
- Wizard/checklist d'onboarding existants : réutilisés tels quels après création.

## 9. Impacts sur l'offre Club existante

- Aucun changement de schéma sur `subscriptions` ; trigger d'essai identique pour les
  clubs `billing_mode='club'` ; webhook Club inchangé (la nouvelle branche est isolée par
  `metadata.purpose`).
- Cas A (passage du même club à l'offre Club) : checkout Club existant, puis bascule de
  couverture idempotente (§5) — aucun changement de `club_id`, aucun déplacement de
  données, pas de trou de couverture.
- Résiliation d'une offre Club : les équipes redeviennent non couvertes (lecture seule) ;
  aucune souscription Équipe recréée automatiquement — checkout explicite requis.

## 10. Impacts sur le module Tournoi

- `can_create_tournament` inchangée ; non-déblocage garanti par l'absence de ligne
  `subscriptions` active sur les clubs `per_team` + tests de régression dédiés
  (club `per_team` avec N équipes couvertes → création tournoi refusée).
- Écran d'upsell à la place de tout état vide/erreur ; branché sur les offres tournoi
  existantes (`tournament_entitlements`, pass) ; événement `tournament_upsell_viewed`.
- Participation d'une équipe à un tournoi tiers : flux existants inchangés.

## 11. Stratégie i18n

- Nouvelles clés dans les namespaces existants (`common` pour l'UI produit, `marketing`
  pour pricing), déclinées dans les **7 locales** (`fr, en, de, es, it, nl, pt`) ;
  attention à la couverture inégale de `nl` constatée dans l'audit.
- `bun run check:i18n` en critère de sortie de chaque lot UI.
- Alignement de la grille marketing (les mentions « Découverte »/« Fédération » de
  `src/locales/fr/marketing.json` ne correspondent pas au code actuel).

## 12. Tests

- **Unitaires (vitest)** : résolution de couverture (`get_team_coverage` — matrice
  statuts × trial × périodes), entitlements par couverture, anti-double-couverture,
  logique de transfert de billing owner.
- **Intégration webhook** : événements `team_plan` (création, échec de paiement, annulation,
  bascule Club), rejeu d'événements (idempotence), événement sans metadata → flux Club
  inchangé.
- **RLS** (`tests/rls/team-subscriptions.rls.ts`, `bun run test:rls`) : matrice complète
  du prompt §17.
- **E2E (Playwright)** : onboarding Équipe complet, ajout d'une équipe, page facturation,
  écran lecture seule, upsell tournoi.
- **Régression** : suite existante inchangée verte ; `bun run check:guards` ;
  `bun run check:i18n`.

## 13. Risques de régression

| Risque | Mitigation |
|---|---|
| Trigger d'essai modifié casse la création de clubs classiques | Changement minimal (early return `per_team`), test dédié « club classique reçoit toujours son essai 14 j » |
| Branche webhook `team_plan` intercepte des événements Club | Routage strict sur `metadata.purpose` ; défaut = flux Club actuel ; tests d'intégration sur les deux flux |
| Garde `_authenticated.tsx` : régression du verrouillage des clubs Club | `billing_mode='club'` suit le chemin de code actuel à l'identique ; la nouvelle logique n'est atteinte que pour `per_team` |
| Déblocage tournois via une souscription posée par erreur sur un club `per_team` | Invariant testé ; garde applicative refusant un checkout Club sans passer par le flux Cas A ; monitoring superadmin |
| Événements `subscription.updated` sans metadata (souscriptions créées hors checkout) | Metadata posées sur la souscription à la création ; fallback de résolution par `stripe_subscription_id` |
| Fenêtre de double facturation au passage Cas A | Stratégie « annulation programmée » par défaut (pas de remboursement promis), job idempotent, affichage des dates exactes |
| Transfert Cas B : rayon RLS du changement de `club_id` | Lot 8 isolé en fin de chantier ; inventaire préalable des tables filles ; tests cross-club |
| Parité i18n (CI rouge) | clés livrées dans les 7 locales à chaque lot |

## 14. Déploiement et rollback

- **Feature flag** : clé `app_flags` (ex. `team_plan_v1`) masquant le chemin
  d'onboarding, les CTA d'achat et la page de facturation Équipe. Rollback immédiat =
  désactivation du flag ; les données créées restent en place (migrations additives,
  jamais destructives).
- Prix Stripe créés en amont dans le dashboard (test puis live), IDs injectés par env.
- Ordre de livraison = lots 1 → 8 du prompt ; chaque lot est shippable derrière le flag ;
  les lots 7 et 8 (bascule Club, transfert inter-clubs) sont activables séparément.
- Stratégie de retour arrière par lot critique : flag off + les souscriptions Stripe déjà
  créées restent gérables via le portail (aucun état orphelin : `team_subscriptions`
  reste la projection des webhooks, qui continuent d'être traités même flag off).

## Points en attente de décision (bloquants pour Lot 1+)

Reprise du §24 du prompt : durée d'essai Équipe (14 vs 30 j), articulation
essai/Découverte et périmètre de l'offre Découverte, valeur de la limite Découverte,
règle d'arrêt au passage Club (fin de période vs prorata), exemptions Équipe, flag de
lancement, seuil d'upsell Club, modèle d'upsell Tournoi.
