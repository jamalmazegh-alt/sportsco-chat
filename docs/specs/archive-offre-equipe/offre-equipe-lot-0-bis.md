# Lot 0 bis — Durcissement, inventaires et prérequis

> Addendum obligatoire à `offre-equipe-team-plan.md` et
> `offre-equipe-architecture-plan.md`.
>
> **Aucun développement fonctionnel du Lot 1 ne commence avant validation de ce
> document.**
>
> **Toutes les décisions produit et techniques sont désormais tranchées** (§32 du prompt).
> Ce document ne contient plus d'arbitrages à rendre : uniquement des **inventaires à
> produire**, des **spécifications à rédiger** à partir des décisions acquises, et une
> **régularisation de données** à exécuter (`exempt_until`).
>
> Les comptages cités proviennent d'une exploration réelle du dépôt et servent d'amorce ;
> ils doivent être complétés, pas repris tels quels.

---

## 28.1 Garde-fous en base de données

Les invariants critiques ne doivent dépendre ni du code applicatif, ni des tests, ni de la
discipline des développeurs. Chaque garde-fou ci-dessous doit couvrir **les écritures via
service role et `supabaseAdmin`**, qui contournent la RLS.

### A. Anti-abonnement Club sur un club `per_team`

**Garde-fou symétrique préalable : nul ne doit pouvoir écrire `coverage_mode='per_team'`
par accident.** La valeur n'est settable que par une **RPC dédiée, elle-même derrière un
flag** ; un trigger `BEFORE UPDATE` refuse tout passage à `per_team` hors de cette RPC.
Sans cela, un bug front ou un appel direct créerait un club sans essai Club, donc
immédiatement verrouillé pour son propriétaire.

Interdire ensuite qu'une ligne `subscriptions` active, en essai ou exemptée soit associée
durablement à un club `coverage_mode='per_team'`.

Un `CHECK` inter-tables étant impossible en Postgres, retenir un **trigger
`BEFORE INSERT OR UPDATE` sur `subscriptions`** qui lève une exception si le club cible
est en `per_team`, **sauf** lorsque le flux contrôlé de passage à l'offre Club est en
cours. Matérialiser ce flux par un marqueur explicite (colonne d'état de migration ou
paramètre de session `SET LOCAL`), jamais par une heuristique.

À spécifier : le mécanisme d'exception exact, sa portée transactionnelle, et son
comportement si la migration échoue en cours de route.

### B. Contrôle tournoi explicite — par comparaison, pas par remplacement

`can_create_tournament` doit tester `clubs.coverage_mode = 'club'` **en plus de**
`club_has_active_subscription(club_id)`. Ne pas déduire le mode commercial de la seule
existence d'une souscription.

**Cette fonction est utilisée en production : ne pas la remplacer directement.**

```text
1. créer can_create_tournament_v2
2. laisser can_create_tournament INCHANGÉE et décisive
3. comparer les deux sur des cas réels ou un snapshot anonymisé :
   clubs abonnés · clubs exemptés · organisateurs (entitlements single et annual) ·
   superadmins · clubs personnels (is_personal) · comptes sans abonnement ·
   clubs anciens aux données atypiques
4. expliquer CHAQUE divergence
5. remplacer la fonction publique seulement ensuite
6. conserver le SQL de l'ancienne définition pour la migration de retour
```

Les **clubs personnels** sont le cas le plus susceptible de diverger : ils n'ont pas de
souscription et leur `coverage_mode` par défaut sera `'club'`.

Livrable : `_v2`, le rapport de comparaison, la liste des divergences expliquées, et la
migration de retour.

### C. Cohérence `team_subscriptions.club_id`

Trigger vérifiant à l'INSERT et à l'UPDATE que
`club_id = (SELECT club_id FROM teams WHERE id = team_id)`. Définir le comportement lors
d'un transfert d'équipe vers un autre club (Lot 8) : mise à jour en cascade dans la même
transaction.

### D. Unicité des souscriptions

Index partiel garantissant une seule souscription vivante par équipe. **Point d'attention
identifié** : si l'index exclut seulement `canceled` et `incomplete_expired`, une ligne
`incomplete` issue d'un checkout abandonné bloque tout nouvel achat sur la même équipe
jusqu'à son expiration Stripe (~24 h), avec une erreur d'unicité brute. Voir E.

### E. Stratégie `incomplete`

Avant tout nouveau checkout : rechercher une souscription vivante ou incomplète → vérifier
son état réel auprès de Stripe → réutiliser une session récente reprenable, ou passer la
ligne à `incomplete_expired` si Stripe confirme l'expiration, ou l'invalider proprement →
seulement ensuite créer une nouvelle session.

