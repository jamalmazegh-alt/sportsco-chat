# Offre Clubero par équipe — spécification V3

> **Statut : spécification de référence, consolidée.** Remplace la V2 et le chantier
> « Offre Équipe » initial (archivé dans `docs/specs/archive-offre-equipe/`).
>
> **Aucun code n'a été écrit. Ce document décrit ce qu'il faudra faire.**

---

## 1. Modèle commercial

Deux parcours d'essai distincts, puis deux offres payantes.

```text
ESSAI ÉQUIPE — 30 jours, sans carte bancaire
  1 équipe · 30 joueurs actifs max · coaches et staff illimités
  tournois et stages : création/administration NON
  → teste exactement le périmètre de l'offre à 9,99 €

ESSAI CLUB — 30 jours, sans carte bancaire
  équipes illimitées · joueurs illimités · TOUTES les fonctionnalités
  tournois et stages : OUI
  → teste exactement le périmètre de l'offre Club

OFFRE PAR ÉQUIPE — 9,99 €/mois ou 99,99 €/an par équipe
  1 à 4 équipes · 30 joueurs actifs max par équipe · staff illimité
  tournois et stages : NON

OFFRE CLUB — 49 €/mois ou 490 €/an  (existante, inchangée)
  équipes illimitées · joueurs illimités · tournois · stages
```

**L'essai Club est un vrai essai de l'offre Club.** Un utilisateur qui teste Clubero comme
club doit pouvoir configurer et utiliser son espace exactement comme avec l'abonnement
payant : aucune limitation artificielle à une équipe, aucune fonctionnalité privée.

Grille tarifaire :

| Équipes | Mensuel | Annuel |
|---|---|---|
| 1 | 9,99 € | 99,99 € |
| 2 | 19,98 € | 199,98 € |
| 3 | 29,97 € | 299,97 € |
| 4 | 39,96 € | 399,96 € |
| **Club** | **49,00 €** | **490,00 €** |

Plafond **dur** à 4 équipes : à 5 équipes l'utilisateur paierait 49,95 €/mois
(499,95 €/an) contre 49 €/mois (490 €/an) pour la formule Club — plus cher pour moins de
fonctionnalités. Le seuil tombe au même endroit en mensuel et en annuel.

### 1.1 Terminologie — « crédit » est strictement interne

Le mot **crédit** ne doit jamais apparaître dans l'interface, la page pricing, les emails,
les factures ni le portail Stripe. L'utilisateur raisonne en **nombre d'équipes**.

```text
FAÇADE                             INTERNE (code, base, journaux)
« Combien d'équipes ? »            team_credits
« 3 équipes — 29,97 €/mois »       quantity = 3
« Ajouter une équipe »             quantity 2 → 3
```

Deux raisons : la lisibilité, et la non-confusion avec les **crédits tournoi**, qui
existent déjà et sont des achats consommables à usage unique (§9).

**Le libellé Stripe est visible du client** — nom du produit et *nickname* du prix
apparaissent sur les factures et dans le portail. Le produit doit s'appeler
« Équipe Clubero », jamais « Crédit ». Une facture « 3 × Crédit » serait incompréhensible.

Clés i18n : `pricing.teams.*`, jamais `pricing.credits.*`.

### 1.2 Staff et coaches — illimités dans toutes les offres

**Une équipe souscrite est une place d'équipe, jamais un utilisateur.** Une équipe peut
avoir 1, 3 ou 12 coaches sans aucune incidence sur la facturation.

Le staff n'entre **jamais** dans le quota de 30 joueurs : les lignes `team_members` du
staff ont `player_id IS NULL`, seules les lignes joueur sont comptées (§6.2).

### 1.3 Limite de joueurs : 30

Clubero est multisport, et 25 exclurait des effectifs normaux :

```text
Rugby à XV      effectif courant 30 à 35   ← 25 rendrait l'offre inutilisable
Football senior            20 à 25
Football jeune             16 à 20
Handball, basket, volley   12 à 16
```

L'unité vendue est l'équipe, pas le joueur : la limite n'existe que pour empêcher qu'un
club entier tienne dans une seule équipe. Valeur portée par `TEAM_PLAN_MAX_PLAYERS`,
modifiable **sans migration**.

