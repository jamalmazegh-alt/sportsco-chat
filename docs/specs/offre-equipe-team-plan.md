# Prompt — Offre Clubero Équipe à 9,99 € par équipe (v4, vérifié contre le code)

> Historique : v2 = corrections issues de l'audit du dépôt ; v3 = corrections produit
> (club réel, pas de migration de club, joueurs illimités en offre Équipe) ;
> **v4 = quotas Découverte et éligibilité en fin d'essai, fusion de clubs hors V1,
> contrôle atomique de la limite de joueurs, états d'accès A/B/C/D réconciliés avec les
> entitlements, audit `exempt_until`, recherche de club sécurisée, friction multi-équipes
> assumée.**
>
> Les sections « Contexte technique vérifié » et les pièges signalés contiennent des faits
> constatés dans le code : ne pas les réinventer, les re-vérifier avant de coder.
>
> Documents liés :
> - `docs/specs/offre-equipe-architecture-plan.md` — plan d'architecture (Lot 0)
> - `docs/specs/offre-equipe-lot-0-bis.md` — investigations bloquantes (Lot 0 bis)

## Objectif et positionnement commercial

```text
Offre Découverte (gratuite)
- une équipe ;
- nombre de joueurs actifs limité (configurable, recommandation : 15) ;
- quotas stricts (voir §11) ;
- destinée à découvrir Clubero.

Offre Équipe
- 9,99 €/mois ou 99,99 €/an PAR ÉQUIPE ;
- joueurs ILLIMITÉS ;
- coaches et membres du staff ILLIMITÉS ;
- toutes les fonctionnalités opérationnelles de l'équipe ;
- pas de fonctionnalités centrales du club.

Offre Club (existante : 49 €/mois ou 490 €/an)
- toutes les équipes du club ;
- joueurs et membres illimités ;
- fonctionnalités centrales et transverses du club.
```

Un utilisateur doit pouvoir : créer son club (structure réelle et visible) et sa première
équipe ; inviter un staff illimité sans surcoût ; créer d'autres équipes dans le même
club, chacune avec sa souscription (périodicités mixtes) ; passer à l'offre Club **sur le
même club, sans migration de données**.

---

## 1. Contexte technique vérifié (état des lieux du dépôt)

**Stack.** TanStack Start (React 19 + Vite) sur Cloudflare Workers (`wrangler.jsonc`,
`src/server.ts`). **Pas de Supabase Edge Functions** : la logique serveur vit dans les
server functions TanStack (`src/lib/*.functions.ts`, `src/modules/*/*.functions.ts`) et
les routes API (`src/routes/api/**`, `src/routes/webhooks/**`). Bun. Schéma de
référence : `src/integrations/supabase/types.ts`.

**Modèle de données.** Hiérarchie stricte `clubs → teams` ; `teams.club_id` est **NOT
NULL** (et doit le rester). Le mécanisme `clubs.is_personal` +
`get_or_create_personal_club` existe mais est réservé au parcours organisateur de tournoi :
**il ne définit pas le modèle produit de l'offre Équipe** (§2).
Rôles : enum `app_role` = `admin | coach | parent | player | dirigeant | financial_admin` ;
`club_members.roles text[]` porte les rôles fins (`assistant_coach`, `staff`…). Ne pas
inventer de nouveaux rôles.

**Joueurs.** La table `players` possède `deleted_at` (soft delete) mais **aucun état
« archivé »** ni colonne de statut ; le rattachement à une équipe passe par
`team_members.player_id`. Toute règle de comptage doit partir de ce fait (§12).

**Facturation existante (à réutiliser).** Table `subscriptions` **une par club**
(UNIQUE sur `club_id`), enums `subscription_plan` et `subscription_status`, champs
d'exemption. Server functions complètes dans `src/lib/billing.functions.ts`, toutes
verrouillées « club admin ». Webhook signé et idempotent
(`src/lib/stripe-webhook-handler.server.ts`, table `stripe_webhook_events` — existe
déjà). Prix dans `src/lib/stripe.server.ts` via env avec valeurs par défaut.

**Piège vérifié — trigger d'essai.** `auto_create_trial_subscription` (AFTER INSERT ON
`clubs`) crée un essai **Club** de 14 jours pour tout club non-personnel. Sans précaution,
un club créé via l'onboarding Équipe recevrait un essai Club complet, débloquant les
fonctionnalités Club **et la création de tournois** pendant 14 jours (§4).

