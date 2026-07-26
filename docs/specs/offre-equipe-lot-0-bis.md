# Lot 0 bis — Durcissement, inventaires et prérequis

> Addendum obligatoire à `offre-equipe-team-plan.md` et
> `offre-equipe-architecture-plan.md`.
>
> **Aucun développement fonctionnel du Lot 1 ne commence avant validation de ce
> document.** Les chantiers ci-dessous produisent des décisions, des inventaires et des
> stratégies validées — pas de code fonctionnel.
>
> Les comptages cités proviennent d'une exploration réelle du dépôt et servent d'amorce ;
> ils doivent être complétés, pas repris tels quels.

---

## 28.1 Garde-fous en base de données

Les invariants critiques ne doivent dépendre ni du code applicatif, ni des tests, ni de la
discipline des développeurs. Chaque garde-fou ci-dessous doit couvrir **les écritures via
service role et `supabaseAdmin`**, qui contournent la RLS.

### A. Anti-abonnement Club sur un club `per_team`

Interdire qu'une ligne `subscriptions` active, en essai ou exemptée soit associée
durablement à un club `billing_mode='per_team'`.

Un `CHECK` inter-tables étant impossible en Postgres, retenir un **trigger
`BEFORE INSERT OR UPDATE` sur `subscriptions`** qui lève une exception si le club cible
est en `per_team`, **sauf** lorsque le flux contrôlé de passage à l'offre Club est en
cours. Matérialiser ce flux par un marqueur explicite (colonne d'état de migration ou
paramètre de session `SET LOCAL`), jamais par une heuristique.

À spécifier : le mécanisme d'exception exact, sa portée transactionnelle, et son
comportement si la migration échoue en cours de route.

### B. Contrôle tournoi explicite

`can_create_tournament` doit tester `clubs.billing_mode = 'club'` **en plus de**
`club_has_active_subscription(club_id)`. Ne pas déduire le mode commercial de la seule
existence d'une souscription.

Livrable : la nouvelle définition de la fonction, et la vérification que les clubs
existants (`billing_mode='club'` par défaut) conservent un comportement strictement
identique.

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

### Livrables

Définition SQL de chaque garde-fou, portée transactionnelle, comportement en cas de
contournement service role, et test de contournement associé.

---

## 28.2 Inventaire des mutations directes Supabase

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

### Règle de classification

Ne pas ajouter aveuglément `team_has_paid_access()` partout. La distinction **A vs B est
le point le plus risqué de tout le chantier** : une mutation de réponse mal classée en
« gestion » bloquerait des parents légitimes sur des événements déjà créés.

Cas manifestement **B** repérés à l'amorce, à confirmer :
`declare-absence-drawer.tsx`, `declare-staff-absence-drawer.tsx` (disponibilités),
`needs/event-needs-section.tsx` (candidature à un besoin), `carpool-section.tsx`
(inscription covoiturage), et les réponses à convocation.

Cas manifestement **A** : `import-players-csv-dialog.tsx`, `staff-assignment-section.tsx`,
`existing-player-picker.tsx`, `quick-sanction-drawer.tsx`, les écrans `admin/settings.*`.

### Livrables

Tableau complet ; liste des mutations nécessitant une policy modifiée ; liste des
mutations à convertir en RPC ; liste des exceptions autorisées en lecture seule ; plan de
test par catégorie.

---

## 28.3 Inventaire des lecteurs de `subscriptions`

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
mode_switched  → billing_mode basculé, couverture Club effective
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

### Décision bloquante : durée de la période de grâce

