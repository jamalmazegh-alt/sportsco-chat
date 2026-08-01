# Docuthèque — onglet « Documents » du mur

> **Statut :** V1 livrée — code, ouverture native Android/iOS et tests (unitaires, RLS, e2e)
> écrits. Les suites RLS et e2e ne peuvent s'exécuter que contre un Supabase réel : elles
> tourneront à la livraison, cf. §9.
> **Origine :** demande club (ticket support Nicolas CLAVIER, 01/08/2026) — _« créer une
> docuthèque avec les documents publiés sur le mur (programmes de reprise, calendrier,
> notes d'information, etc.) »_.
> **Fichiers concernés :** `src/components/attachments.tsx`, `src/components/wall-documents.tsx`,
> `src/components/wall-feed.tsx`, `src/lib/wall/documents.ts`, `src/lib/open-document.ts`,
> `src/routes/_authenticated/inbox.tsx`, `src/routes/_authenticated/teams/$teamId_.staff.tsx`,
> `src/routes/_authenticated/events.tsx` (référence visuelle).

## 1. Objet et parti pris V1

Rendre retrouvables les documents publiés sur le mur, sans faire défiler des mois de
publications. Un parent qui cherche le programme de reprise publié en août doit le trouver
en deux clics.

**Quatre décisions structurent la V1 :**

1. **Pas de module indépendant.** La docuthèque est un onglet `Documents` sur les murs
   existants — une seconde vue sur les mêmes données.
2. **Pas de nouvelle logique de partage.** Chaque document hérite de la visibilité du post
   qui le porte, garantie par la RLS `wall_posts_select` déjà en place.
3. **Un nom, pas une catégorie.** À la publication, l'auteur nomme chaque fichier
   (« Programme de reprise »). Ce nom s'affiche accolé au nom de fichier. Pas de liste
   fermée de catégories, pas de taxonomie à maintenir.
4. **Pas de filtres, pas de recherche en V1.** Une liste groupée par mois, la plus récente
   en haut, sur le modèle visuel de la page Événements.

## 2. État de l'existant (vérifié dans le code)

### 2.1 Stockage des pièces jointes

Les pièces jointes du mur sont dans la colonne **`wall_posts.attachments`** (`jsonb`,
tableau d'objets), sérialisées par `AttachmentPicker` (`src/components/attachments.tsx`) :

```ts
type Attachment = {
  url: string; // URL publique Supabase Storage
  path: string; // `${user.id}/${prefix}/${timestamp}-${safeName}`
  name: string; // nom du fichier d'origine
  type: string; // MIME
  size: number; // octets
};
```

Contraintes déjà en place : bucket **`attachments`** (public), 10 Mo max par fichier,
**4 pièces jointes max** par post, allowlist MIME stricte (images, PDF, Word, Excel, txt,
csv) avec repli par extension.

**Rien à migrer** : tous les documents déjà publiés sont exploitables en l'état — ils
n'auront simplement pas de nom (§4.2).

### 2.2 Surfaces « mur » réellement existantes

Il n'existe **pas** de « mur d'équipe » comme surface distincte :

| Surface          | Route                  | Rendu                                      |
| ---------------- | ---------------------- | ------------------------------------------ |
| Mur du club      | `/inbox`               | `<WallFeed clubId={activeClubId} />`       |
| Mur staff équipe | `/teams/$teamId/staff` | `<WallFeed clubId staffTeamId={teamId} />` |

Le ciblage par équipe se fait **par publication** (`audience_type` ∈
`club | team | multi_team | group | team_staff` + `audience_team_ids` /
`audience_group_ids`, `wall-feed.tsx:55`). Le mur du club n'affiche donc déjà à chaque
membre que ce qui le concerne.

### 2.3 Sécurité et modération déjà acquises

- `wall_posts_select` (RLS) filtre par club **et** par audience. Une requête docuthèque sur
  `wall_posts` hérite du filtrage sans code supplémentaire.
- `deleted_at` (suppression) et `hidden_at` (modération) existent ; `wall-feed.tsx:172`
  n'expose les posts masqués qu'aux rôles `admin` / `dirigeant`.
- Index disponibles : `idx_wall_posts_club (club_id, created_at DESC)`,
  `idx_wall_posts_club_pinned`, `idx_wall_posts_audience_teams`,
  `idx_wall_posts_audience_groups`.

### 2.4 `AttachmentPicker` est partagé — contrainte forte

Le composant est utilisé à **6 endroits** :

| Usage                                         | `prefix`        |
| --------------------------------------------- | --------------- |
| Composer du mur (`wall-feed.tsx:1117`)        | `wall`          |
| Chat d'événement (`event-chat.tsx:293`)       | `chat/$eventId` |
| Fiche événement (`event-form-sheet.tsx:1095`) | `events`        |
| Tournois — wizard, teams manager (×3)         | divers          |

> **Conséquence :** l'obligation de nommer un fichier doit être **opt-in par usage**. Imposer
> un nom dans le chat d'événement rendrait l'envoi d'une photo pénible. Voir §5.1.

### 2.5 Modèle visuel de référence : la page Événements

`events.tsx:329-340` groupe par mois (`Map` clé `YYYY-MM`, label `MMMM yyyy` localisé) et
`events.tsx:860-866` rend chaque groupe en `<section>` avec un titre **sticky**. Chaque
ligne (`renderEventItem`, `events.tsx:396`) est une carte `rounded-2xl border` avec un bloc
date de 64 px à gauche (jour de semaine / quantième / heure) et le contenu à droite.

C'est ce **pattern** qui est réutilisé (§4.3) — pas le composant lui-même, qui est un
`<Link>` vers `/events/$eventId` truffé de logique match (score, défaite, annulation).

**Différence assumée :** la page Événements trie en **ascendant** (`events.tsx:138`), parce
qu'elle regarde vers l'avenir. Les documents sont des éléments passés : la docuthèque trie
en **descendant** (le plus récent en haut). Même habillage, sens inverse.

## 3. Périmètre V1

### Dans le périmètre

- Onglet `Documents` sur le mur du club et sur le mur staff d'équipe.
- Nom obligatoire à la publication d'une pièce jointe **sur le mur uniquement**.
- Liste groupée par mois, tri anti-chronologique, habillage de la page Événements.
- Ouverture / téléchargement + lien « Voir la publication ».
- i18n sur les 7 langues, support mobile Capacitor.

### Hors périmètre (→ §8)

Recherche, filtres, catégories fermées, tri alternatif, renommage a posteriori, dépôt de
document hors publication, documents du système `club_publications`, passage du bucket en
privé.

## 4. Spécification fonctionnelle

### 4.1 Navigation

Sur `/inbox` et `/teams/$teamId/staff`, deux onglets en tête de page :

```
[ Mur ]  [ Documents ]
```

- `Mur` : le `WallFeed` actuel, **inchangé**, onglet par défaut.
- Onglet actif porté par la query string (`?tab=documents`) : lien partageable, retour
  navigateur fonctionnel. Le schéma zod de `/inbox` (qui valide déjà `post` et `from`) est
  étendu.
- **Règle de priorité :** si `?post=<uuid>` est présent (deep-link push), l'onglet `Mur`
  l'emporte sur `?tab` — le scroll et le surlignage existants (`inbox.tsx:47-62`) doivent
  continuer de fonctionner sans régression.

### 4.2 Nommer un document à la publication

Le flux actuel téléverse le fichier **dès sa sélection** (`attachments.tsx:100`), puis garde
les métadonnées en state jusqu'à la publication. On ne modifie pas ce flux : le nom est saisi
**après l'upload, avant la publication**.

- Sous chaque pièce jointe fraîchement ajoutée, un champ texte : « Nom du document ».
- Le bouton **Publier** est désactivé tant qu'une pièce jointe n'a pas de nom, avec un
  message explicite (pas un bouton grisé muet).
- Contraintes : obligatoire, `trim()` non vide, **80 caractères max**, texte libre.
- Ce champ n'apparaît **que** dans le composer du mur. Les 5 autres usages de
  `AttachmentPicker` sont inchangés (§2.4).

**Affichage, nom accolé au fichier :**

```
Programme de reprise · programme_reprise_2026.pdf
└─ nom saisi (principal)   └─ nom de fichier (secondaire, atténué)
```

**Rétrocompatibilité :** les pièces jointes déjà publiées n'ont pas de nom. Elles s'affichent
avec le seul nom de fichier — pas de « Sans titre », pas de badge « non classé ». Elles sont
listées normalement dans la docuthèque.

### 4.3 L'onglet Documents

Liste **groupée par mois**, mois le plus récent en premier, documents décroissants à
l'intérieur du mois. Titre de mois sticky, comme `events.tsx:861`.

Chaque ligne :

| Zone           | Contenu                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| Bloc date (g.) | jour de semaine / quantième — icône du type de fichier au lieu de l'heure |
| Ligne 1        | **Nom saisi** (ou nom de fichier si absent)                               |
| Ligne 2        | nom de fichier · taille · auteur                                          |
| Badge          | « Masqué » si `hidden_at` non nul (visible admin/dirigeant seulement)     |

Actions : **toucher la ligne** → ouvre / télécharge le document (comportement de
`AttachmentList` réutilisé) ; action secondaire **« Voir la publication »** → onglet `Mur`
avec `?post=<id>`.

`is_pinned` n'est **pas** repris : un post épinglé ne remonte pas son document en tête de
docuthèque.

### 4.4 États

- **Chargement** : skeleton cohérent avec `WallFeedSkeleton`.
- **Vide** : « Aucun document publié pour l'instant. Les fichiers joints aux publications du
  mur apparaîtront ici. »
- **Pas de club actif** : réutiliser la clé `wall.noClub`.

### 4.5 Mobile — ouverture native

Dans la WebView Capacitor, un `target="_blank"` **ne fait rien** : la WebView n'a pas de
notion d'onglet et avale la navigation. Les pièces jointes du mur étaient donc déjà
inouvrables depuis l'app Android avant cette V1.

`src/lib/open-document.ts` route l'ouverture selon la plateforme : `window.open` sur le web,
`@capacitor/browser` en natif (Chrome Custom Tab côté Android, `SFSafariViewController` côté
iOS — tous deux savent afficher ou télécharger un PDF). Le plugin est déjà déclaré dans
`android/capacitor.settings.gradle`.

Deux points de mise en œuvre :

- **Import statique du plugin**, comme `native-push.ts` : l'import dynamique ne se résout
  jamais en WKWebView (promesse pendante). Le coût web est un proxy inerte de quelques Ko,
  jamais invoqué grâce à la garde `isNativePlatform()`.
- **Le handler s'applique aussi à `AttachmentList`**, donc aux pièces jointes du mur, du chat
  d'événement et des tournois. C'est un élargissement volontaire du périmètre : le même
  fichier ouvert depuis le mur et depuis la docuthèque ne peut pas avoir deux comportements.
  Cela ne touche pas l'obligation de nommage, qui reste strictement propre au mur.

Le lien reste un vrai `<a href>` : sur le web, clic milieu, « ouvrir dans un nouvel onglet »
et copie du lien continuent de fonctionner ; seul le natif intercepte le clic.

Lisible à 430 px de large.

## 5. Spécification technique

### 5.1 `Attachment.label`

```ts
type Attachment = {
  url: string;
  path: string;
  name: string;
  type: string;
  size: number;
  label?: string; // nom saisi par l'auteur — absent sur les pièces jointes historiques
};
```

Champ **optionnel dans le type** (donc rétrocompatible avec le jsonb existant), **obligatoire
à la saisie** côté composer du mur. Aucune migration SQL : `attachments` est un `jsonb` non
contraint.

`AttachmentPicker` reçoit une prop `requireLabel?: boolean` (défaut `false`), activée
uniquement en `wall-feed.tsx:1117`. Le composant expose l'état « tous les labels sont
remplis » au parent pour piloter le bouton Publier.

### 5.2 Lecture

1. Même requête que le feed (`wall-feed.tsx:174-190`), restreinte aux posts porteurs de
   pièces jointes, sans le tri `is_pinned`.
2. Aplatissement post → documents ; clé de liste `${post.id}:${attachment.path}`.
3. `attachments` est un `jsonb` non contraint : **ignorer silencieusement** les entrées
   malformées (pas de `name` / `url` / `path`) plutôt que faire planter la vue. Test unitaire
   dédié.
4. Auteurs résolus via `profiles` par `IN (...)`, comme `wall-feed.tsx:225`.

**Filtre PostgREST :** `jsonb_array_length(attachments) > 0` n'est pas exprimable
directement ; passer par `.not("attachments", "eq", "[]")`, ou par une RPC dédiée
`SECURITY INVOKER` (**jamais** `SECURITY DEFINER` — l'invoker est ce qui préserve la RLS).

**Pagination :** 50 posts porteurs de documents par page, bouton « Voir plus ». Index partiel
à ajouter :

```sql
CREATE INDEX IF NOT EXISTS idx_wall_posts_with_attachments
  ON public.wall_posts (club_id, created_at DESC)
  WHERE deleted_at IS NULL AND jsonb_array_length(attachments) > 0;
```

### 5.3 Règles de visibilité (normatif)

1. Lire `wall_posts` **sans** clause de sécurité applicative : la RLS est l'unique autorité.
   Ne jamais passer par `supabaseAdmin`.
2. Exclure `deleted_at IS NOT NULL`.
3. Exclure `hidden_at IS NOT NULL`, **sauf** rôles `admin` / `dirigeant` (badge « Masqué ») —
   strictement la règle de `wall-feed.tsx:172-181`. **Régression à éviter :** un document
   modéré ne doit pas redevenir accessible par la docuthèque.
4. Mur staff : `audience_type = 'team_staff'` **et** `audience_team_ids @> [teamId]`.
5. Exclure les posts issus des réseaux sociaux (`source` externe / `external_media_url`) :
   ce ne sont pas des documents.

### 5.4 Découpage du code

`wall-feed.tsx` fait déjà 2 143 lignes : la vue Documents est un **composant séparé**
(`src/components/wall-documents.tsx`), pas une branche de plus dans ce fichier.

Mutualiser dans `src/lib/wall/` ce qui est partagé avec le feed : règle `canSeeHidden`,
filtre staff, aplatissement des pièces jointes.

Pour l'habillage, extraire de `events.tsx` deux briques neutres — un en-tête de mois sticky
et un bloc date — dans un composant partagé. **Si** l'extraction ne se fait pas en drop-in
propre sur `events.tsx`, laisser la page Événements intacte et assumer ~15 lignes de layout
dupliquées : refactorer une page de 872 lignes n'est pas dans le périmètre de cette V1.

### 5.5 i18n

Nouvelles clés sous `wall.documents.*` dans `common.json`, dupliquées dans les **7 locales**
(`de, en, es, fr, it, nl, pt`). `bun run check:i18n` doit rester vert.

## 6. Tests

Conformément à `AGENTS.md` : la modification touche `src/components/**` et `src/lib/**`
(→ `bun run test` obligatoire) et la visibilité (→ `bun run check:guards` et
`bun run check:i18n` également).

**Unitaires (Vitest) — `src/tests/unit/wall-documents.test.ts` (18 cas)**

- aplatissement post → documents ; posts sans pièce jointe ; `attachments` vide ;
- entrées jsonb malformées ignorées sans exception ;
- pièce jointe historique **sans `label`** → affichage du seul nom de fichier ;
- groupement par mois et tri descendant (y compris changement d'année) ;
- exclusion des posts masqués ; exclusion des posts relayés des réseaux sociaux ;
- `hasMissingLabel` — le blocage de publication, y compris sur un nom composé d'espaces.

**Unitaires — `src/tests/unit/open-document.test.ts` (7 cas)**

- web → `window.open`, le plugin natif n'est jamais touché ;
- Android et iOS → `Browser.open` ;
- bridge natif en échec → repli sur la WebView plutôt qu'un clic mort ;
- `handleDocumentClick` ne préempte le clic **que** sur mobile.

**RLS — `tests/rls/wall.documents.rls.ts` (8 cas, `bun run test:rls`)**

Prouve que la colonne `attachments` suit exactement la visibilité de sa ligne : joueur et
parent lisent les documents club-wide et ceux de leur équipe, ne voient **rien** d'un post
`team_staff` ; un membre d'un autre club ne voit rien ; un post supprimé ne remonte plus.
C'est le filet qui garde la docuthèque honnête si `wall_posts_select` évolue un jour.

**E2E — `tests/e2e/32-wall-documents.e2e.ts` (5 cas, projet `ui`)**

Publier sans nom → bouton bloqué et message affiché ; nommé → publication puis apparition
dans l'onglet Documents ; nom accolé au fichier ; pièce jointe historique listée par son seul
nom de fichier ; « Voir la publication » revient au bon post ; et un garde-fou de périmètre
vérifiant que le chat d'événement **n'exige aucun nom**.

## 7. Estimation

| Lot | Contenu                                                                                 | Estimation |
| --- | --------------------------------------------------------------------------------------- | ---------- |
| 1   | `Attachment.label` + `requireLabel` dans `AttachmentPicker` + blocage du bouton Publier | 0,25 j     |
| 2   | Requête + normalisation dans `src/lib/wall/`, tests unitaires                           | 0,25 j     |
| 3   | `wall-documents.tsx` (groupes mensuels, lignes, états vides) + onglets sur les 2 murs   | 0,5 j      |
| 4   | i18n × 7, index partiel, vérification mobile PDF iOS/Android, e2e                       | 0,25 j     |

**Total V1 : ~1 à 1,5 jour.**

## 8. Suites possibles (hors V1)

Par ordre de valeur attendue :

1. **Recherche** sur le nom saisi + le nom de fichier — première chose à ajouter dès que les
   clubs auront accumulé du volume.
2. **Filtres** par équipe/groupe et par type de fichier.
3. **Renommage a posteriori** par le staff (implique d'écrire dans le jsonb du post).
4. **Documents de `club_publications`** — ce système a déjà les tables
   `club_publication_documents` / `club_publication_media`, mais l'upload n'est pas branché
   (`publications.new.tsx:236-237` envoie toujours des tableaux vides). Chantier distinct.

**Deux points de vigilance, hors périmètre mais à ne pas perdre :**

- **Bucket `attachments` public** : les URLs sont non devinables mais restent accessibles
  sans authentification une fois partagées. La docuthèque facilite la **collecte** de ces
  liens. Ce n'est pas une régression, mais si des documents sensibles arrivent, prévoir un
  chantier « bucket privé + URLs signées ».
- **Rétention** : rien ne purge aujourd'hui les fichiers d'un post supprimé — ils restent
  dans le bucket. La docuthèque les masque correctement (§5.3), mais la purge reste ouverte
  (cf. `docs/privacy/retention.md`).

## 9. Critères d'acceptation

```text
[x] Un onglet Documents est présent sur le mur du club et sur le mur staff d'équipe
[x] Publier une pièce jointe sur le mur exige un nom ; le bouton Publier reste bloqué sinon
[x] Les 5 autres AttachmentPicker (chat, événements, tournois) n'exigent aucun nom
[x] Le nom saisi s'affiche accolé au nom de fichier dans le mur et dans la docuthèque
[x] Les pièces jointes publiées avant la V1 s'affichent avec leur seul nom de fichier
[x] Les documents sont groupés par mois, le plus récent en haut, habillage page Événements
[x] Un document d'un post supprimé ou masqué n'apparaît pas (hors admin/dirigeant)
[x] « Voir la publication » ramène au post d'origine, surligné, sur l'onglet Mur
[x] Le deep-link push ?post=<uuid> ouvre toujours l'onglet Mur, sans régression
[x] Ouverture native Android/iOS via @capacitor/browser, avec repli WebView si le bridge échoue
[x] 7 locales complètes ; check:i18n, check:guards, test, format:check et build verts
[x] Tests RLS écrits — tests/rls/wall.documents.rls.ts
[x] Tests e2e écrits — tests/e2e/32-wall-documents.e2e.ts (projet `ui`, 5 cas)
[ ] `bun run test:rls` exécuté   → exige SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
[ ] `bun run test:e2e:flows` exécuté → exige E2E_BASE_URL + utilisateurs E2E seedés
[ ] Ouverture d'un PDF constatée sur un appareil Android réel
```

Les trois dernières lignes ne sont pas des trous dans la livraison : ce sont des exécutions
qui demandent une base Supabase et un appareil, indisponibles à l'écriture du code. Le
lancement des deux commandes ci-dessus suffit à les cocher.