**Piège vérifié — `exempt_until` ignoré en SQL.** `club_has_active_subscription`
(`supabase/migrations/20260622120000_subscription_billing_exemption.sql:36`) teste
`exempt_from_billing = true` **sans regarder `exempt_until`**, alors que
`isBillingExempt` (`src/lib/has-paid-access.ts:22-25`) l'honore. La colonne a été ajoutée
plus tard (`20260622170729_…sql:1`) sans mise à jour de la fonction. Une exemption
expirée donne donc encore accès via RLS et `can_create_tournament`. **Correction
soumise à l'audit préalable du Lot 0 bis §0 bis.3 — ne pas corriger à l'aveugle.**

**Piège vérifié — rate limiter fail-open.** `checkRateLimit`
(`src/lib/rate-limit.server.ts:46-52`) retourne `true` en cas d'erreur. Toute exigence
fail-closed (§10) impose une variante dédiée, pas la réutilisation du helper.

**Tournois.** Module complet dans `src/modules/tournaments/`. Création restreinte par
`can_create_tournament(_user_id)` : superadmin, OU entitlement tournoi actif, OU
admin/dirigeant d'un club dont `club_has_active_subscription()` est vrai.

**Entitlements.** Aucun système centralisé ni quota n'existe : pas de `max_players`, pas
de comptage de sièges. Mécanismes existants : `has-paid-access`,
`club_has_active_subscription`, entitlements tournois, feature flags V2.

**i18n.** 7 locales (`fr, en, de, es, it, nl, pt`), parité vérifiée en CI
(`bun run check:i18n`). Les libellés français cités ici sont la version `fr` des clés.

**Sécurité.** RLS par helpers SECURITY DEFINER (`is_team_staff`, `user_is_in_team`,
`has_club_role`…). Sur `subscriptions`, colonnes Stripe protégées par **REVOKE au niveau
colonne**. Tests : `tests/rls/`, `bun run test:rls`, `bun run check:guards`.

---

## 2. Modèle produit : l'utilisateur crée toujours un club

Même en offre Équipe, l'utilisateur crée un **vrai club** visible, puis une ou plusieurs
équipes à l'intérieur :

```text
USAG Uckange
├── U13 — offre Équipe mensuelle
└── U15 — offre Équipe annuelle
```

Jamais « compte personnel → équipe isolée » du point de vue de l'utilisateur.

L'offre Équipe signifie uniquement que : la facturation s'effectue équipe par équipe ;
seules les équipes ayant une souscription active sont couvertes ; les fonctionnalités
centrales Club restent bloquées.

## 3. Séparation des concepts

```text
Club              = organisation et identité
Équipe            = unité sportive
Team subscription = unité de facturation Équipe (couvre UNE équipe)
Club subscription = couverture globale du club (table subscriptions existante)
Billing owner     = personne responsable du paiement d'une team subscription
Discovery owner   = personne portant le quota Découverte d'une équipe gratuite
```

Un club peut exister sans abonnement Club tout en ayant des équipes couvertes
individuellement et des équipes non couvertes :

```text
FC Exemple
├── U11 — abonnement Équipe mensuel
├── U13 — abonnement Équipe annuel
├── U15 — Découverte (quota club 1/2)
└── Seniors — sans couverture, lecture seule
```

Le prix ne dépend jamais du nombre de coaches, de comptes ou de membres du staff.

## 4. Modèle technique

- Indicateur sur `clubs` : `billing_mode = 'club' (défaut) | 'per_team'`.
  `'club'` = comportement actuel inchangé pour tous les clubs existants ;
  `'per_team'` = pas d'essai Club automatique (ajuster le trigger), couverture évaluée
  équipe par équipe, fonctionnalités Club bloquées, identité gérable.
- Table `team_subscriptions` (une ligne par équipe couverte), sur le modèle de
  `tournament_entitlements` — schéma détaillé dans le plan d'architecture.
- **Ne pas toucher** à `subscriptions`, à sa contrainte UNIQUE, ni à la sémantique de
  `club_has_active_subscription` (§8).
- Stripe : **une souscription distincte par équipe**, `metadata.purpose = "team_plan"` +
  `metadata.team_id` posées sur la souscription (pas seulement sur la session).
- Nouveaux prix `STRIPE_PRICE_TEAM_MONTHLY` / `STRIPE_PRICE_TEAM_YEARLY`, surchargeables
  par env comme les prix existants.

## 5. Onboarding Équipe

Ajouter au choix existant (« créer un club » / « rejoindre via invitation ») :