**Ne jamais exposer une erreur d'unicité brute à l'utilisateur.** L'index est le garde-fou
ultime, pas la logique applicative.

### F. Quotas Découverte

- quota **par porteur** : exprimable par un index unique partiel → garantie au niveau
  base, indépendante de toute logique applicative ;
- quota **par club** (2 maximum) : non exprimable par un index → garanti par une
  transaction verrouillée sur le club **plus** un trigger de défense en profondeur.

**Règle de comptage — seules les équipes réellement en état Découverte consomment un
quota.** Une équipe en lecture seule ne réserve jamais une place, ni pour elle-même ni
pour son porteur. Structurellement : le comptage porte sur les lignes
`team_discovery_coverage` avec `revoked_at IS NULL` ; une équipe en lecture seule n'en
possède aucune. Les états essai, payant, couvert par le Club, archivé et expiré ne
consomment rien.

### Livrables

Définition SQL de chaque garde-fou, portée transactionnelle, comportement en cas de
contournement service role, et test de contournement associé.

---

## 28.2 Inventaire des mutations directes Supabase

> **Premier passage livré : `docs/specs/inventaire-mutations-directes.md`.**
> 44 fichiers relevés et classés A / A′ / B / N, avec 6 arbitrages produit identifiés et
> le mécanisme de la catégorie A′ à trancher (recommandation : RPC `cancel_event`).
> Reste à compléter : `events/$eventId.tsx` et `wall-feed.tsx` en lecture intégrale.

**Amorce chiffrée : 56 fichiers hors `*.server.ts`, `*.functions.ts`, routes API et
webhooks contiennent des `.insert() / .update() / .delete() / .upsert()`.** Ce sont autant
de chemins où le paywall ne peut pas être garanti par les server functions.

Fichiers représentatifs déjà identifiés : `src/components/import-players-csv-dialog.tsx`,
`wall-feed.tsx`, `event-chat.tsx`, `needs/event-needs-section.tsx`,
`declare-absence-drawer.tsx`, `declare-staff-absence-drawer.tsx`,
`staff-assignment-section.tsx`, `existing-player-picker.tsx`, `carpool-section.tsx`,
`match-result-card.tsx`, `quick-sanction-drawer.tsx`, `player-suspensions.tsx`,
`team-invite-share-button.tsx`, `src/routes/_authenticated/teams.tsx`, plusieurs écrans
`admin/settings.*`.

### Tableau à produire (une ligne par mutation)

| Colonne | Contenu |
|---|---|
| Fichier | chemin:ligne |
| Table ou RPC | cible de l'écriture |
| Opération | insert / update / delete / upsert |
| Rôle utilisateur | qui déclenche |
| Équipe déductible depuis | colonne permettant de remonter à `team_id` |
| Catégorie | **A** gestion / **B** réponse / **C** système / **D** lecture |
| Couverture requise | oui / non |
| Policy actuelle | policy RLS en vigueur |
| Modification proposée | ajout de `team_has_write_access()`, RPC, ou aucun changement |
| Risque de régression | faible / moyen / élevé |

### Règle de classification — quatre catégories

Ne pas ajouter aveuglément `team_has_paid_access()` partout. La classification est **le
point le plus risqué de tout le chantier** : une mutation mal classée bloque soit des
parents légitimes, soit l'annulation d'un entraînement.

```text
A  — création et administration        → bloquée après la grâce
A′ — continuité et sécurité            → MAINTENUE en lecture seule
B  — réponses à un objet existant      → MAINTENUE en lecture seule
C  — système (webhook, cron, service role) → hors RLS utilisateur, auditée
D  — lectures                          → conservées
```

Pré-classement de l'amorce, à confirmer fichier par fichier :

- **B** : `declare-absence-drawer.tsx`, `declare-staff-absence-drawer.tsx`
  (disponibilités), `needs/event-needs-section.tsx` (candidature), `carpool-section.tsx`
  (inscription covoiturage), réponses à convocation.
- **A′** : annulation d'un événement et notification associée dans
  `routes/_authenticated/events/$eventId.tsx` ; retrait d'une convocation erronée ;
  consultation des réponses ; clôture d'un besoin. **Ces chemins doivent être identifiés
  explicitement** — ils sont aujourd'hui mêlés aux mutations de gestion dans les mêmes
  écrans, ce qui est précisément le risque.
- **A** : `import-players-csv-dialog.tsx`, `staff-assignment-section.tsx`,
  `existing-player-picker.tsx`, `quick-sanction-drawer.tsx`, `wall-feed.tsx` (création de
  publication), écrans `admin/settings.*`.

