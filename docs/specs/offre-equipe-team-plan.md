# Prompt — Offre Clubero Équipe à 9,99 € par équipe (v3, vérifié contre le code)

> Version révisée après audit du dépôt (2026-07-25) et corrections produit :
> le club existe toujours (pas de « club personnel invisible » comme modèle produit),
> pas de migration de club lors du passage à l'offre Club, joueurs illimités dans
> l'offre Équipe (la limite de joueurs appartient à l'offre Découverte), entitlements V1
> simples, exigences RLS et rétrocompatibilité renforcées.
> Les sections « Contexte technique vérifié » et « Pièges connus » contiennent des faits
> constatés dans le code : ne pas les réinventer, les re-vérifier rapidement avant de coder.

## Objectif et positionnement commercial

Mettre en place une offre « Équipe » facturée par équipe, entre l'offre Découverte
(gratuite) et l'offre Club existante :

```text
Offre Découverte (gratuite)
- une équipe ;
- nombre de joueurs limité (configurable, recommandation : 15) ;
- fonctionnalités éventuellement limitées ;
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

Un utilisateur doit pouvoir :

- créer son club (structure réelle et visible) et sa première équipe ;
- inviter un staff illimité sans surcoût ;
- créer d'autres équipes dans le même club, chacune avec sa propre souscription
  (périodicités mixtes possibles) ;
- gérer toutes ses équipes depuis le même compte ;
- passer plus tard à l'offre Club **sur le même club, sans aucune migration de données**.

---

## 0. Contexte technique vérifié (état des lieux du dépôt)

**Stack.** TanStack Start (React 19 + Vite), déployé sur Cloudflare Workers
(`wrangler.jsonc`, `src/server.ts`). **Il n'y a pas de Supabase Edge Functions** : la
logique serveur vit dans les server functions TanStack (`src/lib/*.functions.ts`,
`src/modules/*/*.functions.ts`) et les routes API (`src/routes/api/**`,
`src/routes/webhooks/**`). Gestionnaire de paquets : Bun. Schéma de référence :
`src/integrations/supabase/types.ts`.

**Modèle de données.**

- Hiérarchie stricte `clubs → teams` ; `teams.club_id` est **NOT NULL** (et doit le
  rester). Il existe un mécanisme technique `clubs.is_personal` + RPC
  `get_or_create_personal_club` / `convert_personal_club_to_real`, utilisé par le
  parcours organisateur de tournoi. **Ce mécanisme ne définit pas le modèle produit de
  l'offre Équipe** (voir §1) ; il peut au mieux servir de détail d'implémentation
  temporaire, mais la cible est un vrai club visible.
- Rôles : enum `app_role` = `admin | coach | parent | player | dirigeant | financial_admin`.
  `club_members.roles text[]` porte les rôles fins (`assistant_coach`, `staff`,
  `tournament_manager`…) ; `team_members.role` est un enum simple. **Ne pas inventer de
  nouveaux rôles** : réutiliser ces valeurs, l'affichage fin est une affaire d'étiquettes.

**Facturation existante (à réutiliser, pas à dupliquer).**

- Table `subscriptions` **à raison d'une par club** (contrainte UNIQUE sur `club_id`),
  enums `subscription_plan = monthly | yearly` et `subscription_status`
  (`trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid | paused`),
  champs d'exemption (`exempt_from_billing`, `exempt_until`…).
- Server functions complètes dans `src/lib/billing.functions.ts` (checkout, portail,
  annulation, réactivation, mise à jour de carte), toutes verrouillées sur « club admin ».
- Webhook Stripe signé et idempotent : `src/lib/stripe-webhook-handler.server.ts`,
  monté sur `src/routes/webhooks/stripe.ts`, avec table **`stripe_webhook_events`**
  (idempotence par `event_id`) — elle existe déjà, ne pas la recréer. Le handler branche
  sur `metadata.purpose` pour les paiements non-club (`tournament_single`,
  `tournament_annual`, `tournament_pass`, `payment_obligation`).
- Prix Stripe dans `src/lib/stripe.server.ts` via variables d'environnement avec valeurs
  par défaut. Suivre le même motif pour les nouveaux prix.
- **Piège vérifié — trigger d'essai.** `auto_create_trial_subscription` (AFTER INSERT ON
  `clubs`) crée un essai **Club** de 14 jours pour tout club non-personnel. Sans
  précaution, un club créé via l'onboarding Équipe recevrait un essai Club complet, ce qui
  débloquerait les fonctionnalités Club **et la création de tournois** pendant 14 jours.
  Le trigger doit être ajusté pour les clubs en facturation « par équipe » (voir §3).
- Verrouillage : garde dans `src/routes/_authenticated.tsx`
  (`ClubSubscriptionExpiredScreen`, `LockedClubShell`, listes `CLUB_LOCKED_ALLOWED` et
  `TOURNAMENT_ONLY_ALLOWED`) — actuellement à portée **club entier**. Accès payant :
  `src/lib/has-paid-access.ts` (+ `.server.ts`) et RPC SECURITY DEFINER
  `club_has_active_subscription(_club_id)`.
- Précédent structurel pour une facturation non-club : `tournament_entitlements`
  (portée organisateur, plan/statut/validité, même webhook). C'est le gabarit à suivre
  pour `team_subscriptions`.

**Tournois.** Module complet dans `src/modules/tournaments/`. La création est restreinte
par la fonction SQL `can_create_tournament(_user_id)` : superadmin, OU entitlement tournoi
actif, OU admin/dirigeant d'un club dont `club_has_active_subscription()` est vrai.

**Entitlements.** Aucun système centralisé d'entitlements ni de quotas n'existe : pas de
`max_players`, pas de comptage de sièges. Mécanismes existants : `has-paid-access`,
`club_has_active_subscription`, entitlements tournois, feature flags V2
(`src/config/features.ts` + table `app_flags`).

**i18n.** 7 locales (`fr, en, de, es, it, nl, pt`), parité des clés vérifiée en CI
(`bun run check:i18n`). Tout texte UI passe par i18n dans toutes les locales — les
libellés français cités ici sont la version `fr` des clés à créer.

**Sécurité.** RLS par fonctions helpers SECURITY DEFINER (`is_team_staff`,
`user_is_in_team`, `has_club_role`, `is_club_member`…). Sur `subscriptions`, les colonnes
Stripe sont protégées par des **REVOKE au niveau colonne**. Tests RLS : `tests/rls/`,
`bun run test:rls`. Linter de gardes serveur : `bun run check:guards`.

---

## 1. Modèle produit : l'utilisateur crée toujours un club

Même en offre Équipe, l'utilisateur crée fonctionnellement un **vrai club** (ou une vraie
structure), visible dans l'interface, puis une ou plusieurs équipes à l'intérieur :

```text
USAG Uckange
├── U13 — offre Équipe mensuelle
└── U15 — offre Équipe annuelle
```

Jamais, du point de vue de l'utilisateur, de « compte personnel → équipe isolée ».

L'offre Équipe ne signifie pas que le club n'existe pas. Elle signifie uniquement que :

- la facturation s'effectue équipe par équipe ;
- seules les équipes disposant d'une souscription active sont couvertes ;
- les fonctionnalités centrales réservées à l'offre Club restent bloquées.

Le club créé porte un **indicateur de couverture commerciale** (voir §3) qui le distingue
d'un club sous offre Club, **sans modifier artificiellement son statut d'abonnement Club**.
`clubs.is_personal` ne doit pas être utilisé comme modèle produit ; s'il sert de détail
technique transitoire, cela doit rester invisible et temporaire.

## 2. Séparation des concepts

```text
Club              = organisation et identité
Équipe            = unité sportive
Team subscription = unité de facturation Équipe (couvre UNE équipe)
Club subscription = couverture globale du club (table subscriptions existante)
Billing owner     = personne responsable du paiement d'une team subscription
```

Un club peut exister sans abonnement Club tout en ayant plusieurs équipes couvertes
individuellement, et des équipes non couvertes en lecture seule :

```text
FC Exemple
├── U11 — abonnement Équipe mensuel
├── U13 — abonnement Équipe annuel
└── Seniors — sans abonnement, lecture seule
```

Le prix ne dépend jamais du nombre de coaches, de comptes ou de membres du staff.

## 3. Modèle technique

- Ajouter un indicateur sur `clubs`, par exemple :

```text
clubs.billing_mode = 'club' (défaut) | 'per_team'
```

  - `'club'` : comportement actuel inchangé (essai Club auto, offre Club, verrouillage
    club entier) — **valeur par défaut pour tous les clubs existants, zéro régression** ;
  - `'per_team'` : pas d'essai Club automatique (ajuster le trigger
    `auto_create_trial_subscription`), couverture évaluée équipe par équipe,
    fonctionnalités Club bloquées.
- Créer la table `team_subscriptions` (une ligne par équipe couverte), sur le modèle de
  `tournament_entitlements` :

```text
team_subscriptions
- id
- team_id            (une seule souscription non résiliée par équipe)
- club_id            (dénormalisé pour RLS et requêtes)
- billing_owner_user_id   (exactement UN responsable actif à tout instant)
- stripe_customer_id
- stripe_subscription_id
- stripe_price_id
- plan_code          (team_monthly | team_yearly)
- status             (réutiliser l'enum subscription_status existant)
- trial_start / trial_end
- current_period_start / current_period_end
- cancel_at_period_end / canceled_at
- created_at / updated_at
```

- **Ne pas toucher** à la table `subscriptions`, à sa contrainte UNIQUE sur `club_id`,
  ni à la sémantique de `club_has_active_subscription` (voir §6).
- Architecture Stripe : **une souscription Stripe distincte par équipe** (plus simple à
  annuler équipe par équipe, à arrêter lors du passage à l'offre Club, à réconcilier via
  webhooks). Réutiliser le `stripe_customer_id` du payeur entre ses équipes. Identifier
  les événements via `metadata.purpose = "team_plan"` + `metadata.team_id` (métadonnées
  posées sur la souscription Stripe elle-même, pas seulement sur la session de checkout).
- Nouveaux prix dans `src/lib/stripe.server.ts` : `STRIPE_PRICE_TEAM_MONTHLY` (9,99 €)
  et `STRIPE_PRICE_TEAM_YEARLY` (99,99 €), surchargeables par variables d'environnement.

## 4. Onboarding Équipe

L'onboarding actuel (`NoMembershipScreen` dans `src/routes/_authenticated.tsx`) propose
« créer un club » ou « rejoindre via invitation ». Ajouter le choix :

> « Je souhaite gérer une ou plusieurs équipes » / « Je représente un club »

Parcours Équipe — l'utilisateur crée un vrai club puis sa première équipe :

1. création du compte ;
2. **nom du club ou de la structure** (obligatoire), logo (optionnel), sport principal ;
3. nom et catégorie de la première équipe ;
4. choix mensuel / annuel ;
5. essai gratuit ou souscription (checkout Stripe) ;
6. accès à l'équipe ;
7. invitation immédiate du staff.

Le club créé est visible et gérable a minima (voir §8), avec `billing_mode = 'per_team'`.

## 5. Équipes supplémentaires

Depuis son espace, bouton « Ajouter une équipe » : nom + infos, catégorie et sport,
présentation du tarif, choix mensuel/annuel, checkout Stripe, activation — la nouvelle
équipe est créée **dans le même club**.

- Afficher : « Chaque équipe supplémentaire est facturée 9,99 €/mois ou 99,99 €/an. »
- Ne pas forcer le passage à l'offre Club à la deuxième équipe ; périodicités mixtes
  possibles (U11 mensuel, U13 annuel…).
- Upsell offre Club informatif (sans blocage) à partir d'un seuil, par exemple quand
  5 équipes × 9,99 € approchent les 49 €/mois de l'offre Club.
- Note : la condition `teams.length < 3` dans `src/routes/_authenticated/teams.tsx` est
  cosmétique (affichage d'un CTA), pas un quota.

## 6. Couverture, précédence et stricte séparation Club / Équipe

Fonctions serveur centrales :

```text
get_team_coverage(team_id)            → club_plan | team_plan | team_trial | grace | expired | none
get_team_entitlements(user_id, team_id) → entitlements effectifs
team_has_paid_access(team_id)         → booléen (couverture Équipe OU Club)
```

Règles de précédence :

1. souscription Club active (ou exemption Club) sur le club → couverture Club ;
2. sinon `team_subscription` active ou en essai → couverture Équipe ;
3. sinon → grâce, expiré, ou aucune couverture (lecture seule à portée équipe).

**Règle stricte — ne jamais mélanger les deux couvertures :**

```text
club_has_active_subscription(club_id)
```

doit continuer à signifier **exclusivement** « le club possède une vraie offre Club active
ou une exemption Club valide ». La couverture Équipe utilise des fonctions distinctes.
Ne jamais considérer qu'un club a une souscription active parce qu'une de ses équipes a
une `team_subscription` — sous peine de débloquer accidentellement la création de
tournois, les fonctionnalités centrales du club, les groupes transverses et les
statistiques consolidées.

**Anti double facturation (les deux sens) :**

Quand une offre Club devient active pour un club :

- bloquer tout nouvel achat d'abonnement Équipe pour ses équipes ;
- identifier les `team_subscriptions` encore actives et appliquer la stratégie Stripe
  retenue (résiliation fin de période ou prorata — décision §24) ;
- garantir que chaque équipe reste couverte pendant la transition (jamais de trou de
  couverture) ;
- rendre l'opération idempotente.

Quand une offre Club est résiliée :

- les équipes peuvent éventuellement repasser en offre Équipe ;
- **aucune souscription Équipe n'est recréée automatiquement** : consentement et checkout
  explicites obligatoires.

Le front-end ne décide jamais seul d'un droit payant : contrôles côté serveur et, pour
les chemins critiques, RLS / RPC SECURITY DEFINER.

## 7. Entitlements — V1 simple et extensible

Centraliser les droits pour éviter les `if plan === "team"` dispersés dans le front,
**sans construire dès la V1 un moteur de plans générique** pour tous les futurs produits.
API centrale simple, retournant un objet typé :

```ts
{
  coverage: "club_plan" | "team_plan" | "team_trial" | "grace" | "expired" | "none",
  canManageTeam: boolean,
  canInviteTeamStaff: boolean,
  canManagePlayers: boolean,
  canCreateEvents: boolean,
  canUseTeamWall: boolean,
  canUseClubFeatures: boolean,
  canManageClubIdentity: boolean,   // §8 — distinct de canUseClubFeatures
  canCreateTournament: boolean,
  maxPlayers: number | null         // null = illimité
}
```

**Limite de joueurs — portée par l'offre Découverte, PAS par l'offre Équipe :**

```text
Offre Découverte : max_players configurable, recommandé à 15 (valeur à valider — §24)
Offre Équipe     : max_players = null (illimité)
Offre Club       : max_players = null (illimité)
```

Règles de la limite (quand elle s'applique) :

- contrôle **côté serveur**, jamais uniquement dans l'interface, jamais codé en dur dans
  les écrans ; désactivable avec `null` ;
- compter uniquement les **joueurs actifs** de l'équipe ; ne pas compter les joueurs
  archivés ou supprimés ; définir le comportement des joueurs temporairement inactifs ;
- empêcher le contournement archiver/restaurer en boucle ;
- appliquer la même règle à la création manuelle, à l'import CSV et aux transferts entre
  équipes ;
- les invitations de parents ne comptent jamais comme des joueurs ;
- coaches et staff restent illimités, y compris en Découverte (sauf décision commerciale
  contraire) ;
- à la limite atteinte : conserver tous les joueurs présents, bloquer ajout et import,
  ne pas bloquer la consultation ni le fonctionnement, afficher un message commercial —
  « Vous avez atteint la limite de 15 joueurs de l'offre Découverte. Passez à l'offre
  Équipe pour ajouter un nombre illimité de joueurs… » — avec les boutons
  « Passer à l'offre Équipe — 9,99 €/mois » et « Découvrir l'offre Club ».

Fonctionnalités incluses dans l'offre Équipe : gestion d'équipe, joueurs (illimités),
parents/responsables légaux, staff (illimité), événements, entraînements, matchs,
convocations et réponses, présences, compositions, disponibilités joueurs et staff,
besoins liés aux événements, communication et mur d'équipe, mur staff, sondages,
notifications, emails transactionnels, documents, calendrier, statistiques
individuelles/équipe déjà disponibles, import de joueurs, invitations
parents/joueurs/coaches.

Exclusions (offre Club ou modules séparés) : mur général du club, tableau de bord et
statistiques consolidées, groupes transverses, communication club entière, gestion
centralisée de tous les membres et rôles, réunions Club, documents communs au club,
gestion financière globale, CRM, sponsoring, modules premium futurs, IA réservée à
d'autres offres, gestion de ligue/championnat, création et gestion de tournois.

## 8. Droits du club sous offre Équipe

Un club en `billing_mode = 'per_team'` doit pouvoir gérer le minimum nécessaire à son
identité et à ses équipes, sans débloquer l'administration Club complète. **Éviter un
`can_manage_club = false` trop large** qui empêcherait de modifier le nom ou le logo.

Autorisé (`canManageClubIdentity`) :

- nom du club, logo, sport ;
- informations publiques minimales ;
- liste des équipes couvertes ;
- accès à la page de facturation des équipes selon les permissions.

Bloqué (`canUseClubFeatures`) :

- mur général du club, statistiques consolidées, groupes transverses, communication
  globale, réunions Club, gestion centralisée de tous les membres, fonctionnalités
  financières globales, création de tournois via l'abonnement Club.

## 9. Tournois

- L'offre Équipe ne permet ni création, ni administration, ni inscriptions, ni génération
  de groupes, ni gestion de matchs, ni classement d'un tournoi.
- Une équipe inscrite ou invitée à un tournoi tiers peut consulter et utiliser les
  fonctions qui la concernent (participation autorisée).
- `can_create_tournament` continue de s'appuyer sur `club_has_active_subscription`, dont
  la sémantique ne change pas (§6) ; avec le trigger d'essai ajusté pour les clubs
  `per_team` (§3), aucun déblocage accidentel — à verrouiller par des tests de
  régression explicites.
- À la tentative de création : écran explicatif (pas d'erreur technique ni de page vide),
  avec bouton d'upsell adapté (« Découvrir l'offre Tournoi » / « Activer le module
  Tournoi » / « Contacter Clubero ») — les offres tournoi payantes existent déjà
  (`tournament_entitlements`, pass). Tracker `tournament_upsell_viewed`.

## 10. Essai gratuit

- `trial_duration_days` configurable. **Décisions à valider (§24) :** durée de l'essai
  Équipe (l'essai Club actuel est de 14 jours, le souhait initial était 30) et
  articulation entre l'essai Équipe et l'offre Découverte gratuite (à la fin de l'essai :
  lecture seule, ou bascule vers les limites Découverte ?).
- L'essai Équipe est créé par le parcours de souscription Équipe côté serveur — pas par
  le trigger sur `clubs` (qui ne s'applique pas aux clubs `per_team`).
- Anti-abus côté serveur : par exemple un seul essai Équipe par compte et/ou par client
  Stripe ; validation manuelle si comportement suspect. Éviter la création en série
  d'équipes uniquement pour cumuler des essais.
- Fin d'essai sans paiement : conserver toutes les données, passer l'équipe en lecture
  seule (ou en Découverte selon la décision), permettre la consultation, bloquer
  création/modification, afficher un bouton de réactivation. Ne jamais supprimer de
  données automatiquement.
- Réutiliser le mécanisme de rappels d'essai (`trial-reminders`).

## 11. Responsable de facturation

**Règle : une `team_subscription` possède exactement un `billing_owner_user_id` actif à
tout instant.**

Le responsable de facturation : a créé la souscription, paie, accède au portail Stripe,
change la périodicité, annule, réactive. Il ne reçoit **aucun droit sportif ou
administratif supplémentaire** ; réciproquement, être coach ne donne pas accès à la
facturation. Permission dédiée `can_manage_team_billing` (payeur, propriétaire de
l'équipe, admin autorisé, ou après transfert explicite).

Transfert de responsabilité — transactionnel et sécurisé :

- vérifier l'éligibilité du nouveau responsable (membre autorisé de l'équipe/du club) ;
- mettre à jour la responsabilité côté Clubero **sans recréer la souscription Stripe** ;
- journaliser le transfert (audit) ;
- notifier l'ancien et le nouveau responsable ;
- empêcher le départ du payeur tant que le transfert (ou l'annulation) n'est pas terminé :
  « Vous êtes actuellement responsable de la facturation de cette équipe. Transférez
  d'abord la responsabilité à un autre membre autorisé ou annulez l'abonnement. »

Le départ d'un coach non-payeur n'a aucun impact sur la souscription.
Ne jamais exposer aux autres coaches : derniers chiffres du moyen de paiement, factures,
adresse de facturation, identifiants Stripe du payeur.

## 12. Passage à l'offre Club — Cas A : même club, changement de couverture

Si le club a été créé lors de l'onboarding Équipe, le passage à l'offre Club **ne
nécessite ni nouvel espace club, ni conversion, ni déplacement d'équipes, ni changement
de `club_id`**. C'est un simple changement de couverture commerciale :

```text
Avant :
Club USAG (billing_mode = per_team)
├── U13 — team_subscription active
└── U15 — team_subscription active

Après :
Club USAG (billing_mode = club) — subscription Club active
├── U13 — couverte par le Club
└── U15 — couverte par le Club
```

Déroulé : souscription Club sur le club existant (checkout Club actuel) → à confirmation
(webhook), arrêt idempotent des `team_subscriptions` selon la règle commerciale retenue →
couverture continue garantie pendant la transition → affichage clair : date de fin des
abonnements Équipe, montant facturé, crédit/prorata éventuel, date de début de la
couverture Club. Stripe est la source de vérité ; pas de calcul maison de proratas ;
ne jamais promettre un remboursement avant le résultat Stripe.

## 13. Transfert d'une équipe vers un autre club — Cas B uniquement

Le parcours de « rattachement » ne concerne que le cas où une équipe créée dans un autre
espace doit rejoindre un club existant. Il exige :

- une invitation explicite du club : « Le club FC Exemple vous invite à rattacher
  l'équipe U13 à son espace Clubero » ;
- l'acceptation explicite d'un coach/responsable autorisé de l'équipe (personne d'autre
  ne peut transférer une équipe) ;
- l'affichage des conséquences avant validation : historique, joueurs, parents,
  événements, convocations, documents conservés ; les autres coaches restent membres ;
  couverture et facturation futures selon le club cible ;
- le changement de `club_id` avec contrôle RLS et conservation des données ;
- l'idempotence du traitement financier associé.

**Conflit d'équipe équivalente déjà existante dans le club cible (ex. deux « U13 ») —
V1 : pas de fusion automatique.** Comportement : détecter le conflit, bloquer le
transfert, demander à un administrateur de renommer, archiver ou traiter manuellement
l'une des équipes. Ne jamais fusionner automatiquement joueurs, événements, membres et
documents.

## 14. Utilisateurs multi-clubs

Le modèle supporte un même utilisateur présent dans plusieurs organisations :

```text
Utilisateur A
├── Coach U13 dans Club A
├── Coach U15 dans Club B
└── Responsable de facturation d'une équipe dans Club C
```

Les permissions sportives et financières sont évaluées **séparément pour chaque club et
chaque équipe**. Ne jamais déduire des droits de facturation d'un rôle global de coach ou
d'administrateur.

## 15. Paiement échoué et période de grâce

Réutiliser l'enum `subscription_status` existant. Période de grâce configurable : alerte
au responsable de facturation, mise à jour du moyen de paiement (réutiliser
`createUpdatePaymentMethodSession` / update-card-dialog), pas de coupure immédiate si la
règle commerciale le permet. Après la grâce : lecture seule **à portée équipe** (le
verrouillage actuel est club entier — il faut une déclinaison par équipe), données
conservées, membres non retirés, invitations et historique intacts.

## 16. Interface de facturation

Page « Facturation et abonnements » listant chaque équipe et sa couverture :

```text
U13 — Offre Équipe mensuelle — 9,99 €/mois — Active — Prochaine échéance : 15 août 2026
U15 — Offre Équipe annuelle — 99,99 €/an — Active — Prochaine échéance : 4 juillet 2027
U18 — Couverte par l'offre Club — Aucune facturation Équipe
```

Selon les permissions : plan, statut, essai, responsable de facturation, échéance,
périodicité, boutons gérer / changer de responsable / annuler / réactiver, et pour le
Cas B un point d'entrée de rattachement. Plus « Ajouter une équipe — 9,99 €/mois ou
99,99 €/an » et l'upsell Club informatif.

S'inspirer de `src/routes/_authenticated/admin/billing.tsx`, mais avec une autorisation
par `billing_owner` / `can_manage_team_billing` — **pas** par « club admin » (toutes les
fonctions de `billing.functions.ts` sont actuellement verrouillées club-admin : nouveau
chemin d'autorisation requis, pas un contournement).

Prévoir la visibilité superadmin (console `src/routes/superadmin/billing.tsx`) et décider
si l'exemption (`exempt_from_billing`) existe aussi pour les souscriptions Équipe
(recommandé — §24).

## 17. Sécurité et RLS

- RLS strictes sur toutes les nouvelles tables (helpers SECURITY DEFINER), REVOKE au
  niveau colonne sur les identifiants Stripe de `team_subscriptions` (comme sur
  `subscriptions`).
- Être payeur ne donne pas accès aux données personnelles/médicales des joueurs, aux
  autres équipes, ni à l'administration du club.

**Matrice de tests RLS obligatoire** — pour chaque nouvelle table, fonction ou policy,
couvrir au minimum les profils :

anonyme ; authentifié sans lien avec l'équipe ; joueur de l'équipe ; parent d'un joueur ;
coach de l'équipe ; assistant coach ; dirigeant du même club ; administrateur du même
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
```

Pour chaque policy : au moins un test autorisé, un test refusé, un test cross-club, un
test après changement de rôle ou de responsable. Tests dans `tests/rls/`
(`bun run test:rls`) ; `bun run check:guards` sur les nouvelles server functions.

## 18. Migrations rétrocompatibles

Toutes les migrations doivent préserver le fonctionnement actuel de l'offre Club :

- ne pas modifier la contrainte UNIQUE sur `subscriptions.club_id` ;
- ne pas changer la signification de `club_has_active_subscription` ;
- ne pas casser les webhooks Club existants ;
- ne pas modifier les parcours tournoi hors ajustement ciblé des droits ;
- ne pas rendre nullable `teams.club_id` ;
- ne pas renommer ni supprimer de colonnes existantes sans migration progressive ;
- prévoir un rollback ou une stratégie de retour arrière pour chaque lot critique
  (migrations additives, feature flag de lancement).

## 19. Webhooks Stripe

Étendre le handler existant (`stripe-webhook-handler.server.ts`) — ne pas en créer un
second. Branche `metadata.purpose = "team_plan"` + `metadata.team_id` (métadonnées posées
sur la souscription Stripe, pour que `customer.subscription.updated/deleted` les portent).
La table `stripe_webhook_events` existe déjà pour l'idempotence.

Événements : `checkout.session.completed`,
`customer.subscription.created/updated/deleted/trial_will_end/paused/resumed`,
`invoice.payment_succeeded`, `invoice.payment_failed` (noms alignés sur ceux déjà
traités). Pour chaque événement : vérifier la signature, dédupliquer par `event_id`,
journaliser, rattacher précisément à l'équipe via les metadata, mettre à jour
`team_subscriptions`, ne jamais faire confiance aux données client.

## 20. Notifications

Réutiliser l'infrastructure existante (emails transactionnels, push, rappels d'essai,
`subscription-notify.server.ts`) pour : début et fin d'essai, activation, création d'une
équipe supplémentaire, paiement réussi/échoué, moyen de paiement à mettre à jour,
annulation programmée/effective, passage en lecture seule, transfert de responsabilité
(ancien ET nouveau responsable), invitation d'un coach, transfert d'équipe (Cas B),
fin de la facturation Équipe après passage à l'offre Club.

Les notifications financières vont prioritairement au responsable de facturation ; les
autres coaches ne reçoivent que ce qui les concerne fonctionnellement.

## 21. i18n et marketing

- Toutes les chaînes UI en i18n, dans les **7 locales**, `bun run check:i18n` vert.
- Mettre à jour la page pricing (`src/routes/pricing.tsx`) et les textes marketing avec
  la grille à trois offres (Découverte / Équipe / Club). Attention :
  `src/locales/fr/marketing.json` mentionne déjà des offres (« Découverte »,
  « Fédération ») qui n'existent pas en code — aligner la grille affichée sur les offres
  réelles.

## 22. Tracking produit

Événements analytiques sans données sensibles :

```text
team_plan_checkout_started
team_plan_activated
team_plan_trial_started
team_plan_trial_expired
additional_team_created
team_subscription_cancelled
team_billing_owner_changed
team_transferred_to_other_club
club_plan_upgraded_from_team_plan
team_feature_blocked
discovery_player_limit_reached
tournament_upsell_viewed
```

Objectifs : mesurer la création de deuxièmes équipes, le multi-équipes payant, la
conversion vers l'offre Club, les fonctionnalités bloquées les plus demandées, l'impact
de la limite Découverte, les tentatives d'accès au module Tournoi.

## 23. Critères d'acceptation

1. L'onboarding Équipe crée un vrai club visible + une équipe ; aucune équipe isolée ni
   club invisible du point de vue de l'utilisateur.
2. Une équipe peut avoir un nombre illimité de coaches et de membres du staff ; les
   coaches invités ne paient rien individuellement.
3. Une souscription Équipe couvre exactement une équipe ; un utilisateur peut payer
   plusieurs équipes avec des périodicités différentes, gérées depuis le même compte.
4. **L'offre Équipe n'a aucune limite de joueurs** ; la limite configurable appartient à
   l'offre Découverte, contrôlée côté serveur, sur les joueurs actifs uniquement.
5. Permissions sportives et permissions de facturation strictement séparées ; évaluées
   par club et par équipe pour les utilisateurs multi-clubs.
6. Chaque `team_subscription` a exactement un billing owner actif ; le transfert est
   transactionnel, journalisé, notifié, sans recréation de la souscription Stripe ; le
   départ du payeur exige un transfert ou une annulation préalable ; le départ d'un
   non-payeur n'a aucun impact.
7. `club_has_active_subscription` conserve sa sémantique exclusive « offre Club active ou
   exemption Club » ; la couverture Équipe ne l'influence jamais.
8. L'offre Équipe ne permet jamais de créer ni d'administrer un tournoi (y compris via le
   trigger d'essai sur les clubs `per_team`) ; la participation à un tournoi tiers reste
   possible.
9. Le club sous offre Équipe peut gérer son identité (nom, logo, sport) sans accéder aux
   fonctionnalités centrales Club.
10. Le passage à l'offre Club sur le même club ne change aucun `club_id`, ne déplace
    aucune donnée, arrête les souscriptions Équipe de façon idempotente et sans trou de
    couverture ; aucune double facturation Équipe + Club.
11. À la résiliation d'une offre Club, aucune souscription Équipe n'est recréée sans
    consentement et checkout explicites.
12. Le transfert d'équipe vers un autre club (Cas B) exige invitation + acceptation
    autorisée ; les conflits d'équipes équivalentes bloquent le transfert (pas de fusion
    automatique en V1).
13. Les droits sont servis par l'API centrale (`get_team_coverage`,
    `get_team_entitlements`, `team_has_paid_access`) ; aucun contrôle uniquement
    front-end ne protège une fonctionnalité payante critique.
14. Les webhooks Stripe sont la source de vérité et idempotents.
15. Les données sont conservées après expiration ou annulation ; une équipe sans
    couverture passe en lecture seule à portée équipe (pas club entier).
16. La souscription Club existante (table, contrainte UNIQUE, webhook, trigger d'essai
    pour les clubs `billing_mode='club'`) fonctionne sans régression ; les RLS
    existantes ne régressent pas ; la matrice de tests RLS du §17 passe.
17. Aucune information Stripe sensible n'est exposée côté client (REVOKE colonne inclus).
18. `bun run check:i18n`, `bun run check:guards` et `bun run test:rls` passent.

## 24. Décisions à valider avant implémentation

1. Durée de l'essai Équipe : 14 jours (aligné Club) ou 30 jours ?
2. Articulation essai Équipe / offre Découverte : fin d'essai → lecture seule, ou bascule
   vers les limites Découverte ? L'offre Découverte est-elle dans le périmètre de ce
   chantier ou d'un chantier séparé ?
3. Valeur de la limite Découverte (recommandation : 15 joueurs actifs).
4. Règle d'arrêt des souscriptions Équipe au passage à l'offre Club : fin de période ou
   prorata immédiat (`proration_behavior`) ?
5. Exemption de facturation (`exempt_from_billing`) étendue aux souscriptions Équipe ?
6. Lancement derrière un feature flag (`app_flags`) ?
7. Seuil et forme de l'upsell Club (informatif uniquement).
8. Modèle commercial du bouton d'upsell Tournoi.

## 25. Étape d'architecture obligatoire avant le code

Avant toute implémentation, produire un plan basé sur une **nouvelle vérification du
dépôt**, contenant :

1. schéma SQL proposé ;
2. migrations à créer ;
3. policies RLS et fonctions SECURITY DEFINER ;
4. server functions à créer ou modifier ;
5. événements Stripe et branche webhook ;
6. écrans et routes concernés ;
7. stratégie de lecture seule à portée équipe ;
8. impacts sur l'onboarding ;
9. impacts sur l'offre Club existante ;
10. impacts sur le module Tournoi ;
11. stratégie i18n ;
12. tests unitaires, intégration et RLS ;
13. risques de régression ;
14. stratégie de déploiement et rollback.

Aucun refactor transversal ni modification de production avant validation de ce plan.

## 26. Découpage en lots

- **Lot 0 — Architecture et validation** : audit final du dépôt, modèle de données, flux
  de couverture, Stripe, RLS, UI et migrations. Aucun code fonctionnel.
- **Lot 1 — Modèle de couverture** : `clubs.billing_mode`, `team_subscriptions`,
  couverture par équipe, helpers d'accès (`get_team_coverage`, `team_has_paid_access`),
  RLS + REVOKE colonnes Stripe, distinction stricte Club plan / Team plan, ajustement du
  trigger d'essai, tests de régression `can_create_tournament`.
- **Lot 2 — Onboarding club + première équipe** : création d'un vrai club, création de la
  première équipe, choix mensuel/annuel, essai ou checkout, activation, invitation du
  staff.
- **Lot 3 — Stripe et facturation** : branche webhook `team_plan`, portail, changement de
  périodicité, paiement échoué, grâce, annulation, réactivation, notifications.
- **Lot 4 — Équipes supplémentaires** : plusieurs équipes dans le même club, périodicités
  mixtes, écran de synthèse, facturation indépendante, upsell offre Club.
- **Lot 5 — Permissions et restrictions fonctionnelles** : fonctionnalités Équipe,
  fonctionnalités Club bloquées (avec `canManageClubIdentity`), tournois, lecture seule à
  portée équipe, i18n, tracking.
- **Lot 6 — Responsable de facturation** : transfert transactionnel, départ du payeur,
  confidentialité, multi-clubs, tests RLS spécifiques.
- **Lot 7 — Passage du même club vers l'offre Club** : activation de l'offre Club sur le
  club existant, arrêt idempotent des souscriptions Équipe, absence de changement de
  `club_id`, maintien continu de la couverture, contrôles Stripe.
- **Lot 8 — Transfert d'une équipe vers un autre club** : invitation, validation,
  conflits d'équipes (blocage, pas de fusion), changement éventuel de `club_id`, impact
  RLS, conservation des données.