> « Je souhaite gérer une ou plusieurs équipes » / « Je représente un club »

Parcours : compte → **recherche d'un club existant (§10)** → nom du club/structure
(obligatoire), logo (optionnel), sport principal → nom et catégorie de la première équipe
→ **annonce des quotas si l'équipe n'est pas éligible à Découverte (§11.4)** → choix
mensuel/annuel → essai ou souscription → accès à l'équipe → invitation du staff.

Le club créé est visible et gérable a minima (§9), avec `billing_mode = 'per_team'`.

## 6. Équipes supplémentaires

Bouton « Ajouter une équipe » : infos, catégorie, sport, tarif, périodicité, checkout,
activation — dans le **même club**.

- « Chaque équipe supplémentaire est facturée 9,99 €/mois ou 99,99 €/an. »
- Périodicités mixtes possibles ; pas de passage forcé à l'offre Club à la deuxième
  équipe ; upsell Club informatif au-delà d'un seuil (≈ 5 équipes).
- La condition `teams.length < 3` dans `src/routes/_authenticated/teams.tsx` est
  cosmétique, pas un quota.

## 7. États d'accès A/B/C/D

> Ces quatre catégories n'existaient pas dans les versions précédentes du document ;
> elles sont définies ici pour donner une base commune aux entitlements (§8) et à la
> lecture seule (§15).

| État | Situation | Création / gestion | Réponses aux objets existants | Acceptation d'invitation |
|---|---|---|---|---|
| **A — Actif** | Couverture `club_plan`, `team_plan`, `team_trial`, ou Découverte dans les quotas | ✅ | ✅ | ✅ |
| **B — Grâce** | Paiement échoué, dans la fenêtre de grâce | ✅ (+ alerte au payeur) | ✅ | ✅ |
| **C — Lecture seule souple** | Essai terminé sans bascule Découverte possible, couverture expirée, quota Découverte dépassé | ❌ | ✅ | ✅ |
| **D — Lecture seule stricte** | Équipe archivée ou suspendue administrativement | ❌ | ❌ | ❌ |

L'état **C est le comportement par défaut** de toute équipe sans couverture : bloquer
la création et la gestion, mais **laisser les réponses aux objets déjà créés**. Empêcher
un parent de répondre à une convocation pour un match qui a quand même lieu, ou un coach
d'accepter une invitation qui régulariserait la situation, produit des dégâts
fonctionnels sans effet commercial utile.

Dans tous les états : **les données sont intégralement conservées**, la consultation
reste possible, et un bouton de réactivation est affiché.

## 8. Entitlements — V1 simple et extensible

Centraliser les droits pour éviter les conditions dispersées dans le front, **sans
construire un moteur de plans générique** en V1. API centrale :

```text
get_team_coverage(team_id)              → couverture résolue
get_team_entitlements(user_id, team_id) → objet typé ci-dessous
team_has_paid_access(team_id)           → booléen
```

Objet retourné, réconcilié avec les états A/B/C/D :

```ts
{
  coverage: "club_plan" | "team_plan" | "team_trial" | "discovery"
          | "grace" | "expired" | "none",
  accessState: "A" | "B" | "C" | "D",

  // Gestion et création — vrai en A et B uniquement
  canManageTeam: boolean,
  canManageTeamContent: boolean,      // créer/modifier événements, convocations,
                                      // compositions, sondages, besoins, documents
  canInviteTeamStaff: boolean,
  canManagePlayers: boolean,
  canCreateEvents: boolean,
  canUseTeamWall: boolean,

  // Participation — reste vrai en C
  canRespondToExistingObjects: boolean, // convocation, disponibilité, sondage, besoin
  canAcceptTeamInvitation: boolean,

  // Périmètre club
  canUseClubFeatures: boolean,        // mur club, stats consolidées, groupes transverses…
  canManageClubIdentity: boolean,     // nom, logo, sport — distinct du précédent

  // Modules
  canCreateTournament: boolean,

  // Quotas
  maxPlayers: number | null           // null = illimité
}
```

Correspondance états → champs :

```text
A : tout à true (selon l'offre : canUseClubFeatures false hors offre Club)
B : identique à A, plus une alerte au responsable de facturation
C : canManageTeam/…/canUseTeamWall = false
    canRespondToExistingObjects = true, canAcceptTeamInvitation = true
D : tout à false sauf la consultation
```

**Limite de joueurs — portée par l'offre Découverte, PAS par l'offre Équipe :**

