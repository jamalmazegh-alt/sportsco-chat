# Prompt — Offre Clubero Équipe à 9,99 € par équipe (v2, vérifié contre le code)

> Version révisée du prompt initial, corrigée après audit du dépôt le 2026-07-25.
> Les sections « Contexte technique vérifié » et « Pièges connus » contiennent des faits
> constatés dans le code : ne pas les réinventer, les re-vérifier rapidement avant de coder.

## Objectif

Mettre en place une offre « Équipe » permettant à un coach ou responsable d'utiliser
Clubero pour une ou plusieurs équipes sans souscrire à l'offre Club (49 €/mois actuelle).

Tarifs :

- 9,99 € / mois / équipe
- 99,99 € / an / équipe

Un utilisateur doit pouvoir :

- créer une première équipe sans créer de club visible ;
- inviter un staff illimité (coaches, adjoints, dirigeants…) sans surcoût ;
- créer d'autres équipes, chacune avec sa propre souscription (périodicités mixtes possibles) ;
- gérer toutes ses équipes depuis le même compte ;
- rattacher plus tard ses équipes à un abonnement Club.

L'offre Équipe exclut les fonctionnalités Club (administration centrale, mur du club,
statistiques consolidées, groupes transverses…) et la **création/administration de tournois**.

---

## 0. Contexte technique vérifié (état des lieux du dépôt)

**Stack.** TanStack Start (React 19 + Vite), déployé sur Cloudflare Workers
(`wrangler.jsonc`, `src/server.ts`). **Il n'y a pas de Supabase Edge Functions** : la
logique serveur vit dans les server functions TanStack (`src/lib/*.functions.ts`,
`src/modules/*/*.functions.ts`) et les routes API (`src/routes/api/**`,
`src/routes/webhooks/**`). Gestionnaire de paquets : Bun. Schéma de référence :
`src/integrations/supabase/types.ts`.

**Modèle de données.**

- `teams.club_id` est **NOT NULL** : une équipe ne peut pas exister sans club.
  Le mécanisme existant pour les utilisateurs « sans club » est le **club personnel** :
  `clubs.is_personal` + RPC `get_or_create_personal_club(_user_id)` et
  `convert_personal_club_to_real(_club_id, _new_name)` (déjà utilisés par le parcours
  organisateur de tournoi).