⚠️ `src/locales/fr/marketing.json:1079` annonce « 30 jours sans carte bancaire, pour une
équipe jusqu'à **25 membres** », alors que le code donne **14 jours** et **aucune limite**.
La copie et le code divergent déjà. **La FAQ doit passer à 30 joueurs dans les 7 locales**,
en même temps que le code passe à 30 jours.

---

## 2. Modèle technique — une seule colonne, quatre états

```sql
ALTER TABLE public.subscriptions
  ADD COLUMN team_credits int NULL
  CHECK (team_credits IS NULL OR team_credits BETWEEN 1 AND 4);
```

Les quatre situations s'expriment avec les concepts existants :

| Situation | `status` | `team_credits` |
|---|---|---|
| Essai Équipe | `trialing` | `1` |
| Essai Club | `trialing` | `NULL` |
| Payant Équipe | `active` | `1` à `4` |
| Payant Club | `active` | `NULL` |

**Séparation nette des rôles :**

```text
team_credits  → CAPACITÉS   (combien d'équipes, combien de joueurs, tournois, stages)
status        → ACCÈS       (essai, actif, impayé, expiré)
```

`team_credits IS NOT NULL` → quota d'équipes, 30 joueurs max par équipe, ni tournois ni
stages.
`team_credits IS NULL` → équipes et joueurs illimités, tournois et stages.

**Tous les clubs existants prennent `NULL`** → formule Club → comportement strictement
inchangé. Migration additive, sans backfill.

Constantes serveur, configurables sans migration :

```text
TEAM_CREDIT_MAX          = 4
TEAM_PLAN_MAX_PLAYERS    = 30
TRIAL_DURATION_DAYS      = 30
```

### Ce qui n'est PAS créé

Pas de `team_subscriptions`. Pas de `billing_delegates`. Pas de couverture par équipe. Pas
de moteur générique d'entitlements. Pas de saga de migration. Pas de `team_members.status`.

`subscriptions` conserve sa contrainte **UNIQUE sur `club_id`**, et
`club_has_active_subscription()` conserve **exactement** sa sémantique.

**La simplicité de cette architecture est son principal avantage** — ne pas introduire de
système générique pour résoudre un problème que deux colonnes suffisent à décrire.

---

## 3. Pourquoi ce modèle élimine le risque

Le chantier précédent était risqué parce qu'un club pouvait avoir des équipes couvertes
différemment. Cette **couverture partielle** imposait un contrôle d'accès par équipe, donc
la réécriture des RLS.

Ici, **un club a un abonnement ou n'en a pas**. Aucune couverture partielle. Le
verrouillage existant, au niveau club, suffit.

| Composant | Effet |
|---|---|
| `subscriptions` (UNIQUE `club_id`) | inchangé |
| `club_has_active_subscription()` | **inchangée** |
| Garde de `src/routes/_authenticated.tsx` | **inchangée** |
| `useTournamentOnlyMode` | **inchangé** |
| Webhook `upsert(onConflict: "club_id")` | conservé, **une branche ajoutée** (§10) |
| `billing.functions.ts` (« club admin ») | inchangé — le coach est l'admin de son club |
| `trial-banner.tsx`, `has-paid-access`, superadmin | inchangés |
| Policies RLS existantes | **aucune refonte** — deux ajouts ciblés (§8, §9) |

**Confirmation demandée au §15.8 : ces changements ne nécessitent ni couverture partielle
ni refonte globale des RLS.** Les seuls ajouts RLS sont deux policies ciblées, sur
`club_camps` (INSERT) et sur les chemins de quota — aucune policy existante n'est réécrite.

---

## 4. Onboarding — deux parcours explicites

Avant la création de l'espace, l'utilisateur choisit :

> **Comment souhaitez-vous utiliser Clubero ?**
> [ Gérer une ou plusieurs équipes ] [ Gérer un club ]

Ce choix détermine le type d'essai créé. **Ne jamais le déduire automatiquement** du
nombre d'équipes créées ensuite.

### 4.1 Comment le trigger apprend le choix

Le trigger `auto_create_trial_subscription` est `AFTER INSERT ON public.clubs` : il ne
connaît que la ligne `clubs` insérée. Il faut donc porter l'intention **sur cette ligne**.