```text
Offre Découverte : maxPlayers configurable, recommandé à 15 (à valider — §21)
Offre Équipe     : maxPlayers = null (illimité)
Offre Club       : maxPlayers = null (illimité)
```

Fonctionnalités incluses dans l'offre Équipe : gestion d'équipe, joueurs (illimités),
parents/responsables légaux, staff (illimité), événements, entraînements, matchs,
convocations et réponses, présences, compositions, disponibilités joueurs et staff,
besoins liés aux événements, communication et mur d'équipe, mur staff, sondages,
notifications, emails transactionnels, documents, calendrier, statistiques déjà
disponibles, import de joueurs, invitations.

Exclusions : mur général du club, statistiques consolidées, groupes transverses,
communication club entière, gestion centralisée des membres et rôles, réunions Club,
documents communs au club, gestion financière globale, CRM, sponsoring, modules premium
futurs, IA réservée à d'autres offres, ligue/championnat, création et gestion de tournois.

## 9. Droits du club sous offre Équipe

Un club en `billing_mode = 'per_team'` gère le minimum nécessaire à son identité et à ses
équipes. **Éviter un `can_manage_club = false` trop large** qui empêcherait de modifier le
nom ou le logo.

Autorisé (`canManageClubIdentity`) : nom, logo, sport, informations publiques minimales,
liste des équipes couvertes, page de facturation des équipes selon permissions.

Bloqué (`canUseClubFeatures`) : mur général, statistiques consolidées, groupes
transverses, communication globale, réunions Club, gestion centralisée des membres,
fonctionnalités financières globales, création de tournois via l'abonnement Club.

## 10. Recherche de club et rattachement — périmètre V1

Pour éviter la prolifération de doublons, l'onboarding propose de rechercher un club
existant avant d'en créer un.

**Périmètre V1 strictement limité à :**

- recherche d'un club existant ;
- suggestion limitée (nombre de résultats plafonné) ;
- demande de rattachement ;
- création d'un club distinct si la suggestion est incorrecte ;
- signalement manuel d'un doublon à Clubero.

**Hors V1 :** le rapprochement complet de deux clubs et toute fusion impliquant des
changements transversaux de `club_id`. Aucune fusion automatique ni semi-automatique.
Le rapprochement de clubs devient un chantier ultérieur indépendant.

**Exigences de sécurité de l'endpoint de recherche :**

- rate-limité avec un comportement **fail-closed** (le helper existant est fail-open —
  §1 — donc variante dédiée obligatoire) ;
- longueur minimale de recherche imposée ;
- nombre de résultats limité ;
- **uniquement les données publiques strictement nécessaires** ;
- ne jamais exposer membres, emails, rôles, facturation ni équipes privées ;
- journalisation des comportements suspects ;
- demandes de rattachement créées **côté serveur**.

Réponse publique réduite à :

```text
nom public
logo public éventuel
sport
ville approximative
token ou identifiant opaque de demande
```

## 11. Offre Découverte : quotas et fin d'essai

### 11.1 Quotas V1

```text
1 équipe Découverte maximum par utilisateur
2 équipes Découverte maximum par club
1 essai Équipe maximum par utilisateur
```

### 11.2 Éligibilité à la bascule en fin d'essai

La bascule automatique vers Découverte n'est autorisée que si **les deux quotas** sont
respectés au moment de la fin d'essai :

- le club possède moins de 2 équipes Découverte actives ;
- le créateur ou bénéficiaire de l'équipe ne possède pas déjà une équipe Découverte
  active.

Si l'un des quotas est atteint :

```text
fin d'essai
→ conservation intégrale des données
→ équipe en lecture seule (état C)
→ proposition Offre Équipe ou Offre Club
```

**Aucun grandfathering ne permet de dépasser les quotas Découverte.**

Exemple :

```text
U13 — Découverte, Coach 1
U15 — Découverte, Coach 2
U17 — essai créé par Coach 1

Fin de l'essai U17 : quota club 2/2 atteint ET quota Coach 1 atteint
→ bascule refusée, U17 passe en lecture seule
```

### 11.3 Atomicité

L'évaluation des quotas et la bascule doivent être **transactionnelles avec verrou**
(deux fins d'essai simultanées dans un même club ne doivent jamais produire 3 équipes
Découverte). Stratégie détaillée en Lot 0 bis §0 bis.1.2.

### 11.4 Friction assumée et annoncée