- Rôles : enum `app_role` = `admin | coach | parent | player | dirigeant | financial_admin`.
  `club_members.roles text[]` porte les rôles fins (`assistant_coach`, `staff`,
  `tournament_manager`…) ; `team_members.role` est un enum simple. **Ne pas inventer de
  nouveaux rôles** (« préparateur physique », « responsable d'équipe ») : réutiliser ces
  valeurs, l'affichage fin étant une affaire d'étiquettes.

**Facturation existante (à réutiliser, pas à dupliquer).**

- Table `subscriptions` **à raison d'une par club** (contrainte UNIQUE sur `club_id`),
  enums `subscription_plan = monthly | yearly` et `subscription_status`
  (`trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid | paused`),
  champs d'exemption (`exempt_from_billing`, `exempt_until`…).
- Server functions complètes dans `src/lib/billing.functions.ts` (checkout, portail,
  annulation, réactivation, mise à jour de carte), toutes verrouillées sur « club admin ».
- Webhook Stripe signé et idempotent : `src/lib/stripe-webhook-handler.server.ts`,
  monté sur `src/routes/webhooks/stripe.ts`, avec table **`stripe_webhook_events`**
  (idempotence par `event_id`) — elle existe déjà, ne pas la recréer.
  Le handler branche sur `metadata.purpose` pour les paiements non-club
  (`tournament_single`, `tournament_annual`, `tournament_pass`, `payment_obligation`).
- Prix Stripe définis dans `src/lib/stripe.server.ts` via variables d'environnement avec
  valeurs par défaut (`STRIPE_PRICE_MONTHLY` = 49 €/mois, `STRIPE_PRICE_YEARLY` = 490 €/an,
  prix tournois). Suivre le même motif pour les nouveaux prix.
- Essai : trigger `auto_create_trial_subscription` sur `INSERT clubs`
  (**14 jours actuellement**, et il **ignore les clubs personnels**).
  Rappels d'essai par email : `src/routes/api/public/hooks/trial-reminders.ts`.
- Verrouillage : garde dans `src/routes/_authenticated.tsx`
  (`ClubSubscriptionExpiredScreen`, `LockedClubShell`, listes `CLUB_LOCKED_ALLOWED` et
  `TOURNAMENT_ONLY_ALLOWED`). Accès payant : `src/lib/has-paid-access.ts` (+ `.server.ts`)
  et RPC SECURITY DEFINER `club_has_active_subscription(_club_id)`.
- Précédent structurel pour une facturation non-club : `tournament_entitlements`
  (portée organisateur, plan/statut/validité, même webhook). C'est le gabarit à suivre
  pour `team_subscriptions`.

**Tournois.** Module complet dans `src/modules/tournaments/`. La création est déjà
restreinte par la fonction SQL `can_create_tournament(_user_id)` : superadmin, OU
entitlement tournoi actif, OU **admin/dirigeant d'un club dont
`club_has_active_subscription()` est vrai**.

**Entitlements.** Il n'existe **aucun système centralisé d'entitlements ni de quotas** :
pas de `max_players`, pas de limite de staff, pas de comptage de sièges. Les seuls
mécanismes sont `has-paid-access`, `club_has_active_subscription`, les entitlements
tournois, et les feature flags V2 (`src/config/features.ts` + table `app_flags`).
La limite `max_players = 50` du présent cahier des charges est donc **à créer**, pas à
conserver.

**i18n.** Application multilingue : 7 locales (`fr, en, de, es, it, nl, pt`), parité des
clés vérifiée en CI (`bun run check:i18n`). **Tout texte UI de cette offre doit passer par
i18n dans toutes les locales** — aucun libellé en dur (les libellés français cités dans ce
document sont la version `fr` des clés à créer).

**Sécurité.** RLS par fonctions helpers SECURITY DEFINER (`is_team_staff`,
`user_is_in_team`, `has_club_role`, `is_club_member`…). Sur `subscriptions`, les colonnes
Stripe (`stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`) sont protégées
par des **REVOKE au niveau colonne** — appliquer la même protection aux nouvelles tables.
Tests RLS : `tests/rls/`, `bun run test:rls`. Linter de gardes serveur :
`bun run check:guards`.

---

## 1. Principe fondamental

L'abonnement Équipe couvre **une équipe précise** — pas un coach, pas un compte.
Une équipe payante = une unité de facturation.

Exemple : U13 (9,99 €/mois) + U15 (9,99 €/mois) + Seniors (9,99 €/mois)
= 3 équipes actives = 29,97 €/mois, quel que soit le nombre de coaches.

La facturation ne dépend jamais du nombre de coaches, de comptes ou de membres du staff.

## 2. Modèle retenu : club personnel + souscriptions par équipe

Pour rester compatible avec `teams.club_id NOT NULL` et l'ensemble des RLS existantes :

- La création d'une équipe « sans club » passe par le **club personnel**
  (`get_or_create_personal_club`), invisible pour l'utilisateur. Ne pas rendre
  `teams.club_id` nullable (rayon d'impact RLS trop large).
- Créer une nouvelle table `team_subscriptions` (une ligne par équipe couverte),
  sur le modèle de `tournament_entitlements` :

```text
team_subscriptions
- id
- team_id (UNIQUE parmi les souscriptions non résiliées)
- billing_owner_user_id
- stripe_customer_id
- stripe_subscription_id
- stripe_price_id
- plan_code            (ex: team_monthly | team_yearly)
- status               (réutiliser l'enum subscription_status existant)
- trial_start / trial_end
- current_period_start / current_period_end
- cancel_at_period_end / canceled_at
- created_at / updated_at
```

- **Ne pas toucher** à la table `subscriptions` ni à sa contrainte UNIQUE sur `club_id` ;
  le `upsert(..., { onConflict: "club_id" })` du webhook en dépend.
- Architecture Stripe : **une souscription Stripe distincte par équipe** (décision prise —
  plus simple à annuler équipe par équipe, à migrer vers l'offre Club, à réconcilier via
  webhooks et à auditer). Réutiliser le `stripe_customer_id` du payeur entre ses équipes.
  Identifier les événements via `metadata.purpose = "team_plan"` + `metadata.team_id`,
  comme le fait déjà le handler pour les tournois.
- Nouveaux prix dans `src/lib/stripe.server.ts` :
  `STRIPE_PRICE_TEAM_MONTHLY` (9,99 €) et `STRIPE_PRICE_TEAM_YEARLY` (99,99 €),
  surchargeables par variables d'environnement comme les prix existants.

## 3. Responsable de facturation

Chaque `team_subscriptions` a un `billing_owner_user_id` : la personne qui a créé la
souscription, paie, accède au portail Stripe, change la périodicité, annule, et peut
**transférer** la responsabilité à un autre membre autorisé sans perte de données ni
recréation de souscription.

La responsabilité de facturation ne confère **aucun droit sportif ou administratif**
supplémentaire ; les permissions Clubero continuent de dépendre des rôles et de
l'appartenance à l'équipe. Réciproquement, être coach ne donne pas accès à la facturation.

Prévoir une permission dédiée `can_manage_team_billing`, accordée au payeur, au
propriétaire de l'équipe, à un admin autorisé, ou après transfert explicite.
Ne jamais exposer aux autres coaches : derniers chiffres du moyen de paiement, factures,
adresse de facturation, identifiants Stripe du payeur.

## 4. Onboarding et première équipe

L'onboarding actuel (`NoMembershipScreen` dans `src/routes/_authenticated.tsx`) ne propose
que « créer un club » ou « rejoindre via invitation ». Ajouter un troisième chemin,
sur le modèle du parcours `tournament_organizer` existant :

> « Je souhaite gérer une ou plusieurs équipes » / « Je représente un club »

Parcours Équipe :

1. création du compte ;
2. informations minimales de l'équipe (nom, sport, catégorie) — le club personnel est créé
   silencieusement ;
3. choix mensuel / annuel ;
4. essai gratuit ou souscription (checkout Stripe) ;
5. accès à l'équipe ;
6. invitation immédiate du staff.

**Piège vérifié :** la garde de `src/routes/_authenticated.tsx` verrouille l'application
quand le club n'a pas de souscription active, et le trigger d'essai **ignore les clubs
personnels**. Il faut donc étendre la logique de couverture (voir §6) pour qu'un club
personnel dont au moins une équipe a une `team_subscription` active/en essai ne soit pas
verrouillé — sans pour autant activer les droits Club.

## 5. Équipes supplémentaires

Depuis son espace, bouton « Ajouter une équipe » : nom + infos, catégorie et sport,
présentation du tarif, choix mensuel/annuel, checkout Stripe, activation.

- Afficher : « Chaque équipe supplémentaire est facturée 9,99 €/mois ou 99,99 €/an. »
- Ne pas forcer le passage à l'offre Club à la deuxième équipe ; les périodicités peuvent
  différer d'une équipe à l'autre (U11 mensuel, U13 annuel…).
- Proposer l'offre Club en upsell informatif (sans blocage) à partir d'un seuil, par
  exemple quand 5 équipes × 9,99 € se rapprochent des 49 €/mois de l'offre Club.
- Note : la condition `teams.length < 3` dans `src/routes/_authenticated/teams.tsx` est
  purement cosmétique (affichage d'un CTA), pas un quota — ne pas la confondre avec une
  limite à respecter.

## 6. Couverture d'une équipe et précédence

Créer une fonction serveur centrale de résolution de couverture :

```text
get_team_coverage(team_id) → club_plan | team_plan | team_trial | grace | expired | none
get_team_entitlements(user_id, team_id) → entitlements effectifs
```

Règles de précédence :

1. si le club de l'équipe a une souscription Club active (ou exemption) → couverture Club ;
2. sinon, si l'équipe a une `team_subscription` active ou en essai → couverture Équipe ;
3. sinon → période de grâce, expiré, ou aucune couverture (lecture seule).

Une équipe ne doit jamais être facturée simultanément par une offre Équipe **et** une
offre Club : voir migration (§10). Interdire l'achat d'une souscription Équipe pour une
équipe déjà couverte par un club actif.

Le front-end ne décide jamais seul d'un droit payant : contrôles côté serveur
(server functions) et, pour les chemins critiques, RLS / RPC SECURITY DEFINER —
même motif que `club_has_active_subscription`.

## 7. Entitlements

Créer la logique centralisée d'entitlements (elle n'existe pas encore — voir §0).
Ne pas disperser de `if plan === "team"` dans le front.

Pour l'offre Équipe :

```text
can_manage_team = true
can_invite_team_staff = true          (staff illimité)
can_manage_players = true
can_create_team_events = true
can_use_team_wall = true
can_use_staff_wall = true
can_use_team_documents = true
can_use_event_needs = true
can_manage_staff_availabilities = true

can_manage_club = false
can_use_club_wall = false
can_use_cross_team_groups = false
can_view_club_statistics = false

can_participate_in_tournament = true
can_create_tournament = false
can_manage_tournament = false

max_players = 50                      (limite à CRÉER, configurable par entitlement,
                                       jamais codée en dur dans les écrans)
max_staff_members = illimité
max_teams_covered = 1                 (une souscription couvre UNE équipe ;
                                       un utilisateur peut avoir plusieurs souscriptions)
```

Fonctionnalités incluses : gestion d'équipe, joueurs, parents/responsables légaux, staff,
événements, entraînements, matchs, convocations et réponses, présences, compositions,
disponibilités joueurs et staff, besoins liés aux événements, communication et mur
d'équipe, mur staff, sondages, notifications, emails transactionnels, documents,
calendrier, statistiques individuelles/équipe déjà disponibles, import de joueurs,
invitations parents/joueurs/coaches.

Exclusions (offre Club ou modules séparés) : administration centrale du club, tableau de
bord et statistiques consolidées, mur général du club, groupes transverses, communication
club entière, gestion globale des membres et rôles, réunions Club, documents communs au
club, paramètres/identité du club, gestion financière globale, CRM, sponsoring, modules
premium futurs, IA réservée à d'autres offres, gestion de ligue/championnat, création et
gestion de tournois.

## 8. Tournois — piège critique vérifié

`can_create_tournament(_user_id)` autorise aujourd'hui tout admin/dirigeant d'un club dont
`club_has_active_subscription()` est vrai. **Si la couverture Équipe est implémentée en
rendant « actif » le club personnel, la création de tournois se débloquerait par accident.**
La fonction doit être ajustée pour que la couverture Équipe ne satisfasse jamais ce critère.

Comportement attendu :

- L'offre Équipe ne permet ni création, ni administration, ni inscriptions, ni génération
  de groupes, ni gestion de matchs, ni classement d'un tournoi.
- Une équipe inscrite ou invitée à un tournoi tiers peut consulter et utiliser les
  fonctions qui la concernent (`can_participate_in_tournament = true`).
- À la tentative de création : écran explicatif (pas d'erreur technique ni de page vide) —
  « La gestion des tournois n'est pas incluse dans l'offre Équipe » — avec un bouton
  adapté au modèle commercial (« Découvrir l'offre Tournoi » / « Activer le module
  Tournoi » / « Contacter Clubero »). Les offres tournoi payantes existent déjà
  (`tournament_entitlements`, pass) : brancher l'upsell dessus.
- Tracker l'événement `tournament_upsell_viewed`.

## 9. Essai gratuit

- `trial_duration_days` configurable. **Décision à valider :** l'essai Club actuel est de
  14 jours (le prompt initial visait 30) — aligner l'offre Équipe sur 14 jours ou assumer
  une durée différente ; dans tous les cas la valeur est une config, pas une constante.
- Le trigger d'essai existant ignore les clubs personnels : l'essai Équipe doit être créé
  par le parcours de souscription Équipe (côté serveur), pas par un trigger sur `clubs`.
- Anti-abus décidé côté serveur (ex. : un seul essai Équipe par compte et/ou par client
  Stripe ; validation manuelle si comportement suspect). Éviter la création en série
  d'équipes uniquement pour cumuler des essais.
- Fin d'essai sans paiement : conserver toutes les données, passer l'équipe en lecture
  seule, permettre la consultation, bloquer création/modification, afficher un bouton de
  réactivation. Ne jamais supprimer de données automatiquement.
- Réutiliser le mécanisme de rappels d'essai (`trial-reminders`) pour l'offre Équipe.

## 10. Migration Équipe → Club

Parcours : le club crée son espace, souscrit à l'offre Club, invite les coaches ; un coach
accepte de **rattacher son équipe** ; l'équipe passe sous couverture Club ; la souscription
Équipe correspondante est résiliée ou programmée pour résiliation selon la règle
commerciale ; toutes les données sont conservées.

Écran d'invitation : « Le club FC Exemple vous invite à rattacher l'équipe U13 à son
espace Clubero », avec les conséquences explicites avant validation : historique, joueurs,
parents, événements, convocations et documents conservés ; les autres coaches restent
membres ; l'équipe sera couverte par l'abonnement du club ; la facturation Équipe actuelle
sera arrêtée selon les règles affichées.

Seul un coach/responsable autorisé peut accepter le rattachement ; personne d'autre ne
peut transférer une équipe sans autorisation. Techniquement, le rattachement d'une équipe
d'un club personnel vers un club réel peut s'appuyer sur `convert_personal_club_to_real`
ou sur un déplacement de `club_id` — à trancher lors du plan d'implémentation en évaluant
l'impact RLS.

Traitement financier : Stripe Billing est la source de vérité. Pas de calcul maison de
proratas — utiliser les mécanismes Stripe (`proration_behavior`, ou résiliation en fin de
période selon la règle commerciale). Afficher : date de fin de l'ancien abonnement,
montant facturé, crédit/prorata éventuel, date de début de la couverture Club. Ne jamais
promettre un remboursement avant le résultat Stripe. Toutes les opérations de migration
doivent être **idempotentes** (pas de double annulation, double facturation, équipe sans
couverture, ni traitement multiple d'un webhook).

## 11. Paiement échoué et période de grâce

Réutiliser l'enum `subscription_status` existant (tous les statuts Stripe y sont déjà).
Période de grâce configurable : alerte au responsable de facturation, mise à jour du moyen
de paiement possible (réutiliser `createUpdatePaymentMethodSession` / update-card-dialog),
pas de coupure immédiate si la règle commerciale le permet. Après la grâce : lecture seule,
données conservées, membres non retirés, invitations et historique intacts — en s'appuyant
sur les écrans de verrouillage existants, adaptés à une portée **équipe** (le verrouillage
actuel est au niveau club entier).

## 12. Interface de facturation

Page « Facturation et abonnements » listant chaque équipe et sa couverture :

```text
U13 — Offre Équipe mensuelle — 9,99 €/mois — Active — Prochaine échéance : 15 août 2026
U15 — Offre Équipe annuelle — 99,99 €/an — Active — Prochaine échéance : 4 juillet 2027
U18 — Couverte par l'offre Club — Aucune facturation Équipe
```

Selon les permissions : plan, statut, essai, responsable de facturation, échéance,
périodicité, boutons gérer / changer de responsable / rattacher à un club / annuler /
réactiver. Plus « Ajouter une équipe — 9,99 €/mois ou 99,99 €/an ».

S'inspirer de `src/routes/_authenticated/admin/billing.tsx` (page Club existante) mais
avec une autorisation par `billing_owner` / `can_manage_team_billing`, **pas** par
« club admin » (toutes les fonctions de `billing.functions.ts` sont actuellement
verrouillées club-admin : il faut un nouveau chemin d'autorisation, pas un contournement).

Prévoir aussi la visibilité superadmin (console `src/routes/superadmin/billing.tsx`) et
décider si le mécanisme d'exemption (`exempt_from_billing`) doit exister aussi pour les
souscriptions Équipe (recommandé, pour les partenaires/beta).

## 13. Départ du payeur, invitations, suppression

- Le départ d'un coach non-payeur n'a aucun impact sur la souscription.
- Si le payeur veut quitter l'équipe : exiger d'abord un transfert de responsabilité
  (autre coach, responsable, club) ou une annulation en fin de période. Message :
  « Vous êtes actuellement responsable de la facturation de cette équipe. Transférez
  d'abord la responsabilité à un autre membre autorisé ou annulez l'abonnement. »
- Ne jamais supprimer une équipe ayant un abonnement actif, un essai actif, une facture
  en attente ou une migration en cours. Passer par l'archivage existant
  (`teams.archived_at` / `deleted_at`) : traiter d'abord la souscription, conserver les
  données, permettre la restauration si elle existe.

## 14. Sécurité et RLS

- RLS strictes sur toutes les nouvelles tables, sur le modèle des helpers SECURITY
  DEFINER existants.
- Reproduire les **REVOKE au niveau colonne** sur les identifiants Stripe de
  `team_subscriptions` (comme sur `subscriptions`).
- Être payeur ne donne pas accès aux données personnelles/médicales des joueurs, aux
  autres équipes, ni à l'administration du club. Être coach ne donne pas accès à la
  facturation.
- Ajouter les tests RLS correspondants dans `tests/rls/` (`bun run test:rls`) et passer
  `bun run check:guards` sur les nouvelles server functions.

## 15. Webhooks Stripe

Étendre le handler existant (`stripe-webhook-handler.server.ts`) — ne pas en créer un
second. Ajouter une branche `metadata.purpose = "team_plan"` avec `metadata.team_id`,
comme pour les tournois. La table `stripe_webhook_events` existe déjà pour l'idempotence.

Événements à couvrir pour l'offre Équipe : `checkout.session.completed`,
`customer.subscription.created/updated/deleted/trial_will_end/paused/resumed`,
`invoice.payment_succeeded`, `invoice.payment_failed` (noms alignés sur ceux déjà traités
par le handler). Pour chaque événement : vérifier la signature, dédupliquer par
`event_id`, journaliser, rattacher précisément à l'équipe concernée via les metadata,
mettre à jour `team_subscriptions`, ne jamais faire confiance aux données client.

## 16. Notifications

Réutiliser l'infrastructure existante (emails transactionnels, push, rappels d'essai,
`subscription-notify.server.ts`) pour : début et fin d'essai, activation, création d'une
équipe supplémentaire, paiement réussi/échoué, moyen de paiement à mettre à jour,
annulation programmée/effective, passage en lecture seule, transfert de responsabilité de
facturation, invitation d'un coach, rattachement à un club, fin de la facturation Équipe
après rattachement.

Les notifications financières vont prioritairement au responsable de facturation ; les
autres coaches ne reçoivent que ce qui les concerne fonctionnellement.

## 17. i18n et marketing

- Toutes les chaînes UI en i18n, dans les **7 locales**, avec `bun run check:i18n` vert.
- Mettre à jour la page pricing (`src/routes/pricing.tsx`) et les textes marketing.
  Attention : `src/locales/fr/marketing.json` mentionne déjà des offres (« Découverte »,
  « Fédération ») qui n'existent pas en code — clarifier la grille tarifaire affichée pour
  qu'elle corresponde aux offres réelles (Équipe, Club, Tournois).

## 18. Tracking produit

Événements analytiques sans données sensibles :

```text
team_plan_checkout_started
team_plan_activated
team_plan_trial_started
team_plan_trial_expired
additional_team_created
team_subscription_cancelled
team_billing_owner_changed
team_attached_to_club
team_migrated_to_club_plan
team_feature_blocked
tournament_upsell_viewed
```

Objectifs : mesurer la création de deuxièmes équipes, le multi-équipes payant, la
conversion vers l'offre Club, les fonctionnalités bloquées les plus demandées, les
tentatives d'accès au module Tournoi.

## 19. Critères d'acceptation

1. Une équipe peut avoir un nombre illimité de coaches et membres du staff.
2. Les coaches invités ne paient rien individuellement.
3. Une souscription Équipe couvre exactement une équipe.
4. Un utilisateur peut payer plusieurs équipes, avec des périodicités différentes.
5. Un utilisateur gère toutes ses équipes depuis le même compte.
6. Permissions sportives et permissions de facturation strictement séparées.
7. Le responsable de facturation est transférable sans perte de données ni recréation de
   souscription.
8. Le départ d'un coach non-payeur n'impacte pas la souscription ; le départ du payeur
   exige un transfert ou une résolution explicite.
9. L'offre Équipe ne permet ni de créer ni d'administrer un tournoi — y compris via le
   critère club actif de `can_create_tournament` (§8) — mais une équipe peut participer à
   un tournoi tiers.
10. Les fonctionnalités sont contrôlées par des entitlements centralisés ; aucun contrôle
    uniquement front-end ne protège une fonctionnalité payante critique.
11. Les webhooks Stripe sont la source de vérité et sont idempotents.
12. Les données sont conservées après expiration ou annulation ; une équipe sans
    couverture passe en lecture seule (portée équipe, pas club entier).
13. Une équipe peut être rattachée à une offre Club sans perte de données et sans double
    facturation Équipe + Club.
14. La souscription Club existante (table `subscriptions`, contrainte UNIQUE, webhook
    upsert) continue de fonctionner sans régression ; les RLS existantes ne régressent pas.
15. Aucune information Stripe sensible n'est exposée côté client (REVOKE colonne inclus).
16. `bun run check:i18n`, `bun run check:guards` et `bun run test:rls` passent.

## 20. Décisions à valider avant implémentation

1. Durée de l'essai Équipe : 14 jours (aligné Club) ou 30 jours ?
2. Règle de résiliation lors du rattachement à un club : fin de période ou prorata
   immédiat (`proration_behavior`) ?
3. L'exemption de facturation (`exempt_from_billing`) est-elle étendue aux souscriptions
   Équipe ?
4. L'offre Équipe est-elle lancée derrière un feature flag V2 (`app_flags`) ?
5. Seuil et forme de l'upsell vers l'offre Club (informatif uniquement).
6. Modèle commercial du bouton d'upsell Tournoi (offre Tournoi existante, contact, module).

## 21. Découpage recommandé

Ne pas réaliser tout le chantier en une seule modification. Présenter un plan détaillé
(schéma, migrations SQL, server functions, webhooks, écrans, RLS, tests, risques) et
attendre validation avant tout refactor transversal.

- **Lot 1 — Modèle de couverture** : table `team_subscriptions`, entitlements centralisés,
  résolution de couverture (`get_team_coverage`), distinction utilisateur/équipe/payeur,
  migrations SQL, RLS + REVOKE colonnes, tests unitaires du calcul des droits,
  ajustement de `can_create_tournament` (§8).
- **Lot 2 — Première équipe et Stripe** : parcours onboarding « Équipe » (club personnel),
  checkout, branche webhook `team_plan`, essai, activation, lecture seule à portée équipe,
  portail de facturation, notifications financières.
- **Lot 3 — Équipes supplémentaires** : bouton « Ajouter une équipe », souscriptions
  multiples, écran de synthèse, changement de périodicité, annulation équipe par équipe,
  tests multi-équipes.
- **Lot 4 — Staff et transfert de facturation** : invitations illimitées du staff,
  `can_manage_team_billing`, transfert du responsable, départ du payeur, coaches
  multi-équipes et multi-clubs.
- **Lot 5 — Restrictions fonctionnelles** : contrôle des fonctionnalités Club, restriction
  Tournoi + écran d'upsell, contrôle serveur des entitlements, tracking des blocages,
  i18n 7 locales.
- **Lot 6 — Migration vers l'offre Club** : invitation du club, rattachement, transfert de
  couverture, traitement Stripe idempotent, prévention de la double facturation,
  conservation des données, tests de migration et rollback.