```sql
ALTER TABLE public.clubs
  ADD COLUMN plan_intent text NOT NULL DEFAULT 'club'
  CHECK (plan_intent IN ('team', 'club'));
```

Le trigger devient :

```text
IF NEW.is_personal THEN RETURN NEW              -- inchangé
IF NEW.name LIKE '__rls_%' OR '__e2e_%' THEN RETURN NEW   -- inchangé

INSERT INTO subscriptions (club_id, status, trial_end, team_credits)
VALUES (NEW.id, 'trialing', now() + TRIAL_DURATION_DAYS,
        CASE WHEN NEW.plan_intent = 'team' THEN 1 ELSE NULL END)
ON CONFLICT (club_id) DO NOTHING
```

**`DEFAULT 'club'` est le choix décisif de compatibilité ascendante.** Tous les chemins de
création existants — onboarding club actuel (`_authenticated.tsx:248`), parcours
organisateur de tournoi (`TournamentUpgradeCard.tsx:39`), superadmin, scripts,
`get_or_create_personal_club` — n'écrivent pas cette colonne et obtiennent donc un essai
Club, c'est-à-dire **exactement le comportement actuel**.

Seul le nouveau parcours « gérer une ou plusieurs équipes » écrit `plan_intent = 'team'`.

**Note de confiance.** `plan_intent` est écrit côté client (le club est créé par un insert
direct). Ce n'est pas un problème de sécurité : les deux essais sont gratuits et de même
durée, et un utilisateur qui voudrait l'essai Club n'a qu'à cliquer sur « Gérer un club ».
Le seul enjeu réel est l'unicité de l'essai (§5), qui est traitée à part.

**Alternative écartée** : laisser le trigger créer un essai Club puis corriger
`team_credits` depuis la server function d'onboarding. Cela fonctionnerait, mais crée une
fenêtre où le club dispose d'un essai Club complet, et deux écritures là où une suffit.

### 4.2 Passage Essai Équipe → Club

CTA « Passer à Clubero Club » disponible pendant tout l'essai Équipe. L'utilisateur
souscrit l'offre Club ; à confirmation Stripe, `team_credits → NULL` et les limitations
disparaissent. **Toutes les données sont conservées** — même club, même `club_id`, aucune
migration. Le prorata éventuel est calculé par Stripe.

---

## 5. Éligibilité aux essais — anti-abus

### 5.1 Trou existant, à documenter

Aujourd'hui, le trigger crée un essai pour **chaque** club non-personnel créé, sans aucune
mémoire par utilisateur. Un même compte peut donc créer autant de clubs que voulu, chacun
avec son essai. **C'est un trou préexistant**, indépendant de ce chantier.

Avec deux parcours d'essai, il devient exploitable de façon plus visible : essai Équipe de
30 jours, puis nouveau club en essai Club de 30 jours.

### 5.2 Mécanisme minimal proposé — aucune table nouvelle

`clubs.created_by` existe déjà. L'éligibilité est donc **dérivable** :

```text
un utilisateur est éligible à un essai
  s'il n'a jamais créé de club possédant une ligne subscriptions
```

Dans le trigger :

```sql
IF EXISTS (
  SELECT 1 FROM public.clubs c
  JOIN public.subscriptions s ON s.club_id = c.id
  WHERE c.created_by = NEW.created_by AND c.id <> NEW.id
) THEN
  RETURN NEW;   -- pas d'essai : le club devra souscrire
END IF;
```

Le club est alors créé sans souscription, donc verrouillé par la garde existante, avec
redirection de l'admin vers la facturation — comportement déjà en place, aucun écran neuf.

### 5.3 Décision requise avant activation

Ce contrôle **change le comportement actuel** : un administrateur légitime créant un
second club réel n'aurait plus d'essai. Trois options :

| Option | Effet |
|---|---|
| **A** — activer le contrôle | Ferme le trou. Un admin multi-clubs légitime perd l'essai sur ses clubs suivants |
| **B** — ne rien changer | Le trou reste ; les deux essais sont cumulables |
| **C** — activer avec exception superadmin | Ferme le trou, permet une régularisation manuelle au cas par cas |

**Recommandation : C.** Le cas « une personne administre réellement plusieurs clubs » est
rare et se traite par le support, alors que le cumul des essais est trivial à exploiter.

