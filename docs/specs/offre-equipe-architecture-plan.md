# Offre Équipe — Plan d'architecture (mis à jour v4)

> Design technique répondant au §28 (« étape d'architecture ») de
> `offre-equipe-team-plan.md`. Basé sur l'audit du dépôt du 2026-07-25 et les décisions
> v4. **Aucun code fonctionnel** n'accompagne ce plan ; il attend validation, et le
> `Lot 0 bis` (`offre-equipe-lot-0-bis.md`) doit être validé avant tout développement.
>
> Changements v4 par rapport à la version précédente :
>
> - offre **Découverte** intégrée au modèle de couverture dès le Lot 1 ;
> - **garde-fous DB** durs (anti-`subscriptions` sur `per_team`, `can_create_tournament`
>   explicite) ;
> - **contrôle atomique** de la limite de joueurs ;
> - split entitlements gestion/réponses (`canManageTeamContent`,
>   `canRespondToExistingObjects`, `canAcceptTeamInvitation`) ;
> - **RGPD** du billing owner ; **audit préalable** du bug `exempt_until` ;
> - **recherche de club sécurisée** ; rapprochement/fusion de clubs **hors V1**.

## 1. Schéma SQL proposé

### 1.1 `clubs.billing_mode`

```sql
ALTER TABLE public.clubs
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'club'
  CHECK (billing_mode IN ('club', 'per_team'));
```

- `'club'` (défaut) : comportement actuel intégral ; tous les clubs existants inchangés.
- `'per_team'` : posé par l'onboarding Découverte/Équipe. Pas d'essai Club auto,
  couverture par équipe, fonctionnalités Club bloquées, identité gérable.
- `text + CHECK` (pas d'enum Postgres) → extensible sans migration d'enum.

### 1.2 `team_subscriptions`

```sql
CREATE TABLE public.team_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  club_id uuid NOT NULL REFERENCES public.clubs(id),        -- dénormalisé pour RLS
  billing_owner_user_id uuid NOT NULL,                       -- auth.users (voir note FK)
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
  -- exemptions Équipe (décision v4) :
  exempt_from_billing boolean NOT NULL DEFAULT false,
  exempt_until timestamptz,
  exemption_reason text,
  exempted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Une seule souscription "vivante" par équipe (historique résilié consultable).
CREATE UNIQUE INDEX team_subscriptions_one_live_per_team
  ON public.team_subscriptions (team_id)
  WHERE status NOT IN ('canceled', 'incomplete_expired');

CREATE INDEX team_subscriptions_club_idx  ON public.team_subscriptions (club_id);
CREATE INDEX team_subscriptions_owner_idx ON public.team_subscriptions (billing_owner_user_id);
```

- Réutilise l'enum `subscription_status` ; **aucune** modification de `subscriptions` ni
  de son UNIQUE `club_id`.
- **Note FK `billing_owner_user_id`** : les FK vers `auth.users` depuis `public` sont
  fragiles ; le garde-fou principal est le flux RGPD (§9 du plan + team-plan §14) qui
  interdit la suppression d'un user avec responsabilités actives. Décider en Lot 0 bis si
  une FK `ON DELETE RESTRICT` est ajoutée en défense en profondeur.
- **Cohérence `club_id`** : trigger BEFORE INSERT/UPDATE vérifiant
  `club_id = (SELECT club_id FROM teams WHERE id = team_id)`.
- **`incomplete` bloquant** : l'index est le garde-fou ultime ; la logique applicative
  (team-plan §11) réconcilie l'état Stripe avant tout nouveau checkout et ne remonte
  jamais l'erreur d'unicité brute.

### 1.3 Journal d'audit `team_billing_events`

```sql
CREATE TABLE public.team_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_subscription_id uuid REFERENCES public.team_subscriptions(id),
  team_id uuid,                         -- conservé même si la sub est purgée
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'owner_transferred', 'interval_changed', 'canceled', 'reactivated',
    'payment_failed', 'grace_started', 'read_only_started',
    'trial_lapsed_to_discovery', 'trial_lapsed_to_read_only', 'stopped_for_club_plan'
  )),
  actor_user_id uuid,
  from_user_id uuid,   -- transferts
  to_user_id uuid,     -- transferts
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 1.4 État / entitlement Découverte

Pas de table de plans générique. L'état Découverte est **dérivé** (voir §3) :
`get_team_coverage` renvoie `discovery` quand l'équipe n'a ni couverture Club, ni
souscription Équipe vivante, ni essai en cours, **et** qu'elle est éligible (quotas §6.1
du prompt). Un marqueur applicatif léger peut être ajouté si nécessaire pour tracer la
date d'entrée en Découverte (à décider en Lot 0 bis) — mais la **source de vérité** de la
couverture reste la fonction.

### 1.5 Ce qui n'est PAS créé en V1

- Pas de moteur d'entitlements en base : capacités par offre dans un module serveur typé
  (§4).
- `DISCOVERY_MAX_*` = constantes de config serveur (surchargeables par env), pas des
  colonnes.
- Pas de tables de fusion de clubs (rapprochement **hors V1**).

## 2. Migrations à créer (ordre)

1. `clubs.billing_mode` (backfill implicite par le DEFAULT — aucun UPDATE).
2. Ajustement `auto_create_trial_subscription` : early-return
   `IF NEW.billing_mode = 'per_team' THEN RETURN NEW; END IF;` (même motif que l'exclusion
   `is_personal` existante).
3. `team_subscriptions` + index + trigger de cohérence `club_id` + trigger `updated_at`.
4. `team_billing_events`.
5. Fonctions SECURITY DEFINER (§3) : couverture, exemptions, billing, garde-fous.
6. **Garde-fou DB anti-`subscriptions` sur `per_team`** (§3) + modification
   `can_create_tournament` (§3).
7. **Correctif SQL `exempt_until`** — _conditionné à l'audit préalable_ (team-plan §12.1,
   Lot 0 bis §7). Migration séparée, déployée après décision sur les données.
8. Policies RLS + REVOKE colonnes (§3).

Toutes additives ; aucun renommage/suppression ; seule modification d'objet existant : le
corps du trigger d'essai (rétrocompatible pour `billing_mode='club'`) et le correctif
`exempt_until` (piloté par l'audit).

## 3. RLS & fonctions SECURITY DEFINER

Motif identique aux helpers existants (`STABLE`/`VOLATILE` selon le cas,
`SECURITY DEFINER`, `SET search_path = public`, guards internes).

### 3.1 Fonctions de couverture / accès

```text
team_has_paid_access(_team_id)      → couverture Équipe active/essai (bornes de période)
                                      OU club_has_active_subscription(club de l'équipe)
                                      OU exemption active (club ou équipe)
team_has_write_access(_team_id)     → droit d'écriture (paid access OU discovery-dans-limite)
get_team_coverage(_team_id)         → 'club_plan' | 'team_plan' | 'team_trial'
                                      | 'discovery' | 'grace' | 'expired' | 'none'
can_manage_team_billing(_user_id,_team_id)  → billing_owner OU financial_admin autorisé
                                              OU admin du club (selon règles §13)
can_view_team_billing_status(_user_id,_team_id)
club_has_any_team_coverage(_club_id)→ ≥ 1 équipe du club couverte
club_billing_exemption_is_active(_club_id)
team_billing_exemption_is_active(_team_id)
```

`club_has_active_subscription` **non modifiée** (sémantique « offre Club active ou
exemption Club »). `get_team_coverage` est la **source unique** des états dérivés.

### 3.2 Garde-fou DB : pas d'offre Club active sur un club `per_team`

Trigger `BEFORE INSERT OR UPDATE ON public.subscriptions` (couvre service role /
`supabaseAdmin`) :

```text
si NEW rend la souscription active/trialing/exemptée
   ET (SELECT billing_mode FROM clubs WHERE id = NEW.club_id) = 'per_team'
   ET l'écriture ne provient pas du flux contrôlé de passage Club
→ RAISE EXCEPTION
```

Le flux contrôlé (saga §5 / Lot 7) bascule d'abord `billing_mode='club'` puis écrit la
souscription. Détail d'implémentation (jeton de session, ordre) en Lot 0 bis §1.

### 3.3 `can_create_tournament` — contrôle explicite

Modifier pour exiger explicitement `clubs.billing_mode = 'club' AND
club_has_active_subscription(club_id)` (en plus des branches superadmin / entitlement
tournoi inchangées). Verrouillé par les tests §9.2 du prompt.

### 3.4 Contrôle atomique de la limite de joueurs (Découverte)

RPC / fonction transactionnelle (ex. `add_team_player_guarded`) :
`SELECT ... FOR UPDATE` sur l'équipe (ou verrou advisory par `team_id`), comptage des
joueurs actifs **dans la transaction**, refus si le quota serait dépassé, puis insertion —
le tout atomique. Trigger de défense en profondeur en secours. Import CSV traité comme un
**lot cohérent** : refus du lot avant insertion s'il dépasserait le quota. Détail + test
de concurrence en Lot 0 bis §2.

### 3.5 Policies `team_subscriptions`

- `SELECT` : billing owner ; financial admin autorisé ; superadmin ; admin/dirigeant du
  club pour une **vue restreinte** (via RPC/vue dédiée). Colonnes sensibles protégées par
  REVOKE.
- `INSERT` / `UPDATE` / `DELETE` : **aucune** policy `authenticated` — écritures par
  service role uniquement (server functions + webhook), comme `subscriptions`.

```sql
REVOKE SELECT (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  ON public.team_subscriptions FROM authenticated, anon;
```

RPC de statut pour les membres non-payeurs :

```text
get_team_billing_status(team_id)
→ coverage, plan public, trial_end?, current_period_end?, can_manage_billing, upgrade_required
```

`team_billing_events` : SELECT limité à `can_view_team_billing_status` /
`can_manage_team_billing` ; écritures service role.

### 3.6 Matrice de tests RLS

`tests/rls/team-subscriptions.rls.ts` — 13 profils (team-plan §27.1), pour chaque policy :
autorisé / refusé / cross-club / après changement de rôle / après transfert / après
expiration ; + les tests critiques (dont « offre Équipe → jamais de tournoi » via
`can_create_tournament`, et « ligne `subscriptions` injectée sur `per_team` → refus »).

## 4. Server functions à créer / modifier

### Nouveau : `src/lib/team-billing.functions.ts`

Conventions de `billing.functions.ts` (garde d'auth, autorisation explicite,
`supabaseAdmin` pour les écritures) mais autorisation par `can_manage_team_billing`
(**pas** « club admin ») :

```text
createTeamCheckoutSession({ teamId, plan })     → session Stripe, metadata purpose="team_plan"
createTeamPortalSession({ teamId })
cancelTeamSubscriptionAtPeriodEnd({ teamId })
reactivateTeamSubscription({ teamId })
changeTeamSubscriptionInterval({ teamId, plan })
transferTeamBillingOwner({ teamId, toUserId })  → transactionnel + audit + notifications
getTeamSubscription({ teamId })                 → vue filtrée selon permissions
listMyBilledTeams()                             → page « Facturation et abonnements »
```

`createTeamCheckoutSession` : refus si `club_has_active_subscription(club_id)` OU si une
souscription vivante existe déjà (index partiel en garde-fou) ; réconciliation `incomplete`
préalable (team-plan §11).

### Nouveau : `src/lib/team-coverage.server.ts` + hook client

`getTeamCoverage(teamId)` / `getTeamEntitlements(userId, teamId)` retournant l'objet typé
(team-plan §16, avec `canManageTeamContent`, `canRespondToExistingObjects`,
`canAcceptTeamInvitation`, `discoveryTeamsRemaining*`). Hook `useTeamEntitlements(teamId)`
(motif de `use-club-subscription.ts`).

### Nouveau : recherche de club sécurisée

Route/server function de recherche (team-plan §24.4) : rate-limit **fail-closed**,
longueur minimale, résultats limités, données publiques minimales, journalisation ;
création des demandes de rattachement côté serveur.

### Modifié

- `src/lib/stripe.server.ts` : `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_YEARLY`
  (env + défauts) ; `getTeamPriceId`.
- `src/lib/billing.functions.ts` (Lot 7) : au checkout Club d'un club `per_team`, inclure
  la liste des `team_subscriptions` vivantes dans la confirmation ; l'arrêt effectif est
  déclenché par le webhook (§5).
- Onboarding : chemin « équipes/découverte » crée `clubs(billing_mode='per_team')` +
  `club_members(admin)` + première équipe, puis enchaîne (checkout ou activation
  Découverte).
- `src/lib/privacy.functions.ts` (ou équivalent) : intégrer
  `user_has_active_billing_responsibilities` avant suppression/anonymisation (RGPD, §9).
- `subscription-notify.server.ts` : variantes « équipe » des notifications financières.

`bun run check:guards` doit passer sur toutes les nouvelles server functions.

## 5. Stripe : produits, checkout, webhook

- **Un abonnement Stripe distinct par équipe.** Customer réutilisé par payeur (recherche
  d'un `stripe_customer_id` existant pour l'utilisateur, sinon création) — le customer
  Équipe est rattaché à l'**utilisateur payeur**, pas au club (à valider vs logique
  actuelle côté club).
- Checkout : `mode: "subscription"`,
  `subscription_data.metadata = { purpose:"team_plan", team_id, club_id, billing_owner_user_id, plan }`
  — posées sur la **souscription** (pour `customer.subscription.updated/deleted`) **et**
  sur la session (pour `checkout.session.completed`).
- Webhook : nouvelle branche dans `handleStripeWebhookPost`, à côté des branches tournoi :
  - `checkout.session.completed` (purpose `team_plan`) → upsert `team_subscriptions` keyed
    sur `stripe_subscription_id` ;
  - `customer.subscription.created/updated/deleted/trial_will_end/paused/resumed` : router
    sur `metadata.purpose` — **ne toucher `upsertSubscription` (club) que si la métadonnée
    est absente** (flux Club préservé) ; fallback de résolution par
    `stripe_subscription_id` ;
  - `invoice.payment_succeeded` / `payment_failed` : résolution par `subscription` →
    `team_subscriptions.stripe_subscription_id` ;
  - **passage Club (Lot 7)** : à `customer.subscription.created` Club sur un club
    `per_team` → saga idempotente (voir §6) qui bascule `billing_mode='club'`, programme
    l'arrêt des `team_subscriptions` vivantes, journalise `stopped_for_club_plan`.
- Idempotence globale : `stripe_webhook_events` (dédup `event_id`).

## 6. Saga « Équipe → Club » (Lot 7)

Ordre obligatoire (team-plan §18.1), idempotent, **couverture Club avant arrêt Équipe** :

```text
1  checkout Club
2  confirmation Stripe (abonnement Club actif)
3  enregistrement/confirmation de la souscription Club
4  bascule billing_mode='club' (flux contrôlé, lève le garde-fou §3.2)
5  précédence club_plan → toutes les équipes couvertes immédiatement
6  inventaire des team_subscriptions vivantes
7  marquage « migration en cours »
8  demande d'arrêt Stripe (stratégie : arrêt immédiat, prorata Stripe)
9  webhooks de confirmation
10 journalisation par équipe (team_billing_events)
11 marquage « migration terminée » quand toutes résolues
```

État de migration porté par une colonne/enregistrement dédié (idempotence par état :
n'annule que les souscriptions encore vivantes). Reprise manuelle prévue si une annulation
Stripe échoue. Détail (états, reprise, monitoring) en Lot 0 bis §4.

## 7. Machine à états grâce / expiration / lecture seule

Dérivée de Stripe + dates (team-plan §17). Job planifié idempotent (Lot 0 bis §5) :
détection fins d'essai → `discovery` **si éligible** (quotas §6.1) sinon `expired` ;
détection fins de grâce ; journalisation ; notifications ; réconciliation Stripe ↔ Clubero.
Préciser fréquence, verrouillage, idempotence, reprise. **Pas de promotion silencieuse**
`expired → discovery`.

## 8. Écrans & routes

| Surface                                                                               | Action                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/_authenticated.tsx` (`NoMembershipScreen`)                                | 4 choix d'onboarding (§24) ; recherche club + demande de rattachement ; mini-formulaire club + première équipe                                                  |
| Nouvelle route checkout Équipe (+ succès)                                             | motif des routes tournoi pricing/success                                                                                                                        |
| `src/routes/_authenticated/teams.tsx`                                                 | « Ajouter une équipe » → création + choix Découverte/checkout dans le même club (`per_team`)                                                                    |
| Nouvelle page « Facturation et abonnements » (ex. `_authenticated/billing-teams.tsx`) | liste des équipes + couverture, actions selon permissions, CTA ajouter une équipe, upsell Club                                                                  |
| `src/routes/_authenticated/admin/billing.tsx`                                         | clubs `per_team` : synthèse des couvertures + CTA passage offre Club (§18)                                                                                      |
| Écrans de blocage                                                                     | bannière/écran **lecture seule à portée équipe** ; écran upsell Tournoi (remplace tout état vide) ; admin club restreint à l'identité (`canManageClubIdentity`) |
| `src/routes/pricing.tsx` + marketing                                                  | grille Découverte / Équipe / Club ; aligner `marketing.json` (mentions « Découverte »/« Fédération » obsolètes)                                                 |
| `src/routes/superadmin/billing.tsx`                                                   | onglet/liste `team_subscriptions`                                                                                                                               |

## 9. Impacts

### Onboarding

- `NoMembershipScreen` : nouveaux chemins (le parcours `tournament_organizer` sert de
  précédent). Club `per_team` **sans** essai Club (trigger §2.2). `is_personal` /
  `get_or_create_personal_club` inchangés (réservés tournoi).

### Offre Club existante

- Aucun changement de schéma sur `subscriptions` ; trigger d'essai identique pour
  `billing_mode='club'` ; webhook Club isolé par `metadata.purpose`. Cas A (passage Club) :
  aucun changement de `club_id`, aucun déplacement, pas de trou de couverture.

### Module Tournoi

- `can_create_tournament` durcie (§3.3) + garde-fou DB (§3.2) ; tests de régression
  dédiés. Participation à un tournoi tiers : flux inchangés. Écran d'upsell à la place de
  tout état vide.

### Lecture seule à portée équipe (Lot 5, HAUT RISQUE)

- Deuxième couche au layout d'équipe (`teams/$teamId`) : `get_team_coverage` ∈
  {`grace`,`expired`,`none`} → bannière + UI lecture seule. **Enforcement serveur au
  niveau RLS/RPC** (pas seulement server functions — cf. inventaire Lot 0 bis §3). La garde
  club existante est étendue : pour un club `per_team`, ne pas afficher
  `ClubSubscriptionExpiredScreen` ; le club est « ouvert » si `club_has_any_team_coverage`,
  chaque équipe portant son propre état. Catégorie B (réponses) maintenue en grâce/lecture
  seule (team-plan §15.2).

### RGPD (Lot 6)

- `user_has_active_billing_responsibilities` avant suppression ; blocage + transfert/
  annulation obligatoire (team-plan §14).

## 10. Stratégie i18n

Nouvelles clés dans les namespaces existants (`common`, `marketing`), **7 locales** ;
`bun run check:i18n` en critère de sortie de chaque lot UI (ou baseline §21 du prompt).
Alignement de la grille marketing. Attention à la dette i18n existante (clés `groups.*`).

## 11. Tests

- **Unitaires (vitest)** : résolution de couverture (`get_team_coverage`, matrice statuts ×
  trial × périodes × Découverte-quota), entitlements par couverture (dont catégorie B),
  anti-double-couverture, transfert du billing owner, éligibilité Découverte à la fin
  d'essai (§6.1).
- **Intégration webhook** : événements `team_plan` (création, échec, annulation, bascule
  Club), rejeu (idempotence), événement sans metadata → flux Club inchangé.
- **RLS** (`tests/rls/team-subscriptions.rls.ts`) : matrice complète.
- **Concurrence** : deux insertions de joueur à 14 actifs → jamais > 15 (§3.4).
- **E2E (Playwright)** : onboarding Découverte/Équipe, ajout d'équipe, page facturation,
  écran lecture seule, upsell tournoi, garde-fou tournoi sur `per_team`.
- **Régression** : suite existante verte ; `check:guards` ; `check:i18n` (ou baseline).

## 12. Risques de régression

| Risque                                                        | Mitigation                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Trigger d'essai modifié casse la création de clubs classiques | Early-return `per_team` minimal + test « club classique reçoit toujours son essai 14 j »                        |
| Branche webhook `team_plan` intercepte des événements Club    | Routage strict `metadata.purpose` ; défaut = flux Club ; tests des deux flux                                    |
| Garde `_authenticated.tsx` régresse le verrouillage Club      | `billing_mode='club'` suit le chemin actuel à l'identique ; nouvelle logique atteinte seulement pour `per_team` |
| Déblocage tournoi via `subscriptions` injectée sur `per_team` | Garde-fou DB (§3.2) + `can_create_tournament` explicite (§3.3) + tests invariants                               |
| Événements `subscription.updated` sans metadata               | Metadata sur la souscription à la création + fallback `stripe_subscription_id`                                  |
| Fenêtre de double facturation au passage Cas A                | Couverture Club d'abord, arrêt Équipe ensuite ; prorata Stripe ; saga idempotente                               |
| Correctif `exempt_until` coupe des clubs en prod              | **Audit préalable** des clubs `exempt_until <= now()` (Lot 0 bis §7) avant déploiement                          |
| Paywall équipe contourné par write client direct              | Enforcement RLS/RPC (inventaire Lot 0 bis §3), pas server-fn seul                                               |
| Limite Découverte contournée par concurrence                  | Contrôle atomique (§3.4) + test de concurrence                                                                  |
| RGPD : team_subscription orpheline                            | `user_has_active_billing_responsibilities` bloquant (Lot 6)                                                     |
| Parité i18n (CI rouge)                                        | Corriger la dette d'abord ou baseline ; clés livrées dans les 7 locales                                         |

## 13. Déploiement & rollback

- **Feature flag** `team_plan_v1` (`app_flags`) masquant onboarding, pricing Équipe, CTA,
  checkout, pages de facturation, ajout d'équipes payantes. Ne désactive jamais webhooks/
  cron/sync Stripe/lecture des souscriptions. Rollback = flag off ; migrations additives,
  jamais destructives.
- Prix Stripe créés en amont (test puis live), IDs par env.
- Ordre = lots 1 → 8 ; chaque lot shippable derrière le flag ; Lots 7 et 8 avec flags
  séparés. `team_subscriptions` reste la projection des webhooks (traités même flag off) →
  aucun état orphelin.

## Points en attente de décision (repris du team-plan §31)

- Liste précise des fonctionnalités **Découverte** (team-plan §7.1).
- Durée de la **période de grâce** + cadence du job.
- Résultat de l'**audit `exempt_until`** + plan de régularisation.
- FK `billing_owner_user_id` vers `auth.users` en défense en profondeur (oui/non).
- Comportement des joueurs « temporairement inactifs » dans le comptage.