Un coach seul qui crée une deuxième équipe doit choisir immédiatement l'offre Équipe
payante, sauf si cette équipe est créée et portée par un autre coach éligible du même
club. **Cette restriction est intentionnelle et doit être annoncée avant la fin du
wizard**, pas découverte à la fin de l'essai. Le message distingue les deux causes
(quota utilisateur vs quota club), car la solution proposée diffère.

## 12. Limite de joueurs : contrôle atomique obligatoire

Un contrôle applicatif `count` puis `insert` est **interdit** : il ne résiste pas aux
écritures concurrentes.

Exigences :

- vérification et insertion dans **une même transaction**, avec verrou approprié sur
  l'équipe ; RPC ou fonction transactionnelle comme seul chemin d'ajout ;
- trigger de défense en profondeur en filet ;
- import CSV traité comme un **lot cohérent** — recommandation : refuser le lot avant
  insertion s'il dépasserait le quota, plutôt que des erreurs ligne par ligne ;
- test obligatoire : deux insertions concurrentes sur une équipe à 14 joueurs, quota 15
  → **jamais plus de 15 joueurs actifs**.

Règles de comptage : compter les joueurs **actifs** ; ne pas compter les joueurs
supprimés ; définir le comportement des joueurs temporairement inactifs ; empêcher le
contournement archiver/restaurer en boucle ; appliquer la même règle à la création
manuelle, à l'import CSV et aux transferts entre équipes ; les invitations de parents ne
comptent jamais ; coaches et staff illimités y compris en Découverte.

À la limite atteinte : conserver tous les joueurs présents, bloquer ajout et import, ne
pas bloquer la consultation, afficher — « Vous avez atteint la limite de 15 joueurs de
l'offre Découverte. Passez à l'offre Équipe pour ajouter un nombre illimité de joueurs… »
— avec « Passer à l'offre Équipe — 9,99 €/mois » et « Découvrir l'offre Club ».

Stratégie complète en Lot 0 bis §0 bis.2 (dont la définition du « joueur actif », qui
doit composer avec l'absence d'état « archivé » dans `players`).

## 13. Couverture, précédence et stricte séparation Club / Équipe

Précédence : (1) souscription Club active ou exemption Club → couverture Club ;
(2) sinon `team_subscription` active ou en essai → couverture Équipe ; (3) sinon
Découverte si les quotas le permettent ; (4) sinon grâce, expiré ou aucune couverture.

**Règle stricte :** `club_has_active_subscription(club_id)` doit continuer à signifier
**exclusivement** « le club possède une vraie offre Club active ou une exemption Club
valide ». La couverture Équipe utilise des fonctions distinctes. Ne jamais considérer
qu'un club a une souscription active parce qu'une de ses équipes a une
`team_subscription` — sous peine de débloquer la création de tournois, les
fonctionnalités centrales, les groupes transverses et les statistiques consolidées.

**Anti double facturation, dans les deux sens.** Quand une offre Club devient active :
bloquer tout nouvel achat Équipe pour ses équipes ; identifier les `team_subscriptions`
vivantes et appliquer la stratégie Stripe retenue ; garantir la continuité de couverture ;
opération idempotente. Quand une offre Club est résiliée : **aucune souscription Équipe
n'est recréée automatiquement** — consentement et checkout explicites.

Le front-end ne décide jamais seul d'un droit payant.

## 14. Essai gratuit

- `trial_duration_days` configurable. Décisions ouvertes en §21.
- L'essai Équipe est créé par le parcours de souscription côté serveur — pas par le
  trigger sur `clubs` (qui ne s'applique pas aux clubs `per_team`).
- Anti-abus côté serveur : un seul essai Équipe par utilisateur (§11.1) ; validation
  manuelle en cas de comportement suspect.
- Fin d'essai : bascule Découverte **si et seulement si** les quotas le permettent (§11.2),
  sinon état C. Jamais de suppression automatique de données.
- Réutiliser le mécanisme de rappels d'essai existant.

## 15. Lecture seule à portée équipe

Le verrouillage actuel est club entier (`src/routes/_authenticated.tsx`). Ajouter une
couche à portée **équipe**, active pour les clubs `per_team`, implémentant les états
A/B/C/D (§7) : garde dans le layout d'équipe, application serveur via
`team_has_paid_access` et les entitlements dans les server functions de mutation, RLS en
défense en profondeur sur les chemins critiques.

Point d'attention : les mutations « réponse » (convocation, disponibilité, sondage,
besoin) et l'acceptation d'invitation doivent rester autorisées en état C — elles ne
passent donc pas par la même garde que les mutations de gestion.

## 16. Responsable de facturation