Ce changement part dans une **release dédiée**, séparée du reste du Lot 1, avec un
inventaire préalable des comptes actuellement porteurs de plusieurs clubs.

---

## 6. Règles de capacité

### 6.1 Création d'équipe

Refusée si le club a déjà `team_credits` équipes non archivées.

Contrôle **atomique** : verrou sur la ligne `clubs`, comptage, décision, insertion dans la
même transaction. **Le quota est résolu avant le verrou** — si `team_credits IS NULL`
(Club, essai Club inclus), aucun verrou n'est pris et aucun comptage n'est fait.

> Vous gérez déjà vos 3 équipes. Ajoutez une équipe pour 9,99 €/mois, ou passez à la
> formule Club pour un nombre d'équipes illimité.

Pendant l'essai Équipe (`team_credits = 1`), le message oriente vers la souscription :

> L'essai vous permet de gérer une équipe. Souscrivez pour en ajouter d'autres.

### 6.2 Limite de joueurs

30 joueurs actifs par équipe quand `team_credits IS NOT NULL` ; aucune limite sinon.

Même stratégie atomique, même règle d'ordre : quota résolu avant le verrou, donc **coût
nul pour les clubs en formule Club**.

Prédicat de comptage — **sans nouvelle colonne**, le schéma actuel suffit :

```sql
team_members.team_id = :team_id
AND team_members.player_id IS NOT NULL   -- ligne joueur, pas staff
AND players.deleted_at IS NULL
```

Retirer un joueur de l'effectif supprime sa ligne `team_members` ; l'historique des
convocations, présences et compositions référence `player_id` et `event_id` directement,
il n'est donc pas affecté.

Chemins à protéger, tous via la même RPC : création manuelle, import CSV, rattachement
d'un joueur existant, acceptation d'une invitation joueur, transfert entre équipes.

L'import CSV est un **lot atomique** : refus intégral si le lot dépasserait la limite, en
ne comptant comme consommatrices que les créations et réactivations réelles (ni les
doublons, ni les mises à jour).

### 6.3 Réduction du nombre d'équipes

**Possible uniquement si le nombre d'équipes non archivées est déjà inférieur ou égal au
nouveau nombre souscrit.**

> Vous avez 3 équipes actives et souhaitez n'en conserver que 2. Archivez d'abord une
> équipe.

L'alternative — laisser passer et verrouiller les équipes en excédent — **ressusciterait
la couverture partielle**, donc toute la complexité éliminée. Elle est exclue.

### 6.4 Downgrade Club → formule par équipe

Recevable, y compris à l'issue d'un essai Club. Refusé si les données ne sont pas
compatibles avec l'offre visée :

```text
plus de N équipes non archivées (N = équipes souscrites)  → refus
une équipe de plus de 30 joueurs actifs                   → refus
au moins un stage non archivé                             → refus
au moins un tournoi non archivé                           → refus
```

Message précisant **exactement** ce qui bloque et ce qu'il faut archiver ou régulariser.

**Ne jamais sélectionner arbitrairement les équipes à conserver. Ne jamais créer de
couverture partielle.**

---

## 7. Audit des fonctionnalités « Club » — résultat

> Demandé au §15.5 : vérifier que la matrice pricing corresponde aux blocages réellement
> appliqués. **Une fonctionnalité ne doit jamais apparaître ❌ dans le pricing tout en
> restant utilisable dans le produit.**

### 7.1 Constat de départ

**Aucune route club ne possède aujourd'hui de garde d'abonnement.** Les écrans
`/admin/*` sont gardés par **rôle uniquement**. La seule garde de plan existante est
`can_create_tournament`. Et `/admin` figure dans `CLUB_LOCKED_ALLOWED`, donc reste
accessible même quand le club est verrouillé.

Bloquer une fonctionnalité « Club » signifie donc **construire une garde qui n'existe
pas**, à chaque fois.

### 7.2 Fonctionnalité par fonctionnalité