Point d'attention : « modifier un événement » peut relever de A (changer le lieu et
l'horaire) ou de A′ (annuler). La granularité doit descendre au niveau de l'action, pas
de l'écran.

### Livrables

Tableau complet ; liste des mutations nécessitant une policy modifiée ; liste des
mutations à convertir en RPC ; liste des exceptions autorisées en lecture seule ; plan de
test par catégorie.

---

## 28.3 Inventaire des lecteurs de `subscriptions`

> **Livré : `docs/specs/inventaire-lecteurs-subscriptions.md`.**
> Résultat : aucun `.single()` dans le dépôt, donc **aucun risque de crash**. En revanche
> **deux bloquants** empêchent aujourd'hui l'existence même d'un club `per_team` — la
> garde de `_authenticated.tsx` et le mode « tournoi seul ». Tous deux à corriger avant
> la Phase C.

**Amorce chiffrée : 39 sites de lecture ou d'écriture de `subscriptions` répartis sur
~10 fichiers.**

Répartition constatée :

| Fichier | Sites | Nature |
|---|---|---|
| `src/lib/superadmin.functions.ts` | 9 | console superadmin, listes de clubs |
| `src/lib/billing.functions.ts` | 9 | checkout, portail, sync, annulation |
| `src/lib/billing-exemption.functions.ts` | 4 | exemptions |
| `src/lib/stripe-webhook-handler.server.ts` | 3 | upsert webhook (`onConflict: "club_id"`) |
| `src/components/trial-banner.tsx` | 1 | bannière d'essai (composant client) |
| `src/lib/has-paid-access.server.ts` | 1 | prédicat d'accès serveur |
| `src/lib/stripe-connect.functions.ts` | 1 | Stripe Connect |
| `src/modules/tournaments/tournament-payments.server.ts` | 1 | paiements tournoi |
| `src/modules/tournaments/hooks/useTournamentOnlyMode.ts` | 1 | mode tournoi seul |
| autres | reste | à compléter |

### Question centrale

**Un club `per_team` peut légitimement n'avoir aucune ligne `subscriptions`.** Chaque site
doit être audité pour vérifier qu'il gère l'absence de ligne sans planter ni afficher un
état trompeur (« abonnement expiré » alors que les équipes sont couvertes
individuellement).

Vérifier en particulier : les `.single()` (qui lèvent une erreur sur zéro ligne, contre
`.maybeSingle()` qui retourne `null`), les jointures qui excluraient silencieusement les
clubs `per_team`, et `trial-banner.tsx` qui afficherait une bannière d'essai Club sur un
club sans souscription.

### Tableau à produire

Fichier / fonction ; hypothèse actuelle ; comportement sur club `per_team` ; risque ;
modification requise ; lot concerné.

### Livrables

Tableau complet, plan de correction, et test de non-régression « club `per_team` sans
ligne `subscriptions` » traversant chaque écran concerné.

---

## 28.4 Saga Équipe → Club

Le passage à l'offre Club sur le même club est une **saga idempotente**, pas une
transaction SQL unique : elle traverse Stripe, plusieurs webhooks et plusieurs tables.

### États de la saga

```text
pending        → checkout Club lancé
club_confirmed → abonnement Club actif confirmé par Stripe
mode_switched  → coverage_mode basculé, couverture Club effective
stopping       → arrêt des team_subscriptions demandé à Stripe
completed      → toutes les team_subscriptions résolues
failed_partial → au moins un arrêt Stripe a échoué, reprise requise
```

### Ordre imposé (§18.1 du prompt)

Les onze étapes, avec la garantie structurante : **la couverture Club est active avant
tout arrêt d'abonnement Équipe**. Aucune fenêtre où une équipe se retrouve sans couverture.

### À spécifier

- persistance de l'état de saga (table dédiée ou colonnes sur `clubs`) ;
- idempotence : rejouer une étape déjà effectuée ne doit produire aucun effet ;
- gestion des échecs partiels : une équipe dont l'arrêt Stripe échoue reste facturée —
  détection, alerte, reprise manuelle ;
- monitoring : comment un opérateur voit qu'une saga est bloquée en `stopping` ;
- délai maximal avant escalade ;
- comportement si le club résilie l'offre Club pendant la saga.

### Livrables

Diagramme d'états, table de persistance, procédure de reprise manuelle, plan de test des
huit scénarios Stripe du §18.2 du prompt.

---

## 28.5 Machine à états

### Table de dérivation