**Une `team_subscription` possède exactement un `billing_owner_user_id` actif à tout
instant.**

Le responsable paie, accède au portail Stripe, change la périodicité, annule, réactive.
Il ne reçoit **aucun droit sportif ou administratif supplémentaire** ; être coach ne donne
pas accès à la facturation. Permission dédiée `can_manage_team_billing`.

Transfert — transactionnel et sécurisé : vérifier l'éligibilité du nouveau responsable ;
mettre à jour côté Clubero **sans recréer la souscription Stripe** ; journaliser ;
notifier l'ancien et le nouveau responsable ; empêcher le départ du payeur tant que le
transfert ou l'annulation n'est pas terminé.

Le départ d'un coach non-payeur n'a aucun impact. Ne jamais exposer aux autres coaches :
derniers chiffres du moyen de paiement, factures, adresse de facturation, identifiants
Stripe.

## 17. Passage à l'offre Club — Cas A : même club

Si le club a été créé lors de l'onboarding Équipe, le passage à l'offre Club **ne
nécessite ni nouvel espace, ni conversion, ni déplacement d'équipes, ni changement de
`club_id`** :

```text
Avant : Club USAG (per_team) ├── U13 team_subscription ├── U15 team_subscription
Après : Club USAG (club) — subscription Club active ├── U13 couverte ├── U15 couverte
```

Déroulé : checkout Club existant → à confirmation par webhook, arrêt idempotent des
`team_subscriptions` selon la règle retenue → couverture continue garantie → affichage
des dates de fin, montant facturé, crédit/prorata éventuel, début de couverture Club.
Stripe est la source de vérité ; pas de calcul maison de proratas ; ne jamais promettre
un remboursement avant le résultat Stripe.

## 18. Transfert d'une équipe vers un autre club — Cas B

Concerne uniquement une équipe créée dans un autre espace rejoignant un club existant.
Exige : invitation explicite du club ; acceptation explicite d'un coach/responsable
autorisé de l'équipe ; affichage des conséquences (historique, joueurs, parents,
événements, convocations, documents conservés ; les autres coaches restent membres) ;
changement de `club_id` avec contrôle RLS ; idempotence du traitement financier.

**Conflit d'équipe équivalente dans le club cible (deux « U13 ») — V1 : pas de fusion.**
Détecter le conflit, **bloquer** le transfert, demander à un administrateur de renommer,
archiver ou traiter manuellement l'une des équipes. Ne jamais fusionner automatiquement
joueurs, événements, membres et documents.

**La fusion de clubs entiers est hors V1** (§10).

## 19. Sécurité, RLS et rétrocompatibilité

RLS strictes sur les nouvelles tables (helpers SECURITY DEFINER) ; REVOKE au niveau
colonne sur les identifiants Stripe. Être payeur ne donne pas accès aux données
personnelles/médicales des joueurs, aux autres équipes, ni à l'administration du club.

**Matrice de tests RLS obligatoire** — 13 profils : anonyme ; authentifié sans lien ;
joueur ; parent ; coach de l'équipe ; assistant coach ; dirigeant du club ; admin du
club ; coach d'une autre équipe du même club ; membre d'un autre club ; responsable de
facturation ; ancien responsable après transfert ; superadmin.

Tests critiques :

```text
Un billing owner peut consulter et gérer la facturation autorisée.
Un coach non-payeur ne voit aucune donnée financière sensible.
Un billing owner sans rôle sportif ne gagne aucun accès aux données des joueurs.
Un membre d'un autre club ne voit aucune team_subscription.
Les identifiants Stripe ne sont jamais lisibles directement côté client.
Une offre Équipe ne permet jamais la création d'un tournoi.
La recherche publique de club n'expose aucun membre, email, rôle ni donnée de facturation.
```

Pour chaque policy : un test autorisé, un refusé, un cross-club, un après changement de
rôle/responsable.

**Migrations rétrocompatibles :** ne pas modifier la contrainte UNIQUE sur
`subscriptions.club_id` ; ne pas changer la signification de
`club_has_active_subscription` (hors correctif `exempt_until` encadré par le Lot 0 bis) ;
ne pas casser les webhooks Club ; ne pas modifier les parcours tournoi hors ajustement
ciblé ; ne pas rendre nullable `teams.club_id` ; ne pas renommer ni supprimer de colonnes
sans migration progressive ; prévoir un rollback par lot critique.

## 20. Webhooks, notifications, i18n, tracking