| Annoncée ❌ en V2 | Réalité constatée | Verdict |
|---|---|---|
| **Statistiques consolidées du club** | **N'existe pas.** `/admin/index.tsx` est un hub de navigation ; le seul tableau de bord est `payments/dashboard`, qui relève de Stripe Connect (paiements des membres), une autre fonctionnalité | **Retirer de la matrice** — on ne peut pas exclure ce qui n'existe pas |
| **Documents communs du club** | **N'existe pas.** Aucune table de documents au niveau club : seulement `club_camp_documents`, `tournament_documents`, `club_publication_documents` (pièces jointes de publications) | **Retirer de la matrice** |
| **Mur général du club** | Pas un écran distinct : le mur est un flux unique avec un `AudiencePicker` partagé, ciblant équipes et groupes. Le bloquer signifie retirer une option d'audience **à l'intérieur d'un composant partagé** | **Ne pas bloquer** — coût élevé, fragile, gain nul pour 1 à 4 équipes |
| **Communication globale** | Même mécanisme d'audience, plus `settings.communications` qui écrit sur `clubs` | **Ne pas bloquer** |
| **Gestion centralisée des membres** | `/admin/users.index.tsx`. Pour un club de 1 à 4 équipes, c'est **la** page de gestion des membres | **Ne pas bloquer** — un client payant doit pouvoir gérer ses membres |
| **Groupes transverses** | Existe réellement : `/admin/groups.tsx`, tables `club_groups` / `club_group_members`, `src/modules/groups/` | **Ne pas bloquer** — c'est la seule candidate crédible, mais des groupes transverses sur 1 à 4 équipes ont une valeur marginale, et la garde coûterait plus que le gain |
| **Tournois** | `can_create_tournament` existe et contrôle déjà l'abonnement | **Bloquer** (§8) |
| **Stages** | Module complet, **aucune garde de plan** | **Bloquer** (§9) |

### 7.3 Décision

**Seuls les tournois et les stages sont bloqués en formule par équipe.**

Les différenciateurs commerciaux de l'offre Club deviennent, et ce sont de vrais
différenciateurs vérifiables :

```text
Nombre d'équipes    1 à 4        vs  illimité
Joueurs par équipe  30           vs  illimité
Tournois            non          vs  oui
Stages              non          vs  oui
```

C'est honnête, applicable, et cela évite six gardes à construire pour un gain commercial
nul. **La matrice pricing du §11 est corrigée en conséquence.**

---

## 8. Tournois

```text
team_credits IS NOT NULL  → création et administration INTERDITES
team_credits IS NULL      → autorisées (essai Club inclus)
```

⚠️ **Ne jamais écrire une règle du type `status = 'trialing'` → tournoi interdit.** Ce
serait faux : l'essai Club donne accès aux tournois. Le critère est `team_credits`, jamais
le statut.

La **participation** d'une équipe à un tournoi tiers reste possible selon les flux
existants ; seules la création et l'administration sont bloquées.

Une seule fonction SQL existante concernée : `can_create_tournament`, qui contrôle déjà
l'abonnement. Écran d'upsell vers les offres tournoi existantes — jamais d'erreur ni de
page vide.

---

## 9. Stages — garde à créer

```text
team_credits IS NOT NULL  → création et duplication INTERDITES
team_credits IS NULL      → autorisées (essai Club inclus)
```

### 9.1 Différence structurelle avec les tournois

| | Tournois | Stages |
|---|---|---|
| Garde de création | `can_create_tournament(_user_id)` — **contrôle l'abonnement** | **aucune garde d'abonnement** |
| Garde existante | — | `can_manage_club_camp(_camp_id, _user_id)` — **rôle seul**, exige un camp existant |
| Création | — | `camps.functions.ts:191` (création) et `:607` (duplication), gardées par `assertClubRole(MANAGER_ROLES)` uniquement, écriture via `supabaseAdmin` |
| Policy RLS INSERT `club_camps` | — | rôle seul, contournée par `supabaseAdmin` |

`can_manage_club_camp` **ne peut pas servir de garde de création** : elle prend un
`_camp_id` qui n'existe pas encore.

Aujourd'hui cela ne se voit pas : un club sans abonnement est verrouillé globalement.
**Mais un club en formule par équipe a un abonnement actif** — le verrou le laisse passer,
et les stages lui seraient entièrement accessibles.

### 9.2 Trois couches

1. **Server functions** — contrôle `team_credits IS NULL` sur les deux chemins de
   `camps.functions.ts` (`:191`, `:607`), à côté de l'`assertClubRole` existant. **Couche
   décisive**, les écritures passant par `supabaseAdmin`.