Source unique : `get_team_coverage(team_id)`. Aucun statut Stripe artificiel ; les états
Clubero sont **dérivés**, jamais stockés dans l'enum `subscription_status`.

```text
Club actif ou exemption Club active      → club_plan     (active)   ← prioritaire
subscription active + période valide     → team_plan     (active)
trialing + trial_end future              → team_trial    (active)
couverture Découverte valide             → discovery     (active)
past_due + grace_end future              → grace         (grace)
past_due + grace_end dépassée            → expired       (restricted)
unpaid                                   → expired       (restricted)
cancel_at_period_end + period_end future → team_plan jusqu'à l'échéance
canceled + period_end dépassée           → discovery si éligible, sinon expired
aucune couverture                        → none          (restricted)
équipe archivée / suspendue              → —             (locked)
```

### Période de grâce — décision tranchée

```text
TEAM_BILLING_GRACE_DAYS = 14
```

Constante serveur surchargeable par env, **pas une valeur en base** : modifiable sans
migration.

Règle d'écriture, à implémenter dans le handler `invoice.payment_failed` :

```text
IF grace_started_at IS NULL THEN
  grace_started_at := now()
  grace_end        := now() + TEAM_BILLING_GRACE_DAYS
END IF
```

`grace_started_at` est posé **une seule fois** et jamais écrasé — ni par les relances du
*smart retry* Stripe, ni par le rejeu d'un webhook. Sans cette écriture conditionnelle,
chaque relance repousserait l'échéance et la grâce ne se terminerait jamais.

Remise à zéro uniquement sur `invoice.payment_succeeded`.

Pendant la grâce, l'usage reste **complet** (`canManageTeamContent`,
`canOperateExistingEvents`, `canRespondToExistingObjects` tous à `true`) : pas d'état
intermédiaire complexe, une simple alerte au billing owner. À l'expiration : Découverte si
tous les quotas sont respectés, sinon lecture seule.

À spécifier : le test « trois `invoice.payment_failed` successifs → `grace_end` inchangé »,
et le test « webhook rejoué → `grace_end` inchangé ».

### 28.5.1 Job planifié

Route cron ou tâche planifiée **idempotente** traitant : fins d'essai (avec évaluation
d'éligibilité Découverte, §28.9) ; fins de grâce ; journalisation des transitions ;
notifications ; détection d'incohérences ; réconciliation périodique Stripe ↔ Clubero.

À spécifier : fréquence ; mécanisme de verrouillage (empêcher deux exécutions
concurrentes) ; idempotence par transition ; journalisation ; reprise après échec ;
comportement si le job n'a pas tourné pendant plusieurs jours (rattrapage en masse).

**Contrainte d'environnement** : l'application tourne sur Cloudflare Workers. Vérifier le
mécanisme de planification disponible (Cron Triggers Wrangler ou route appelée par un
ordonnanceur externe) — le dépôt contient déjà des routes de hook sous
`src/routes/api/public/hooks/` (dont `trial-reminders.ts`) qui constituent le précédent à
suivre.

### Livrables

Table de dérivation validée, durée de grâce décidée, spécification du job (fréquence,
verrou, idempotence, reprise), et jeu de tests couvrant chaque transition.

---

## 28.6 RGPD et billing owner

### Fonction à créer

```text
user_has_active_billing_responsibilities(user_id) → boolean
```

Couvre : souscription active ; période d'essai ; statut `incomplete` ; paiement en échec ;
annulation programmée non encore effective ; migration vers Club en cours ; exemption dont
l'utilisateur est responsable ; obligations Stripe encore actives.

### Flux à modifier

Analyser le flux de suppression et d'anonymisation existant (`src/lib/privacy.functions.ts`
et ses appelants) et y insérer le contrôle **avant** toute suppression ou anonymisation.

Si une responsabilité existe : **suppression bloquée**, avec un message actionnable
proposant le transfert (§13.2 du prompt) ou l'annulation.

### Invariants à garantir

Ne jamais produire : une `team_subscription` pointant vers un utilisateur supprimé ; un
customer Stripe sans responsable Clubero ; une facture active sans interlocuteur
fonctionnel.

### Flux tranché — jamais de blocage indéfini

Le droit à l'effacement n'est pas absolu, mais il ne peut pas être suspendu indéfiniment
faute de transfert. Forcer une personne à rester cliente n'est pas une option.