**Webhooks.** Étendre le handler existant — ne pas en créer un second. Branche
`metadata.purpose = "team_plan"` + `metadata.team_id` posées sur la souscription.
Idempotence par `stripe_webhook_events`. Événements :
`checkout.session.completed`,
`customer.subscription.created/updated/deleted/trial_will_end/paused/resumed`,
`invoice.payment_succeeded`, `invoice.payment_failed`.

**Notifications** (infra existante) : début et fin d'essai, **refus de bascule Découverte
pour quota atteint**, activation, équipe supplémentaire, paiement réussi/échoué, moyen de
paiement à mettre à jour, annulation programmée/effective, passage en lecture seule,
transfert de responsabilité (ancien ET nouveau), invitation d'un coach, transfert
d'équipe, fin de la facturation Équipe après passage Club. Les notifications financières
vont prioritairement au responsable de facturation.

**i18n.** Toutes les chaînes dans les 7 locales, `bun run check:i18n` vert. Mettre à jour
`src/routes/pricing.tsx` et le marketing avec la grille Découverte / Équipe / Club
(`src/locales/fr/marketing.json` mentionne des offres inexistantes en code).

**Tracking** (sans données sensibles) :

```text
team_plan_checkout_started        additional_team_created
team_plan_activated               team_subscription_cancelled
team_plan_trial_started           team_billing_owner_changed
team_plan_trial_expired           team_transferred_to_other_club
discovery_switch_granted          club_plan_upgraded_from_team_plan
discovery_switch_refused_quota    team_feature_blocked
discovery_player_limit_reached    tournament_upsell_viewed
club_search_performed             club_attach_requested
```

## 21. Décisions à valider avant implémentation

1. Durée de l'essai Équipe : 14 jours (aligné Club) ou 30 jours ?
2. Périmètre de l'offre Découverte : dans ce chantier ou chantier séparé ?
3. Valeur de la limite Découverte (recommandation : 15 joueurs actifs).
4. Porteur du quota Découverte : `teams.created_by` à créer, ou
   `discovery_owner_user_id` sur la ligne de couverture (recommandé) ?
5. Libération d'un quota Découverte : bascule rétroactive automatique (non recommandé)
   ou demande explicite ?
6. Règle d'arrêt des souscriptions Équipe au passage Club : fin de période ou prorata ?
7. Exemption de facturation étendue aux souscriptions Équipe ?
8. Séquencement du correctif `exempt_until` : avant le Lot 1 (recommandé) ou en parallèle ?
9. Lancement derrière un feature flag ?
10. Seuil et forme de l'upsell Club ; modèle commercial de l'upsell Tournoi.
11. Import CSV : lot atomique strict (recommandé) ou option « importer ce qui rentre » ?

## 22. Critères d'acceptation

1. L'onboarding Équipe crée un vrai club visible + une équipe ; aucune équipe isolée ni
   club invisible du point de vue de l'utilisateur.
2. Coaches et staff illimités ; les coaches invités ne paient rien individuellement.
3. Une souscription Équipe couvre exactement une équipe ; un utilisateur peut payer
   plusieurs équipes avec des périodicités différentes depuis le même compte.
4. **L'offre Équipe n'a aucune limite de joueurs** ; la limite appartient à Découverte.
5. **La limite de joueurs résiste à la concurrence** : deux insertions simultanées sur
   une équipe à 14 joueurs (quota 15) ne produisent jamais 16 joueurs actifs.
6. **Un import CSV dépassant le quota est refusé avant insertion**, sans insertion
   partielle.
7. **La bascule Découverte en fin d'essai n'a lieu que si les deux quotas sont
   respectés** (moins de 2 équipes Découverte actives dans le club ET aucune équipe
   Découverte active pour le bénéficiaire) ; sinon lecture seule, données conservées,
   upsell affiché. Aucun grandfathering.
8. **La friction multi-équipes est annoncée avant la fin du wizard**, avec un message
   distinguant quota utilisateur et quota club.
9. **Les réponses aux objets existants et l'acceptation d'invitation restent autorisées
   en état C**, alors que la création et la gestion sont bloquées.
10. Permissions sportives et de facturation strictement séparées, évaluées par club et
    par équipe pour les utilisateurs multi-clubs.
11. Chaque `team_subscription` a exactement un billing owner actif ; transfert
    transactionnel, journalisé, notifié, sans recréation Stripe ; départ du payeur
    impossible sans transfert ou annulation ; départ d'un non-payeur sans impact.
12. `club_has_active_subscription` conserve sa sémantique exclusive ; la couverture
    Équipe ne l'influence jamais.