2. **Policy RLS INSERT sur `club_camps`** — même contrôle, défense en profondeur.
3. **Interface** — masquer l'entrée Stages, écran d'upsell, jamais de page vide.

`can_manage_club_camp` **reste inchangée** : si la création est bloquée, il n'y a pas de
stage à gérer, et la modifier risquerait de verrouiller un club en pleine saison lors d'un
changement de formule.

Compatibilité ascendante : les clubs existants ont `team_credits = NULL`, le contrôle les
laisse passer.

---

## 10. Stripe — la branche du webhook

La source de vérité est Stripe. `subscriptions.team_credits` en est le miroir.

### 10.1 Le routage se fait sur le prix, jamais sur la quantité

⚠️ **Correction d'une formulation trop optimiste de la V2**, qui laissait entendre
qu'aucune branche n'était nécessaire. Une branche existe, petite mais réelle :

```text
price_id ∈ { TEAM_MONTHLY, TEAM_YEARLY }  → team_credits = subscription_item.quantity
price_id ∈ { CLUB_MONTHLY, CLUB_YEARLY }  → team_credits = NULL
price_id inconnu                          → ne pas toucher team_credits, journaliser
```

**Ne jamais déduire la formule de `quantity` seule.** Une souscription Club a typiquement
`quantity = 1`, ce qui ne signifie évidemment pas `team_credits = 1`. Confondre les deux
transformerait un client Club en client mono-équipe.

Le dépôt possède déjà `planFromStripePriceId` / `planFromPriceId` : la nouvelle fonction
suit le même motif, par exemple `teamCreditsFromPrice(priceId, quantity)`.

Cette branche doit être **documentée et testée**, pas seulement écrite.

### 10.2 Opérations

```text
checkout Équipe → line_items: [{ price: PRIX_ÉQUIPE, quantity: N }]
ajout d'équipe  → modification de quantity sur l'item existant
passage Club    → changement de price sur l'item existant, quantity 1, team_credits → NULL
```

Le prorata est calculé **par Stripe**, jamais en interne.

### 10.3 Ne pas copier la mécanique des tournois

Le modèle mental vient des tournois, mais leur implémentation est d'une autre nature :
`tournament_passes` et `consume_single_entitlement` gèrent des achats **consommables à
usage unique**.

Les équipes souscrites sont des **places récurrentes** : on ne les consomme pas, on les
occupe, et elles se libèrent à l'archivage. La `quantity` Stripe suffit — pas de registre
à réconcilier.

---

## 11. Page pricing — matrice corrigée

**Exigence : l'utilisateur voit ce qui est inclus ET ce qui ne l'est pas.** Une
fonctionnalité absente doit être marquée ❌, pas simplement omise. Le motif actuel
(`pricing.clubFeatures` via `returnObjects`, une liste par carte) ne permet pas de montrer
une exclusion : il faut un **tableau à lignes communes**.

| | Essai Équipe | Par équipe | Essai Club | Club |
|---|---|---|---|---|
| **Prix** | Gratuit 30 j | 9,99 €/mois par équipe | Gratuit 30 j | 49 €/mois |
| | sans carte | 99,99 €/an par équipe | sans carte | 490 €/an |
| **Équipes** | 1 | 1 à 4 | Illimitées | Illimitées |
| **Joueurs par équipe** | 30 | 30 | Illimités | Illimités |
| **Coaches et staff** | Illimités | Illimités | Illimités | Illimités |
| Gestion d'équipe | ✅ | ✅ | ✅ | ✅ |
| Événements, entraînements, matchs | ✅ | ✅ | ✅ | ✅ |
| Convocations et réponses | ✅ | ✅ | ✅ | ✅ |
| Présences et compositions | ✅ | ✅ | ✅ | ✅ |
| Disponibilités joueurs et staff | ✅ | ✅ | ✅ | ✅ |
| Mur, sondages, documents, calendrier | ✅ | ✅ | ✅ | ✅ |
| Parents et responsables légaux | ✅ | ✅ | ✅ | ✅ |
| Import de joueurs | ✅ | ✅ | ✅ | ✅ |
| Groupes et communication du club | ✅ | ✅ | ✅ | ✅ |
| Gestion des membres | ✅ | ✅ | ✅ | ✅ |
| **Tournois** | ❌ | ❌ | ✅ | ✅ |
| **Stages** | ❌ | ❌ | ✅ | ✅ |