```text
1. demande de suppression enregistrée
2. proposition de transfert à un responsable éligible
3. sans transfert : désactivation du renouvellement
4. retrait immédiat des accès personnels et opérationnels non nécessaires
5. couverture maintenue jusqu'à current_period_end (le service payé n'est pas coupé
   pour les autres membres)
6. à l'échéance : Découverte si éligible, sinon lecture seule
7. suppression des données de profil non nécessaires
8. conservation restreinte des seules données comptables / fiscales / contentieuses,
   en archivage à accès limité
9. effacement à l'expiration des durées légales
```

Ce flux évite quatre écueils : forcer la personne à rester cliente ; conserver un
abonnement renouvelable sans responsable ; supprimer des preuves comptables requises ;
couper immédiatement un service déjà payé pour les autres membres de l'équipe.

### Pseudonymisation ≠ anonymisation

Substituer un identifiant technique au nom du payeur **n'est pas une anonymisation** si
Clubero ou Stripe peut encore relier cet identifiant à la personne : c'est une
pseudonymisation, et les obligations RGPD continuent de s'appliquer. Ne jamais présenter
cette substitution comme un effacement définitif, ni dans le code, ni dans l'UI, ni dans
la politique de confidentialité.

### Point ouvert — validation juridique (non bloquant)

À instruire hors chantier technique : durées de conservation selon la société estonienne
et les marchés servis ; rôle exact de Stripe et de Clubero (responsable de traitement /
sous-traitant) ; données minimales à conserver ; information remise à la personne ;
distinction explicite entre suppression du compte, résiliation de l'abonnement et
archivage légal.

**Conséquence d'implémentation** : durées et périmètre d'archivage doivent être des
constantes de configuration, ajustables sans migration une fois l'avis rendu. Le flux
ci-dessus est implémentable dès maintenant.

### Livrables

Spécification de la fonction, points d'insertion dans le flux existant, constantes de
configuration pour les durées, plan de test §27.5 du prompt.

---

## 28.7 Dette CI et bug `exempt_until`

### Bug vérifié

| Couche | Emplacement | Comportement |
|---|---|---|
| SQL | `supabase/migrations/20260622120000_subscription_billing_exemption.sql:36` | `s.exempt_from_billing = true` — **`exempt_until` non testé** |
| TypeScript | `src/lib/has-paid-access.ts:22-25` (`isBillingExempt`) | honore `exempt_until` |

`exempt_until` a été ajoutée par `supabase/migrations/20260622170729_0ff402e5-….sql:1`,
**après** la fonction, sans mise à jour de celle-ci. Aucune migration ultérieure ne la
redéfinit.

Conséquence : un club dont l'exemption est expirée conserve l'accès par toutes les voies
SQL — RLS s'appuyant sur `club_has_active_subscription`, et `can_create_tournament` — alors
que la couche applicative le considère non exempté. **Corriger la fonction coupe l'accès
en production à ces clubs.**

### Inventaire obligatoire avant correctif

```sql
SELECT s.club_id, c.name, s.exempt_until, s.exempt_reason,
       s.exempt_granted_at, s.exempt_granted_by
FROM public.subscriptions s
JOIN public.clubs c ON c.id = s.club_id
WHERE s.exempt_from_billing = true
  AND s.exempt_until IS NOT NULL
  AND s.exempt_until <= now();
```

Pour chaque club : identifiant ; nom ; date d'expiration ; motif et auteur de l'octroi ;
**accès actuellement obtenu à cause du bug** ; impact de la correction ; action de
régularisation requise.

Enrichir avec l'activité récente (dernière connexion, équipes actives, événements à venir)
pour distinguer les clubs réellement actifs des comptes dormants : un club dormant peut
être coupé sans précaution, un club actif en pleine saison non.

### Séquence de déploiement imposée

1. produire l'inventaire (lecture seule) ;
2. décider club par club de l'action de régularisation ;
3. appliquer les régularisations (prolongation, souscription, préavis) ;
4. **seulement ensuite** déployer le correctif SQL, **dans une release qui lui est
   propre** ;
5. vérifier que la liste des clubs ayant perdu l'accès correspond exactement à la liste
   attendue ;
6. observer plusieurs jours avant d'enchaîner sur le Lot 1.

**Chantier distinct, pas un prérequis interne au chantier Offre Équipe.** Commits séparés
ne suffisent pas : **déploiements séparés**. Livrer ce correctif et les fondations de
l'offre Équipe ensemble rendrait tout incident indiagnosticable et forcerait un rollback
groupé.

Conserver le SQL de l'ancienne définition de `club_has_active_subscription` et écrire la
migration de retour **avant** de déployer l'aller.

### Dette CI

Le projet possède déjà des contrôles rouges (clés `groups.*` manquantes, lint existant).

**Décision tranchée — trois catégories, pas un choix binaire :**