13. L'offre Équipe ne permet jamais de créer ni d'administrer un tournoi ; la
    participation à un tournoi tiers reste possible.
14. Le club sous offre Équipe peut gérer son identité sans accéder aux fonctionnalités
    centrales Club.
15. Le passage à l'offre Club sur le même club ne change aucun `club_id`, ne déplace
    aucune donnée, arrête les souscriptions Équipe de façon idempotente et sans trou de
    couverture ; aucune double facturation.
16. À la résiliation d'une offre Club, aucune souscription Équipe n'est recréée sans
    consentement et checkout explicites.
17. Le transfert d'équipe vers un autre club exige invitation + acceptation autorisée ;
    les conflits d'équipes bloquent le transfert. **Aucune fusion de clubs en V1.**
18. **La recherche publique de club est fail-closed, plafonnée en résultats, avec
    longueur minimale, et n'expose que les données publiques listées au §10.**
19. **Le correctif `exempt_until` n'est déployé qu'après l'inventaire et les décisions de
    régularisation du Lot 0 bis.**
20. Les droits sont servis par l'API centrale ; aucun contrôle uniquement front-end ne
    protège une fonctionnalité payante critique.
21. Les webhooks Stripe sont la source de vérité et idempotents.
22. Les données sont conservées après expiration ou annulation ; lecture seule à portée
    équipe, pas club entier.
23. L'offre Club existante fonctionne sans régression ; la matrice RLS du §19 passe.
24. Aucune information Stripe sensible n'est exposée côté client.
25. `bun run check:i18n`, `bun run check:guards` et `bun run test:rls` passent.

## 23. Étape d'architecture obligatoire avant le code

Avant toute implémentation, produire un plan basé sur une **nouvelle vérification du
dépôt** : schéma SQL ; migrations ; policies RLS et fonctions SECURITY DEFINER ; server
functions ; événements Stripe et branche webhook ; écrans et routes ; stratégie de
lecture seule à portée équipe ; impacts onboarding, offre Club, module Tournoi ;
stratégie i18n ; tests unitaires, intégration, concurrence et RLS ; risques de
régression ; déploiement et rollback.

Aucun refactor transversal ni modification de production avant validation.

## 24. Découpage en lots

- **Lot 0 — Architecture et validation** : audit final, modèle de données, flux de
  couverture, Stripe, RLS, UI, migrations. Aucun code fonctionnel.
- **Lot 0 bis — Investigations bloquantes** : quotas Découverte et éligibilité en fin
  d'essai ; stratégie atomique de la limite de joueurs ; audit `exempt_until` et
  décisions de régularisation. Aucun code fonctionnel.
- **Lot 1 — Modèle de couverture** : `clubs.billing_mode`, `team_subscriptions`,
  couverture par équipe, helpers d'accès, états A/B/C/D, RLS + REVOKE, distinction
  stricte Club/Équipe, ajustement du trigger d'essai, tests de régression tournois.
- **Lot 2 — Onboarding club + première équipe** : recherche de club sécurisée, création
  d'un vrai club, première équipe, annonce des quotas, choix mensuel/annuel, essai ou
  checkout, activation, invitation du staff.
- **Lot 3 — Stripe et facturation** : branche webhook `team_plan`, portail, changement de
  périodicité, paiement échoué, grâce, annulation, réactivation, notifications.
- **Lot 4 — Équipes supplémentaires** : plusieurs équipes dans le même club, périodicités
  mixtes, écran de synthèse, facturation indépendante, upsell Club.
- **Lot 5 — Permissions et restrictions** : entitlements A/B/C/D appliqués, quotas
  Découverte et limite de joueurs atomique, fonctionnalités Club bloquées, tournois,
  lecture seule à portée équipe, i18n, tracking.
- **Lot 6 — Responsable de facturation** : transfert transactionnel, départ du payeur,
  confidentialité, multi-clubs, tests RLS spécifiques.
- **Lot 7 — Passage du même club vers l'offre Club** : activation sur le club existant,
  arrêt idempotent des souscriptions Équipe, absence de changement de `club_id`,
  continuité de couverture, contrôles Stripe.
- **Lot 8 — Rattachement d'une équipe à un autre club** (périmètre réduit) : demande de
  rattachement, validation, détection et **blocage** des conflits d'équipes, changement
  de `club_id`, impact RLS, conservation des données. **Aucune fusion de clubs ni de
  données ; le rapprochement de clubs est un chantier ultérieur indépendant.**
