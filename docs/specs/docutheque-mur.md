# Docuthèque — onglet « Documents » du mur

> **Statut :** spécification, non implémentée.
> **Origine :** demande club (ticket support Nicolas CLAVIER, 01/08/2026) — _« créer une
> docuthèque avec les documents publiés sur le mur (programmes de reprise, calendrier,
> notes d'information, etc.) »_.
> **Fichiers concernés :** `src/components/wall-feed.tsx`, `src/components/attachments.tsx`,
> `src/routes/_authenticated/inbox.tsx`, `src/routes/_authenticated/teams/$teamId_.staff.tsx`.

## 1. Objet

Rendre retrouvables les documents déjà publiés sur le mur, sans avoir à faire défiler
plusieurs mois de publications. Un parent qui cherche le programme de reprise publié en
août doit le trouver en deux clics.

**Principe directeur :** la docuthèque n'est **pas un module indépendant**, c'est une
**seconde vue sur les données du mur**. Chaque mur existant gagne un onglet `Documents`
listant les pièces jointes de ses propres publications.

Conséquence structurante : **aucune logique de partage n'est créée**. La visibilité des
documents est exactement celle des publications qui les portent, garantie par la RLS
existante (`wall_posts_select`). Aucune nouvelle policy à écrire, aucun risque d'exposer
un document à une audience non prévue.

## 2. État de l'existant (vérifié dans le code)

### 2.1 Stockage des pièces jointes

Les pièces jointes du mur sont stockées dans la colonne **`wall_posts.attachments`**
(type `jsonb`, tableau d'objets), sérialisées par `AttachmentPicker`
(`src/components/attachments.tsx`) :

```ts
type Attachment = {
  url: string; // URL publique Supabase Storage
  path: string; // chemin dans le bucket : `${user.id}/${prefix}/${timestamp}-${safeName}`
  name: string; // nom d'origine du fichier
  type: string; // MIME
  size: number; // octets
};
```

Contraintes déjà en place à l'upload :

- bucket **`attachments`** (public), 10 Mo max par fichier, **4 pièces jointes max** par post ;
- allowlist MIME stricte : images (jpeg/png/gif/webp/heic/heif), PDF, Word, Excel, txt, csv —
  avec repli par extension quand le navigateur ne renseigne pas `file.type`.

**Rien à migrer.** Tous les documents déjà publiés sont exploitables en l'état.

### 2.2 Surfaces « mur » réellement existantes

Il n'existe **pas** de « mur d'équipe » comme surface distincte. Il existe :

| Surface          | Route                  | Rendu                                      |
| ---------------- | ---------------------- | ------------------------------------------ |
| Mur du club      | `/inbox`               | `<WallFeed clubId={activeClubId} />`       |
| Mur staff équipe | `/teams/$teamId/staff` | `<WallFeed clubId staffTeamId={teamId} />` |

Le ciblage par équipe se fait **par publication**, via `audience_type` ∈
`club | team | multi_team | group | team_staff` + `audience_team_ids` / `audience_group_ids`
(`wall-feed.tsx:55`). Le mur du club affiche donc déjà, pour chaque membre, uniquement ce
qui le concerne.

> **Traduction pour la docuthèque :** le « Documents de mon équipe » demandé n'est pas un
> second onglet, c'est un **filtre** dans l'onglet Documents du mur club. Le mur staff, lui,
> a bien son propre onglet Documents naturellement cloisonné.

### 2.3 Sécurité et modération déjà acquises

- `wall_posts_select` (RLS) filtre par club **et** par audience du post. Une requête
  docuthèque sur `wall_posts` hérite du filtrage sans code supplémentaire.
- `deleted_at` (suppression) et `hidden_at` (modération) existent. `wall-feed.tsx:172`
  n'expose les posts masqués qu'aux rôles `admin` / `dirigeant`.
- Index disponibles : `idx_wall_posts_club (club_id, created_at DESC)`,
  `idx_wall_posts_club_pinned`, `idx_wall_posts_audience_teams`, `idx_wall_posts_audience_groups`.

### 2.4 Ce qui manque

- **Aucune catégorie / aucun tag** sur les pièces jointes. Le type « programme de reprise »,
  « calendrier », « note d'information » n'existe nulle part aujourd'hui — voir §7.
- Le feed est plafonné à **50 posts** (`wall-feed.tsx:190`). Une docuthèque doit couvrir
  l'historique complet — voir §6.3.

## 3. Périmètre

### 3.1 Dans le périmètre (V1)

- Onglet `Documents` sur le mur du club (`/inbox`) et sur le mur staff d'équipe.
- Liste à plat de toutes les pièces jointes visibles par l'utilisateur, anti-chronologique.
- Par document : nom, date de publication, auteur, audience (équipe / groupe / club), icône
  de type, taille.
- Recherche par nom de fichier ; filtres par équipe/groupe, par type de fichier, par période.
- Ouverture / téléchargement, et lien « voir la publication d'origine ».
- Support mobile (Capacitor iOS/Android).
- i18n sur les 7 langues.

### 3.2 Hors périmètre (V1)

- Catégories métier (programme / calendrier / règlement / note d'info) — option V2, §7.
- Upload de documents **hors** publication (dépôt direct dans la docuthèque).
- Versionnement, renommage, réorganisation en dossiers.
- Documents du système `club_publications` (voir §9, décision ouverte).
- Passage du bucket `attachments` en privé + URLs signées (voir §9).

## 4. Spécification fonctionnelle

### 4.1 Emplacement et navigation

Sur `/inbox` et `/teams/$teamId/staff`, deux onglets en tête de page :

```
[ Mur ]  [ Documents ]
```

- `Mur` : le `WallFeed` actuel, inchangé, onglet par défaut.
- `Documents` : la nouvelle vue.
- L'onglet actif est porté par la query string (`?tab=documents`) pour que le lien soit
  partageable et que le retour navigateur fonctionne. `validateSearch` de la route est
  étendu en conséquence (le schéma zod existant de `/inbox` accepte déjà `post` et `from`).
- Le deep-link push existant (`?post=<uuid>&from=push`) doit continuer d'ouvrir l'onglet
  `Mur` : si `post` est présent, il l'emporte sur `tab`.

### 4.2 Ligne « document »

| Élément  | Source                                                            |
| -------- | ----------------------------------------------------------------- |
| Icône    | dérivée de `attachment.type` (image / PDF / Word / Excel / autre) |
| Nom      | `attachment.name`                                                 |
| Date     | `wall_posts.created_at` du post porteur                           |
| Auteur   | `profiles.full_name` via `wall_posts.author_user_id`              |
| Audience | nom d'équipe / de groupe, ou « Tout le club »                     |
| Taille   | `attachment.size`, formatée                                       |
| Badge    | « Masqué » si `hidden_at` non nul (staff uniquement)              |

Actions : **Ouvrir / Télécharger** (comportement de `AttachmentList` réutilisé), et
**Voir la publication** → onglet `Mur` avec `?post=<id>`, qui déclenche le scroll et le
surlignage déjà implémentés dans `inbox.tsx`.

Le rendu réutilise `AttachmentList` autant que possible ; si la mise en page liste
(une ligne par document avec métadonnées) diverge trop de la présentation actuelle en
vignettes, extraire un composant `DocumentRow` plutôt que surcharger `AttachmentList` de
props conditionnelles.

### 4.3 Tri, recherche, filtres

- **Tri** par défaut : date de publication décroissante. Le `is_pinned` du mur **n'est pas**
  repris — un post épinglé n'a pas vocation à remonter un document en tête de docuthèque.
  Tri alternatif proposé : par nom (A→Z).
- **Recherche** : sur `attachment.name`, insensible à la casse et aux accents. Optionnel
  mais souhaitable : inclure le corps du post (`body`) dans le champ de recherche, car un
  fichier nommé `doc_final_v2.pdf` se retrouve surtout par le texte de la publication.
- **Filtres** :
  - équipe / groupe (valeurs dérivées des posts effectivement visibles) ;
  - type de fichier : `PDF | Image | Document | Tableur | Autre` ;
  - période : 12 derniers mois / saison en cours / tout.
- Les filtres se cumulent ; un bouton « Réinitialiser » apparaît dès qu'un filtre est actif.

### 4.4 États

- **Chargement** : skeleton cohérent avec `WallFeedSkeleton`.
- **Vide (aucun document)** : « Aucun document publié pour l'instant. Les fichiers joints
  aux publications du mur apparaîtront ici. »
- **Vide après filtrage** : message distinct + action « Réinitialiser les filtres ».
- **Pas de club actif** : réutiliser `wall.noClub`.

### 4.5 Mobile

Application Capacitor : l'ouverture d'un document doit passer par `@capacitor/browser`
plutôt qu'un `window.open` nu, comme ailleurs dans l'app. Vérifier le comportement PDF sur
iOS **et** Android avant livraison. La liste doit rester lisible en 430 px de large
(gabarit de référence du club demandeur).

## 5. Règles de visibilité (normatif)

1. La requête lit `wall_posts` **sans** clause de sécurité applicative : la RLS
   `wall_posts_select` est l'unique autorité. Ne jamais contourner via `supabaseAdmin`.
2. Exclure systématiquement `deleted_at IS NOT NULL`.
3. Exclure `hidden_at IS NOT NULL`, **sauf** pour les rôles `admin` / `dirigeant`, qui les
   voient avec un badge « Masqué » — strictement la règle de `wall-feed.tsx:172-181`.
   Régression à éviter : un document modéré ne doit pas rester accessible via la docuthèque.
4. Sur le mur staff : filtrer `audience_type = 'team_staff'` **et**
   `audience_team_ids @> [teamId]`, comme le feed actuel.
5. Les posts issus des réseaux sociaux (`source` ≠ interne, `external_media_url`) ne sont
   **pas** des documents : les exclure de la docuthèque.

## 6. Spécification technique

### 6.1 Modèle de données

**Aucune nouvelle table en V1.** La docuthèque est une projection de
`wall_posts.attachments`. Cela évite toute désynchronisation entre le mur et la docuthèque
(suppression, modération, changement d'audience se propagent gratuitement).

### 6.2 Lecture et normalisation

1. Requête sur `wall_posts` (colonnes : `id, created_at, author_user_id, body, attachments,
audience_type, audience_team_ids, audience_group_ids, hidden_at, source`), filtrée
   `club_id`, `deleted_at IS NULL`, `+ hidden_at` selon rôle.
2. Aplatissement : pour chaque post, chaque entrée du tableau `attachments` produit une ligne.
   Clé de liste : `${post.id}:${attachment.path}` (le `path` est unique par upload).
3. `attachments` est un `jsonb` non contraint : **valider et ignorer silencieusement** les
   entrées malformées (absence de `name`/`url`/`path`, `type` vide) plutôt que faire planter
   la vue. Prévoir un test unitaire sur ce point.
4. Résolution des noms : `profiles` (auteurs) et `club_groups` (groupes) par `IN (...)`,
   même approche que `wall-feed.tsx:225` et `:302`.

### 6.3 Volumétrie et pagination

Le feed actuel s'arrête à 50 posts ; c'est insuffisant ici. Deux paliers :

- **V1** : requête filtrée `jsonb_array_length(attachments) > 0` avec pagination
  (`range()`) par tranches de 50 posts porteurs de documents, chargement incrémental
  (« Voir plus » ou scroll infini). Ajouter un index partiel :

  ```sql
  CREATE INDEX IF NOT EXISTS idx_wall_posts_with_attachments
    ON public.wall_posts (club_id, created_at DESC)
    WHERE deleted_at IS NULL AND jsonb_array_length(attachments) > 0;
  ```

  Note : le filtre `jsonb_array_length(...) > 0` n'est pas exprimable directement en
  PostgREST — passer par `.not("attachments", "eq", "[]")` ou, plus sûr, par une **RPC
  dédiée** `SECURITY INVOKER` (l'invoker préserve la RLS ; ne surtout pas la déclarer
  `SECURITY DEFINER`).

- **Si la volumétrie l'exige** (plusieurs milliers de posts par club) : recherche et filtres
  côté serveur dans la RPC, plutôt que côté client.

Point de vigilance : la recherche côté client sur `attachment.name` ne porte que sur les
pages déjà chargées. Soit on charge tout l'historique d'un club (acceptable à l'échelle
actuelle), soit la recherche part côté serveur dès la V1. **À trancher à l'implémentation,
sur la base d'une mesure réelle du volume** (compter les posts avec pièces jointes sur les
plus gros clubs en production).

### 6.4 Réutilisation

Extraire dans `src/lib/wall/` la logique de sélection/normalisation partagée avec
`wall-feed.tsx` (règle `canSeeHidden`, filtre staff, aplatissement des pièces jointes)
plutôt que la dupliquer. `wall-feed.tsx` fait déjà 2 143 lignes : la vue Documents doit
être un **composant séparé**, pas une branche supplémentaire dans ce fichier.

### 6.5 i18n

Nouvelles clés sous `wall.documents.*` dans `common.json`, dupliquées dans les **7 locales**
(`de, en, es, fr, it, nl, pt`). `bun run check:i18n` doit rester vert.

## 7. Option V2 — catégories métier

C'est la **seule vraie question ouverte côté produit** : le club demande explicitement
« programmes de reprise, calendrier, notes d'information ». Deux variantes.

### Variante A — champ `category` dans le jsonb (recommandée)

- Ajouter `category?: string` au type `Attachment` et un sélecteur dans `AttachmentPicker`,
  au moment de la publication.
- Rétrocompatible : les pièces jointes existantes n'ont pas le champ → catégorie
  « Non classé ». Aucune migration de données.
- Liste de catégories fermée et traduite (pas de saisie libre, sinon les filtres se
  fragmentent) : `programme | calendrier | reglement | note_information | convocation | autre`.
- Coût : ~1 à 2 jours (composer + affichage + filtre + i18n × 7).
- Limite : pas de reclassement a posteriori sans écriture dans le jsonb du post.

### Variante B — table `club_documents` dédiée

- Table de métadonnées référençant `(post_id, attachment_path)`, avec catégorie éditable
  après coup, épinglage, archivage.
- Plus puissant, mais introduit un second état à maintenir cohérent avec `wall_posts`
  (suppression de post, modération, changement d'audience) et **une nouvelle surface RLS à
  écrire et à tester** — exactement ce que la V1 évite.
- À ne retenir que si le besoin de reclassement / curation par le club est confirmé.

**Recommandation :** livrer la V1 sans catégories, mesurer l'usage, puis Variante A si le
besoin se confirme. La recherche + le filtre par type couvrent déjà l'essentiel du cas
d'usage « je cherche le programme de reprise ».

## 8. Tests

Conformément à `AGENTS.md` (§ Discipline de tests obligatoire) — la modification touche
`src/components/**` et `src/lib/**`, donc `bun run test` est obligatoire ; la modification
touche la visibilité, donc `bun run check:guards` et `bun run check:i18n` aussi.

**Unitaires (Vitest) :**

- aplatissement post → documents, y compris posts sans pièce jointe et `attachments` vide ;
- entrées jsonb malformées ignorées sans exception ;
- filtres (type, équipe, période) et recherche insensible à la casse/aux accents ;
- exclusion des posts `deleted_at` / `hidden_at` selon rôle ;
- exclusion des posts externes (réseaux sociaux).

**RLS (`bun run test:rls`) :** un parent d'une équipe A ne voit aucun document d'un post
ciblé équipe B ; un joueur ne voit aucun document d'un post `team_staff`.

**E2E (Playwright) :** publier un post avec PDF → le document apparaît dans l'onglet
Documents → « Voir la publication » ramène au bon post sur le mur.

## 9. Décisions ouvertes

| #   | Question                                                | Impact si non tranché                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Catégories métier en V1 ou non (§7) ?                   | Bloque le chiffrage final ; **à poser au club**                                                                                                                                                                                                                                            |
| 2   | La docuthèque couvre-t-elle aussi `club_publications` ? | Ce système a déjà les tables `club_publication_documents` / `club_publication_media`, mais **l'upload n'est pas branché** (`publications.new.tsx:236-237` envoie toujours des tableaux vides). Chantier distinct, à ne pas absorber ici.                                                   |
| 3   | Bucket `attachments` public                             | Les URLs sont non devinables mais restent accessibles sans authentification une fois partagées. La docuthèque rend la **collecte** de ces liens plus facile. Ce n'est pas une régression, mais si des documents sensibles y arrivent, prévoir un chantier « bucket privé + URLs signées ». |
| 4   | Rétention                                               | Aujourd'hui rien ne purge les fichiers d'un post supprimé : ils restent dans le bucket. La docuthèque les masque correctement (§5), mais la question de la purge reste ouverte (cf. `docs/privacy/retention.md`).                                                                          |

## 10. Découpage et estimation

| Lot | Contenu                                                                                          | Estimation |
| --- | ------------------------------------------------------------------------------------------------ | ---------- |
| 1   | Extraction de la logique partagée dans `src/lib/wall/`, requête + normalisation, tests unitaires | 0,5 j      |
| 2   | Vue Documents (liste, tri, recherche, filtres, états vides) + onglets sur `/inbox` et mur staff  | 0,5 à 1 j  |
| 3   | i18n × 7, vérification mobile Capacitor (PDF iOS/Android), e2e                                   | 0,5 j      |
| 4   | _(optionnel)_ Catégories, Variante A                                                             | +1 à 2 j   |

**V1 (lots 1 à 3) : ~1,5 à 2 jours.**

## 11. Critères d'acceptation

```text
[ ] Un onglet Documents est présent sur le mur du club et sur le mur staff d'équipe
[ ] Il liste toutes les pièces jointes visibles par l'utilisateur, anti-chronologiquement
[ ] Un parent ne voit que les documents des publications qui lui étaient destinées
[ ] Un document d'un post supprimé ou masqué n'apparaît pas (hors admin/dirigeant)
[ ] Recherche par nom de fichier et filtres équipe / type / période opérationnels
[ ] « Voir la publication » ramène au post d'origine, surligné, sur l'onglet Mur
[ ] Ouverture et téléchargement fonctionnels sur web, iOS et Android
[ ] 7 locales complètes ; check:i18n, check:guards, test, typecheck et format:check verts
```
