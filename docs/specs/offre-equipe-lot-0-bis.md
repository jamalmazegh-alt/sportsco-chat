# Lot 0 bis — Durcissement, inventaires & prérequis (offre Équipe)

> **Statut :** livrable documentaire **obligatoire avant tout code fonctionnel** du Lot 1.
> Ce document décrit les analyses, inventaires et stratégies à produire/valider avant
> d'implémenter l'offre Équipe. Tant qu'il n'est pas complété et validé, **aucun Lot ≥ 1
> ne démarre**.
>
> Documents liés : `offre-equipe-team-plan.md`, `offre-equipe-architecture-plan.md`.

## 0. Objet & critères de sortie du Lot 0 bis

Le Lot 0 bis est terminé quand **tous** les livrables ci-dessous sont produits et validés :

```text
[ ] §1  Garde-fous DB spécifiés (anti-Club sur per_team, can_create_tournament)
[ ] §2  Définition unique de "joueur actif" figée
[ ] §3  Stratégie atomique de la limite de joueurs (RPC + trigger + import)
[ ] §4  Inventaire des lecteurs de `subscriptions`
[ ] §5  Inventaire des mutations directes Supabase (paywall équipe) + classement A/B/C/D
[ ] §6  Mapping coverage → capabilities figé (réconcilié §15/§16 du prompt)
[ ] §7  Job planifié : fréquence, verrou, idempotence, reprise
[ ] §8  Audit des données `exempt_until` + plan de régularisation
[ ] §9  Spécification recherche de club sécurisée
[ ] §10 Baseline CI (i18n, lint) documentée
[ ] §11 Décisions ouvertes tranchées ou explicitement reportées
```

## 1. Garde-fous DB à spécifier

### 1.1 Interdiction d'une offre Club active sur un club `per_team`

Livrable : spécification du trigger `BEFORE INSERT OR UPDATE ON public.subscriptions`
(couvrant service role / `supabaseAdmin`), incluant :

- condition exacte de refus (`status ∈ {active, trialing}` ou exemption active) **ET**
  `clubs.billing_mode = 'per_team'` ;
- mécanisme de la **seule exception** (flux contrôlé de passage Club) : ordre = bascule
  `billing_mode='club'` **avant** l'écriture de la souscription, ou jeton de session
  transactionnel (ex. `SET LOCAL clubero.club_migration = 'on'`) vérifié par le trigger.
  Décrire le choix retenu et pourquoi ;
- message d'erreur et code, comportement attendu côté appelant.

### 1.2 `can_create_tournament` explicite

Livrable : nouvelle définition de la fonction exigeant
`clubs.billing_mode = 'club' AND club_has_active_subscription(club_id)` en plus des
branches superadmin / entitlement tournoi (inchangées). Table de vérité (team-plan §9.2) à
joindre comme tests de non-régression.

## 2. Définition unique de « joueur actif »

Livrable : une **fonction/vue centrale unique** définissant « joueur actif » pour le
comptage Découverte. À figer :

- ce qui compte : joueur rattaché à l'équipe, non archivé, non supprimé ;
- ce qui **ne** compte **pas** : parents, responsables légaux, coaches, assistants, staff,
  joueurs archivés/supprimés ;