| Catégorie | Traitement |
|---|---|
| Erreurs empêchant la validation du chantier (dont `check:i18n`) | **À corriger avant le Lot 1** |
| Avertissements et dette réellement indépendante, risquée à corriger maintenant | **Baseline chiffrée et documentée** |
| Régressions introduites par les lots | **Interdites** |

Il ne s'agit donc pas de nettoyer toute la dette historique du dépôt avant de commencer,
mais de rendre les contrôles bloquants réellement fiables. Fonctionnement cible pendant le
chantier : `check:i18n` vert, tests ciblés verts, aucune nouvelle erreur de lint.

La baseline, si elle est utilisée, doit être chiffrée : nombre exact d'erreurs, fichiers
concernés, date de relevé.

### Livrables

Inventaire renseigné ; décisions de régularisation ; migration corrective rédigée mais non
déployée ; séquence de déploiement ; choix de l'option CI et baseline chiffrée le cas
échéant.

---

## 28.8 Clubs identiques et rattachement

### Périmètre V1

**Inclus** : recherche d'un club existant ; suggestion plafonnée ; demande de
rattachement ; création d'un club distinct en cas de faux positif ; signalement manuel
d'un doublon à Clubero.

**Exclus** : rapprochement complet de deux clubs, et toute fusion impliquant des
changements transversaux de `club_id`. C'est la zone la plus risquée du chantier ; elle
fait l'objet d'un chantier ultérieur indépendant.

### Détection

Signaux **indicatifs**, jamais probants : nom normalisé, ville, code postal, sport, logo,
identifiant fédéral futur. Résultat = suggestion.

À spécifier : algorithme de normalisation du nom ; seuil de similarité ; ordre de
présentation ; comportement en l'absence de ville renseignée (le champ existe-t-il
aujourd'hui sur `clubs` ? à vérifier — l'audit initial ne l'a pas relevé, il faudra
peut-être l'ajouter).

### Sécurité de l'endpoint