> Aucune ligne ❌ qui ne corresponde à un blocage réellement appliqué (§7). L'absence de
> limite en formule Club s'écrit « Illimités », **jamais précédé d'un ❌** — ce serait
> suggérer une fonctionnalité manquante alors que c'est l'avantage.

Au-delà de 4 équipes :

> À partir de 5 équipes, l'offre Club à 49 €/mois est plus avantageuse et vous donne accès
> à l'ensemble des fonctionnalités Clubero.

### 11.1 Conséquence i18n

Une clé **par ligne**, les valeurs (✅/❌/nombres) portées par une structure TypeScript
unique. Seules les étiquettes sont traduites : le volume de clés est divisé par quatre, et
une colonne ne peut pas diverger d'une langue à l'autre.

**7 locales**, `bun run check:i18n` vert avant merge. Couverture de `nl` à vérifier.

---

## 12. Travaux

### Migrations — une à la fois, release isolée

1. `subscriptions.team_credits` + `CHECK` — additive.
2. `clubs.plan_intent` + `CHECK`, `DEFAULT 'club'` — additive.
3. Trigger `auto_create_trial_subscription` : 14 → 30 jours **et** lecture de
   `plan_intent`. **Release dédiée.**
4. Trigger : contrôle d'éligibilité à l'essai (§5.3, option retenue). **Release dédiée
   distincte de la 3.**
5. `can_create_tournament` + contrôle `team_credits IS NULL`. **Release dédiée, via `_v2`
   comparée avant substitution.**
6. Policy RLS INSERT sur `club_camps`. **Release dédiée.**
7. RPC de création d'équipe (quota).
8. RPC d'ajout de joueur et d'import (limite).

### Server functions

- `camps.functions.ts` : contrôle sur les deux chemins de création — **couche décisive**.
- Checkout Équipe avec `quantity`, ajout/retrait d'équipe, garde de réduction (§6.3).
- Garde de downgrade (§6.4).
- Webhook : `teamCreditsFromPrice(priceId, quantity)` (§10.1).

### Interface

- Choix du parcours à l'onboarding (§4).
- Sélecteur « Combien d'équipes souhaitez-vous gérer ? » au checkout, tarif calculé.
- Page de facturation : équipes utilisées / disponibles, ajout, retrait, upsell Club à 4.
- Blocages : création d'équipe au-delà du nombre souscrit, ajout de joueur au-delà de 30,
  upsell tournoi, upsell stages, refus de réduction et de downgrade.
- Page pricing refondue (§11), i18n 7 locales.

---

## 13. Tests

**Parcours d'essai**

- Onboarding « équipes » → `plan_intent='team'` → `trialing`, `team_credits=1`.
- Onboarding « club » → `plan_intent='club'` → `trialing`, `team_credits=NULL`.
- Chemins de création existants sans `plan_intent` → essai Club, **comportement actuel**.
- Essai Club : création de tournoi **autorisée**, création de stage **autorisée**.
- Essai Équipe : tournoi et stage **refusés**, 2ᵉ équipe **refusée**.
- Éligibilité : second club du même créateur → pas de nouvel essai (option retenue §5.3).

**Concurrence** (deux transactions réelles simultanées)

- Deux créations d'équipe sur la dernière place (2/3 équipes, `team_credits = 3`) → une
  seule réussit, jamais 4.
- Deux ajouts de joueur simultanés à 29/30 → une seule opération réussit, effectif final
  30, jamais 31.
- Club (`team_credits IS NULL`) : deux ajouts simultanés → les deux réussissent, **aucun
  verrou pris**.
- Import de 10 lignes sur une équipe à 25/30 → lot entièrement rejeté, effectif inchangé.

**Stripe**

- Prix Équipe, `quantity = 3` → `team_credits = 3`.
- Prix Club, `quantity = 1` → `team_credits = NULL` — **jamais 1**.
- Prix inconnu → `team_credits` inchangé, événement journalisé.
- Changement de quantité, passage Club, rejeu de webhook (idempotence).

**Régression**