- traitement des joueurs « temporairement inactifs » (décision à prendre : comptés ou non) ;
- table(s) et colonne(s) exactes utilisées (`team_members`, statut d'archivage…), à vérifier
  sur `src/integrations/supabase/types.ts`.

Aucune duplication de cette définition ailleurs (front, server functions, RLS
l'appellent).

## 3. Stratégie atomique de la limite de joueurs

**Interdit** : `count` applicatif puis `insert`. Livrable : spécification d'une opération
atomique résistant à la concurrence.

### 3.1 Chemin unitaire (ajout d'un joueur)

```text
- RPC / fonction transactionnelle SECURITY DEFINER (ex. add_team_player_guarded)
- verrou approprié sur l'équipe : SELECT ... FOR UPDATE sur teams(id) OU
  pg_advisory_xact_lock(hashtext(team_id::text))
- comptage des joueurs actifs DANS la transaction (via la fonction §2)
- si count >= DISCOVERY_MAX_ACTIVE_PLAYERS_PER_TEAM ET coverage = 'discovery' → refus
- sinon insertion, dans la MÊME transaction
```

### 3.2 Défense en profondeur

Trigger `BEFORE INSERT` sur la table des joueurs vérifiant l'invariant même si un chemin
oublie la RPC. Le trigger est un filet, pas la logique principale (il ne doit pas casser
Équipe/Club illimités : n'agir que si l'équipe est en `discovery`).

### 3.3 Import (CSV / multiple) — lot cohérent

**Recommandation (décision v4)** : **refuser le lot entier avant insertion** s'il ferait
dépasser 15 joueurs actifs (comportement atomique du lot), plutôt que d'insérer ligne par
ligne. Livrable : spécifier explicitement le contrat retenu :

```text
- calcul : actifs_actuels + lignes_valides_du_lot <= 15 ?
- si non → refus du lot, message clair (aucune insertion partielle)
- rapport d'erreurs de validation (format des lignes) séparé du contrôle de quota
```

### 3.4 Test de concurrence obligatoire

```text
Équipe Découverte à 14 joueurs actifs
→ 2 insertions concurrentes simultanées
→ résultat final : exactement 15 joueurs actifs, jamais 16
```

À implémenter dans la suite de tests (unitaire/intégration DB) et référencé par les
critères d'acceptation (team-plan §27.2 / §30.9).

## 4. Inventaire des lecteurs de `subscriptions`

Livrable : tableau exhaustif. Un club `per_team` peut **légitimement** n'avoir aucune ligne
`subscriptions` ; aucun écran/helper ne doit planter.

| Fichier / fonction | Hypothèse actuelle | Comportement sur club `per_team` (sans ligne) | Risque | Modification requise | Lot |
| ------------------ | ------------------ | --------------------------------------------- | ------ | -------------------- | --- |
| _(à remplir)_      |                    |                                               |        |                      |     |

Sources à balayer (au minimum) : `has-paid-access.ts` / `.server.ts`,
`club_has_active_subscription`, gardes de `src/routes/_authenticated.tsx`, hooks
`use-club-subscription`, dashboards admin/superadmin, assistant IA, feature contexts, pages
de facturation, exemptions, trial reminders, notifications, scripts, tests. Repérer tous les
`.single()` / `.maybeSingle()` / jointures sur `subscriptions`.

## 5. Inventaire des mutations directes Supabase (paywall équipe)

Livrable : tableau exhaustif des mutations client→Supabase portant sur des données
d'équipe, avec classement A/B/C/D (team-plan §15.2).

| Fichier       | Table/RPC | Opération | Rôle | Colonne d'où l'équipe est déductible | Catégorie A/B/C/D | Couverture requise | Policy actuelle | Modification proposée | Risque régression |
| ------------- | --------- | --------- | ---- | ------------------------------------ | ----------------- | ------------------ | --------------- | --------------------- | ----------------- |
| _(à remplir)_ |           |           |      |                                      |                   |                    |                 |                       |                   |

Classement :

- **A. Gestion** → `canManageTeamContent` obligatoire (bloqué hors couverture d'écriture).
- **B. Réponses à un objet existant** → `canRespondToExistingObjects` /
  `canAcceptTeamInvitation` : **restent autorisées** en `grace`/`expired` (répondre à une
  convocation, disponibilité, sondage, besoin, accepter une invitation).
- **C. Système** (webhooks/cron/service role) → non bloqué par la RLS utilisateur, mais
  gardé/audité.
- **D. Lectures** → généralement consultables après expiration.

## 6. Mapping `coverage → capabilities` (réconciliation §15/§16)

Livrable : table figée reliant chaque `coverage` aux booléens de l'objet entitlements
(team-plan §16). Exemple de trame à compléter/valider :

| coverage   | canRead | canWrite | canManageTeamContent | canRespond… | canAcceptInvit. | canManagePlayers | canCreateEvents | canUseTeamWall | canUseClubFeatures | canManageClubIdentity | canCreateTournament | maxPlayers |
| ---------- | ------- | -------- | -------------------- | ----------- | --------------- | ---------------- | --------------- | -------------- | ------------------ | --------------------- | ------------------- | ---------- |
| club_plan  | ✔       | ✔        | ✔                    | ✔           | ✔               | ✔                | ✔               | ✔              | ✔                  | ✔                     | ✔\*                 | null       |
| team_plan  | ✔       | ✔        | ✔                    | ✔           | ✔               | ✔                | ✔               | ✔              | ✗                  | ✔                     | ✗                   | null       |
| team_trial | ✔       | ✔        | ✔                    | ✔           | ✔               | ✔                | ✔               | ✔              | ✗                  | ✔                     | ✗                   | null       |
| discovery  | ✔       | ✔        | ✔                    | ✔           | ✔               | ✔ (≤15)          | ✔               | ✔              | ✗                  | ✔                     | ✗                   | 15         |
| grace      | ✔       | ✗        | ✗                    | **✔**       | **✔**           | ✗                | ✗               | lecture        | ✗                  | ✔                     | ✗                   | —          |
| expired    | ✔       | ✗        | ✗                    | **✔**       | **✔**           | ✗                | ✗               | lecture        | ✗                  | ✔                     | ✗                   | —          |
| none       | ✔/✗     | ✗        | ✗                    | ✗           | ✗               | ✗                | ✗               | ✗              | ✗                  | ✗                     | ✗                   | —          |

`*` tournoi via Club uniquement si `billing_mode='club'` + abonnement actif.
Colonne `canUseClubFeatures` : les fonctionnalités Club transverses ne sont jamais
incluses dans l'offre Équipe (✗ partout sauf `club_plan`).
Les cases **en gras** matérialisent la décision v4 : la catégorie B survit à
grâce/expiration. Valider chaque cellule avant Lot 5.

## 7. Audit des données `exempt_until` (avant correctif SQL)

Livrable **bloquant** avant déploiement du correctif SQL (team-plan §12.1). Requête de
recensement :

```sql
SELECT club_id, exempt_until, exemption_reason
FROM public.subscriptions
WHERE exempt_from_billing = true
  AND exempt_until IS NOT NULL
  AND exempt_until <= now();
```

Pour chaque club concerné, produire :

| club_id       | nom | date d'expiration | motif | accès actuellement obtenu (à cause du bug) | impact de la correction | action de régularisation |
| ------------- | --- | ----------------- | ----- | ------------------------------------------ | ----------------------- | ------------------------ |
| _(à remplir)_ |     |                   |       |                                            |                         |                          |

Règles :

- **Ne pas déployer** le correctif SQL avant décision explicite sur ces données.
- Le correctif est une migration **séparée** (architecture §2.7), déployée après
  régularisation (prolonger l'exemption, contacter le club, ou couper sciemment).
- Objectif : éviter toute coupure de production silencieuse.

## 8. Job planifié (fins d'essai / grâce)

Livrable : spécification opérationnelle.

```text
- fréquence (ex. horaire) et fenêtre
- mécanisme de verrouillage (évite les exécutions concurrentes)
- idempotence (rejouable sans double effet ; transitions calculées une seule fois)
- transitions gérées :
    trial expiré → discovery SI éligible (§6.1 du prompt) SINON expired
    grâce expirée → expired
- PAS de promotion silencieuse expired → discovery
- journalisation (team_billing_events) + notifications
- réconciliation Stripe ↔ Clubero + détection d'incohérences
- reprise après échec partiel
- durée exacte de la période de grâce (grace_end) — À TRANCHER
```

## 9. Recherche de club sécurisée (spécification)

Livrable : contrat de l'endpoint (team-plan §24.4).

```text
- rate-limit FAIL-CLOSED (en cas d'indisponibilité du limiteur → refuser, pas laisser passer)
- longueur minimale de recherche imposée
- nombre de résultats limité
- données publiques strictement nécessaires uniquement
- JAMAIS : membres, emails, rôles, facturation, équipes privées
- journalisation des comportements suspects
- création des demandes de rattachement CÔTÉ SERVEUR
```

Forme de la réponse publique :

```text
nom public
logo public éventuel
sport
ville approximative
token / identifiant opaque de demande
```

## 10. Baseline CI

Livrable : baseline documentée avant d'utiliser la CI comme _exit gate_.

- `bun run check:i18n` : lister les clés manquantes actuelles (dont `common.groups.*`) —
  décider **corriger d'abord** (recommandé) ou baseline.
- `bun run lint` : nombre exact d'erreurs/fichiers.
- Critère de sortie retenu : « aucune nouvelle erreur vs baseline » (jamais un faux vert).
- `bun run check:guards`, `bun run test`, `bun run test:rls` : état de référence.

## 11. Décisions ouvertes à trancher (ou reporter explicitement)

```text
[ ] Durée exacte de la période de grâce (grace_end)
[ ] Cadence précise du job planifié
[ ] Liste définitive des fonctionnalités Découverte (team-plan §7.1)
[ ] Joueurs "temporairement inactifs" : comptés ou non dans la limite
[ ] FK billing_owner_user_id → auth.users (défense en profondeur) : oui/non
[ ] Customer Stripe Équipe rattaché à l'utilisateur payeur (confirmer vs logique club)
[ ] Résultat de l'audit exempt_until + plan de régularisation
```

## Rappel de périmètre V1 (décisions v4)

```text
INCLUS V1  : Découverte + Équipe + passage Club ; rattachement simple (recherche,
             suggestion, demande de rejoindre, création club distinct, signalement manuel)
HORS V1    : rapprochement/fusion de clubs ; changement transversal de club_id ;
             fusion automatique/semi-automatique d'équipes ; grandfathering des quotas
```