**Le helper de rate limiting existant est fail-open** (`src/lib/rate-limit.server.ts:46-52`
retourne `true` en cas d'erreur DB) : il ne peut pas être réutilisé tel quel pour un
endpoint public révélant l'existence de clubs. Une variante **fail-closed** est
obligatoire.

Autres exigences : longueur minimale de recherche ; plafond de résultats sans pagination
(empêche l'énumération exhaustive) ; projection limitée à nom public, logo public, sport,
ville approximative, identifiant **opaque** ; journalisation des comportements suspects
(rafales, balayage alphabétique) ; création des demandes côté serveur uniquement.

### Conflits d'équipes lors d'un rattachement (Lot 8)

Si une équipe équivalente existe déjà dans le club cible (deux « U13 ») : **détecter,
bloquer, ne jamais fusionner**. Traitement manuel par un administrateur : renommage,
archivage, ou décision explicite. Aucune fusion automatique de joueurs, événements,
convocations ou documents en V1.

### Livrables

Spécification de l'endpoint et de sa variante fail-closed ; algorithme de suggestion ;
modèle de demande de rattachement ; règle de détection des conflits d'équipes ; tests de
sécurité §27.6 du prompt.

---

## 28.9 Quotas Découverte et définition du joueur actif

### A. Définition du « joueur actif » — décision tranchée

L'activité est portée par **la relation joueur ↔ équipe**, pas par le profil global : un
joueur peut être actif dans une équipe et archivé dans une autre.

Colonne à créer sur `team_members` :

```sql
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'))
```

Deux états suffisent en V1 (`pending` et `left` éventuellement plus tard).

Prédicat de comptage — **corrigé d'après le schéma réel** : `team_members` ne contient que
`id`, `team_id`, `user_id`, `player_id`, `role`, `created_at`. Il n'y a **ni `member_type`
ni `deleted_at`** sur cette table ; une ligne joueur s'identifie par
`player_id IS NOT NULL`.

```sql
team_members.team_id = :team_id
AND team_members.player_id IS NOT NULL
AND team_members.status = 'active'
AND players.deleted_at IS NULL
```

La suppression dans `players` reste réservée à la suppression ou à l'anonymisation du
profil, **jamais** à une sortie d'effectif — ce qui préserve convocations, statistiques,
présences, compositions et anciens événements.

Les joueurs temporairement inactifs (blessure, saison suspendue) **comptent** : ils
occupent une place dans l'effectif, sinon la limite serait contournable par un simple
marquage.

**Index unique `(team_id, player_id)` — procédure imposée, pas une simple vérification.**
Un index unique sur une table de production peut échouer au déploiement, révéler des
doublons fonctionnellement légitimes, ou bloquer un parcours existant qui recrée
aujourd'hui une ligne d'appartenance :

```text
1. inventaire exact des doublons (nombre, clubs, équipes, ancienneté)
2. détermination de leur CAUSE — bug, parcours légitime, import, reprise de données ?
3. vérification des références : laquelle des lignes porte l'historique attendu
   (convocations, présences, compositions) ?
4. correction dans une migration DISTINCTE, déployée seule
5. surveillance plusieurs jours — les doublons réapparaissent-ils ?
6. création de l'index en dernier, seulement si (5) est propre
```

**Ne jamais supprimer automatiquement « la ligne en trop »** sans savoir laquelle porte
l'historique. Si les doublons se recréent après l'étape 4, un parcours applicatif les
produit et l'index échouerait en production.

Si l'étape 2 révèle des doublons **légitimes**, renoncer à l'index unique et compter les
joueurs distincts autrement : la contrainte est un confort d'implémentation, pas une
exigence produit.

### B. Porteur du quota Découverte — décision tranchée

Les deux colonnes coexistent : `teams.created_by_user_id` pour la provenance historique,
`team_discovery_coverage.discovery_owner_user_id` pour le quota — le porteur doit pouvoir
changer sans réécrire l'histoire de la création.

Tension levée : la couverture appartient à **l'équipe** ; le quota est consommé par le
**porteur** au moment de l'octroi ; le porteur est transférable à un autre membre éligible.

### C. Libération du quota — décision tranchée

Le quota est libéré **immédiatement** lorsque l'équipe devient payante, passe sous
couverture Club, est archivée, est supprimée logiquement, ou perd son statut Découverte.

**Aucune bascule rétroactive automatique.** Une modification de facturation sur une équipe
ne doit jamais provoquer un changement d'offre silencieux sur une autre.

```text
U13 Découverte · U15 Découverte · U17 lecture seule
puis U13 devient payante → une place se libère
→ U17 NE bascule PAS automatiquement
```

L'équipe en attente affiche un CTA explicite (« Une place en offre Découverte est
désormais disponible pour ce club »). Au clic, revérification **atomique** : quota club,
quota bénéficiaire, statut de l'équipe, absence de conflit concurrent. **Aucune
réservation implicite** — deux équipes peuvent demander la même place, une seule l'obtient.

### D. Atomicité

Deux fins d'essai simultanées dans un même club pourraient chacune constater « 1 équipe
Découverte » et basculer toutes les deux → 3 équipes Découverte. Vérification et bascule
dans **une seule transaction avec verrou sur le club**, plus les garde-fous de §28.1.F.

Ordre déterministe en cas de fins d'essai simultanées : par `trial_end` puis `created_at`
croissants.

### E. Limite de joueurs — stratégie atomique

Contrôle applicatif `count` puis `insert` **interdit**.

RPC transactionnelle unique, seul chemin d'ajout autorisé. **Le quota est résolu AVANT le
verrou** — prendre un verrou sur une équipe sans limite est une contention pure perte :

```text
add_player_to_team(_team_id, _player_payload)

  quota := resolve_quota(_team_id)

  SI quota EST NULL                        -- offre Équipe ou Club
    → INSERT direct, sans verrou ni comptage
    → RETURN

  SINON                                    -- Découverte uniquement
    → SELECT ... FROM teams WHERE id = _team_id FOR UPDATE   (sérialise par équipe)
    → count := count_active_players(_team_id)
    → IF count >= quota THEN RAISE 'CLUBERO_PLAYER_QUOTA_EXCEEDED'
    → INSERT player + team_members
```

Une équipe de 300 joueurs en offre Club ne doit jamais sérialiser ses ajouts sur un verrou
qui ne protège aucune limite. Même règle pour `import_players_to_team` et pour le trigger
de défense en profondeur, tous deux court-circuités quand le quota est `null`.

Trigger de défense en profondeur sur `team_members` : recompte et refuse le dépassement,
couvrant tout chemin contournant la RPC. Filet, pas mécanisme principal.

**Import CSV — décision tranchée : refus atomique du lot entier.** Aucune insertion
partielle.

Le calcul ne porte pas sur le nombre de lignes du fichier, mais sur ce qui **augmente
réellement l'effectif actif** :

```text
consommation = nouveaux joueurs uniques
             + joueurs archivés réactivés

ne consomment RIEN : doublons internes au fichier,
                     doublons déjà présents dans l'équipe,
                     joueurs existants simplement mis à jour

SI count_active_players + consommation > quota → RAISE, lot entier rejeté
```

Le message d'erreur remonte le nombre de **places restantes** et le nombre de **lignes
consommatrices**, pas le nombre de lignes du fichier — sinon l'utilisateur ne comprend pas
le refus quand son fichier contient surtout des mises à jour.

> Cet import contient 6 nouveaux joueurs alors que votre équipe ne dispose que de 3 places
> en offre Découverte. Retirez au moins 3 joueurs du fichier ou passez à l'offre Équipe.

### F. Anti-contournement

Empêcher : archiver puis recréer les mêmes joueurs ; répartir un effectif sur plusieurs
équipes Découverte fictives ; créer plusieurs comptes pour multiplier les quotas ; déplacer
les joueurs en boucle entre équipes gratuites.

La restauration d'un joueur doit repasser par le même contrôle de quota que la création.
Journaliser les cycles archivage/restauration rapprochés. Rester raisonnable pour la V1 :
règles vérifiables, journalisation et alertes plutôt qu'un moteur anti-fraude complexe.

### G. Tests de concurrence obligatoires

Exécutés avec **deux transactions réelles simultanées**, pas une simulation séquentielle :

```text
équipe à 14 joueurs, quota 15, deux insertions concurrentes
  → exactement une réussite, effectif final 15, jamais 16
équipe en offre Club (quota null), deux insertions concurrentes
  → les deux réussissent, aucun verrou pris
club à 2 équipes Découverte + 1 équipe en lecture seule
  → quota club = 2/2 (l'équipe en lecture seule ne réserve rien)
deux bascules Découverte concurrentes, club à 1 équipe Découverte
  → exactement une réussite
deux bascules concurrentes pour le même porteur
  → exactement une réussite
import de 10 lignes sur une équipe à 8/15
  → lot entièrement rejeté, effectif inchangé à 8
import de 5 lignes sur une équipe à 8/15
  → 13 joueurs, succès
restauration d'un joueur sur une équipe à 15/15
  → refus
insertion directe en base contournant la RPC
  → refusée par le trigger
```

### Livrables

Définition verrouillée du joueur actif ; choix du porteur de quota ; règle de libération ;
signature et corps des RPC ; stratégie d'import ; triggers de défense ; jeu de tests de
concurrence avec la méthode d'exécution.

---

## Récapitulatif des sorties bloquantes

| § | Chantier | Sortie | Nature |
|---|---|---|---|
| 28.1 | Garde-fous DB | Définitions SQL, portée service role, tests de contournement | Spécification |
| 28.2 | Mutations directes | Tableau des 56 fichiers, classification A/A′/B/C/D, plan RLS | **Inventaire** |
| 28.3 | Lecteurs `subscriptions` | Tableau des 39 sites, plan de correction, test « club sans ligne » | **Inventaire** |
| 28.4 | Saga Équipe → Club | Diagramme d'états, persistance, reprise manuelle | Spécification |
| 28.5 | Machine à états | Table de dérivation, écriture conditionnelle de `grace_started_at`, job | Spécification |
| 28.6 | RGPD | Fonction, points d'insertion, constantes de durée | Spécification |
| 28.7 | Dette CI + `exempt_until` | Inventaire renseigné, régularisations, séquence en 7 étapes | **Inventaire + exécution** |
| 28.8 | Clubs et rattachement | Endpoint fail-closed, suggestion, conflits d'équipes | Spécification |
| 28.9 | Quotas et joueur actif | Prédicat de comptage, RPC atomiques, calcul de consommation d'import | Spécification |

**Aucun arbitrage produit ne reste à rendre** : les décisions sont prises (§32 du prompt).
Ce lot produit des inventaires, des spécifications et une régularisation de données.

Le seul point encore ouvert — les **paramètres juridiques** de conservation après
suppression d'un billing owner — ne bloque pas : le flux produit est arrêté, seules les
durées et le périmètre d'archivage restent à confirmer, et ce sont des constantes de
configuration.

## Enchaînement vers le Lot 1

Le correctif `exempt_until` (§28.7) est un **chantier distinct avec sa propre release**,
observé avant le Lot 1 — pas un prérequis interne à livrer avec lui.

Le Lot 1 lui-même ne démarre qu'en **Phase A** au sens de
`docs/specs/IMPLEMENTATION_ORDER.md` : nouvelles tables, nouvelles colonnes à DEFAULT,
fonctions `_v2` jamais appelées, tests. Aucune policy existante, aucun trigger existant,
aucune fonction existante n'est modifié à ce stade — ces changements passent par des
releases dédiées et une comparaison en mode sombre.