- Club existant (`team_credits NULL`) : comportement strictement inchangé, aucun verrou.
- Tournoi : formule par équipe refusée ; Club actif autorisé ; entitlement tournoi
  conservé.
- Stage : formule par équipe → création **et duplication** refusées, par la server function
  **et** par la policy RLS testée séparément.
- Downgrade refusé si stages, tournois, trop d'équipes ou équipe de plus de 30 joueurs.

---

## 14. Lots et discipline de déploiement

**Lot 1 — Modèle, essais, quotas**
`team_credits`, `plan_intent`, trigger (durée puis intention, releases séparées), RPC de
quota équipes et joueurs, tests de concurrence et de caractérisation.
→ **Arrêt et revue humaine.**

**Lot 2 — Stripe, modules Club, interface**
Prix et checkout avec quantité, branche webhook, gestion du nombre d'équipes, gardes de
réduction et de downgrade, contrôle tournoi et contrôle stages (releases dédiées),
onboarding à deux parcours, page pricing, i18n.

**Discipline conservée :**

- **R1** — une migration sensible à la fois, déploiement isolé, 24 à 48 h d'observation.
- **Ajouter avant remplacer** — `can_create_tournament_v2` comparée sur cas réels avant
  substitution ; ancienne définition conservée pour la migration de retour.
- **Contrat de rollback** par changement sensible : migration aller, migration de retour
  écrite et testée, vérification avant, vérification après, condition d'arrêt, métrique,
  procédure de restauration.
- **Feature flag** `team_credits_v1` masquant onboarding, pricing, checkout et gestion des
  équipes — sans jamais désactiver webhooks, synchronisation Stripe ni lecture des
  souscriptions existantes.
- **Arrêt et revue humaine** entre les lots.

---

## 15. Dette préexistante, indépendante

**Bug `exempt_until`.** `club_has_active_subscription`
(`20260622120000_…sql:36`) teste `exempt_from_billing = true` sans regarder `exempt_until`,
alors que `isBillingExempt` (`src/lib/has-paid-access.ts:22-25`) l'honore. Une exemption
expirée donne encore accès. **Plus un prérequis** de ce chantier — à corriger sur son
propre calendrier, après inventaire et régularisation, dans une release dédiée.

**Dette CI.** Corriger les contrôles bloquants (dont `check:i18n`) avant de s'en servir
comme critères de sortie ; baseline chiffrée pour la dette réellement indépendante.

**Incohérence marketing.** 30 jours et 30 joueurs annoncés vs 14 jours et aucune limite en
code — résolue par le Lot 1 et la refonte pricing.

**Cumul d'essais.** Trou préexistant (§5.1), traité en release dédiée.

---

## 16. Décisions actées

```text
ONBOARDING       deux parcours explicites : Équipe ou Club, choisis avant création

ESSAI ÉQUIPE     30 j · sans CB · 1 équipe · 30 joueurs · staff illimité
                 tournois NON · stages NON

ESSAI CLUB       30 j · sans CB · illimité · TOUTES fonctionnalités
                 tournois OUI · stages OUI · aucune restriction de plan

OFFRE ÉQUIPE     9,99 €/mois ou 99,99 €/an par équipe · 1 à 4 équipes
                 30 joueurs par équipe · staff illimité · tournois NON · stages NON

OFFRE CLUB       49 €/mois ou 490 €/an · illimité · tournois OUI · stages OUI

ARCHITECTURE     team_credits 1..4 → mode Équipe ; NULL → mode Club
                 status → accès ; team_credits → capacités
                 clubs.plan_intent porte le choix jusqu'au trigger (DEFAULT 'club')

PLAFOND          4 équipes maximum ; à partir de 5 → offre Club

DOWNGRADE        jamais de couverture partielle
                 mise en conformité obligatoire avant réduction ou downgrade

BLOCAGES         seuls les tournois et les stages sont bloqués (§7)
                 critère = team_credits, JAMAIS status = 'trialing'

STRIPE           price_id détermine la formule ; quantity ne vaut que pour le prix Équipe
                 Club → team_credits NULL même avec quantity = 1

TERMINOLOGIE     « crédit » strictement interne
                 interface, marketing, Stripe, factures = « équipe »
```

**Aucune décision produit ne reste ouverte**, hormis le choix d'option au §5.3
(éligibilité aux essais — recommandation : option C).