`grace_end` apparaît dans la table de dérivation mais **sa durée n'a jamais été
spécifiée**. Il faut trancher avant le Lot 1. Éléments de cadrage : Stripe relance
automatiquement les paiements échoués selon le *smart retry* configuré (typiquement
jusqu'à ~3 semaines) ; une grâce plus courte que la fenêtre de relance couperait des
clubs qui allaient être débités avec succès.

Recommandation : aligner la grâce sur la fin de la séquence de relance Stripe, soit une
valeur configurable avec un défaut de **14 jours**, à confirmer.

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

### Question ouverte

Que faire d'un utilisateur qui **exige** la suppression RGPD alors qu'il est billing
owner et refuse de transférer ? Le RGPD n'autorise pas un blocage indéfini. Piste :
anonymiser les données personnelles tout en conservant la relation de facturation sous
une identité technique, avec notification au club pour désigner un nouveau responsable
sous délai. À valider juridiquement — cette question dépasse le cadre technique.

### Livrables

Spécification de la fonction, points d'insertion dans le flux existant, décision sur le
cas « suppression exigée sans transfert », plan de test §27.5 du prompt.

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
4. **seulement ensuite** déployer le correctif SQL ;
5. vérifier que la liste des clubs ayant perdu l'accès correspond exactement à la liste
   attendue.

### Dette CI

Le projet possède déjà des contrôles rouges (clés `groups.*` manquantes, lint existant).
Deux options, à trancher :

- **Recommandée** — corriger la dette avant le Lot 1, pour que
  `bun run check:i18n | lint | check:guards | test:rls` soient de vrais critères de sortie.
- **Repli** — baseline documentée : erreurs présentes avant le chantier, nombre exact,
  fichiers concernés. Les critères deviennent « aucune nouvelle erreur par rapport à la
  baseline », et non un faux vert inatteignable.

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

### A. Définition du « joueur actif » — décision bloquante

Constat : `players` possède `deleted_at` (soft delete) mais **aucun état « archivé »** ni
colonne de statut. Le rattachement à une équipe passe par `team_members.player_id`.

Le prompt évoque des « joueurs archivés » non comptés : cet état n'existe pas. Il faut
trancher :

- **Option 1** — s'en tenir au soft delete : joueur actif = ligne `team_members` jointe à
  `players` avec `players.deleted_at IS NULL`. Simple, aucun schéma à changer, mais
  « retirer un joueur de l'effectif » revient à le supprimer.
- **Option 2** — introduire un état « archivé », sur `players` ou sur `team_members` (un
  joueur peut être archivé dans une équipe et actif dans une autre — ce qui plaide pour
  `team_members`). Plus juste fonctionnellement, migration additive, mais élargit le
  périmètre.

Sous-questions : les joueurs temporairement inactifs (blessure, saison suspendue)
comptent-ils ? **Recommandation : oui** — ils occupent une place dans l'effectif, sinon la
limite devient contournable par un simple marquage.

### B. Porteur du quota Découverte

`teams` n'a pas de `created_by`. Deux options :

- ajouter `teams.created_by_user_id` (utile au-delà des quotas, pour la provenance) ;
- porter le rattachement sur la ligne de couverture Découverte
  (`discovery_owner_user_id`), plus explicite et transférable.

**Recommandation : les deux** — `created_by_user_id` pour la provenance historique,
`discovery_owner_user_id` pour le quota, car le porteur du quota doit pouvoir changer
sans réécrire l'histoire de la création.

Tension à lever : le prompt indique que « la couverture Découverte est rattachée à
l'équipe, pas à son créateur », tout en fixant un quota **par créateur**. Résolution
proposée : le quota est consommé par le porteur au moment de l'octroi ; la couverture
appartient à l'équipe ; le porteur peut être transféré à un autre membre éligible.

### C. Libération du quota — décision bloquante

Quand une équipe Découverte est archivée ou passe en offre payante, le quota du porteur et
celui du club se libèrent-ils ? Et une équipe en lecture seule peut-elle alors réclamer la
place libérée ?

**Recommandation V1** : le quota se libère (révocation de la couverture), mais **aucune
bascule rétroactive automatique** — l'utilisateur doit la demander explicitement. Évite
les effets de bord silencieux et les allers-retours d'état.

### D. Atomicité

Deux fins d'essai simultanées dans un même club pourraient chacune constater « 1 équipe
Découverte » et basculer toutes les deux → 3 équipes Découverte. Vérification et bascule
dans **une seule transaction avec verrou sur le club**, plus les garde-fous de §28.1.F.

Ordre déterministe en cas de fins d'essai simultanées : par `trial_end` puis `created_at`
croissants.

### E. Limite de joueurs — stratégie atomique

Contrôle applicatif `count` puis `insert` **interdit**.

RPC transactionnelle unique, seul chemin d'ajout autorisé :

```text
add_player_to_team(_team_id, _player_payload)
  → SELECT ... FROM teams WHERE id = _team_id FOR UPDATE   (sérialise par équipe)
  → résolution du quota (null = illimité → court-circuit, coût nul pour les offres payantes)
  → comptage des joueurs actifs
  → IF count >= quota THEN RAISE 'CLUBERO_PLAYER_QUOTA_EXCEEDED'
  → INSERT player + team_members
```

Trigger de défense en profondeur sur `team_members` : recompte et refuse le dépassement,
couvrant tout chemin contournant la RPC. Filet, pas mécanisme principal.

**Import CSV — décision bloquante.** Recommandation : traiter l'import comme un **lot
cohérent** et refuser le lot entier avant insertion s'il dépasserait le quota, plutôt que
des erreurs ligne par ligne. Un import partiel laisse un effectif silencieusement tronqué,
difficile à réconcilier avec le fichier source. Alternative à trancher : proposer
explicitement « importer les N premières lignes qui rentrent » (non recommandé en V1).

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

| § | Chantier | Sortie |
|---|---|---|
| 28.1 | Garde-fous DB | Définitions SQL, portée service role, tests de contournement |
| 28.2 | Mutations directes | Tableau des 56 fichiers, classification A/B/C/D, plan RLS |
| 28.3 | Lecteurs `subscriptions` | Tableau des 39 sites, plan de correction, test « club sans ligne » |
| 28.4 | Saga Équipe → Club | Diagramme d'états, persistance, reprise manuelle |
| 28.5 | Machine à états | Table de dérivation, **durée de grâce**, spécification du job |
| 28.6 | RGPD | Fonction, points d'insertion, cas « suppression sans transfert » |
| 28.7 | Dette CI + `exempt_until` | Inventaire renseigné, régularisations, séquence de déploiement |
| 28.8 | Clubs et rattachement | Endpoint fail-closed, suggestion, conflits d'équipes |
| 28.9 | Quotas et joueur actif | **Définition du joueur actif**, RPC atomiques, stratégie d'import |

Les six décisions listées au §33 du prompt sont résolues par ces chantiers. Le Lot 1 ne
démarre qu'après validation de l'ensemble.
