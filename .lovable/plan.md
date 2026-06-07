# Plan — Features QA manquantes

Quatre lots indépendants. Je propose de les livrer **dans cet ordre** (priorités QA) avec une migration DB unique par lot quand nécessaire.

---

## Lot 1 — Formats de tournoi (priorité haute)

Trois nouveaux formats à ajouter à côté de `groups + knockout` / `round_robin` / `knockout` existants.

### 1.1 Double élimination
- Nouveau format `double_elimination`.
- Génération : bracket **winner** classique + bracket **loser** alimenté par les perdants de chaque tour du winner bracket. Grande finale entre champion winner et champion loser (avec règle "reset" optionnelle V1 = pas de reset).
- Nouveau fichier `src/modules/tournaments/lib/double-elim.ts` (fonction pure, testée).
- Persistance : on réutilise `knockout_matches` + un champ `bracket_side: 'winner' | 'loser' | 'grand_final'` (jsonb metadata ou colonne).
- UI : composant `DoubleEliminationBracket` (2 colonnes : Winner / Loser, grande finale en bas).

### 1.2 Championnat aller-retour
- Option `doubleRoundRobin: boolean` sur les règles (ou format `round_robin_home_away`).
- Étend `generateRoundRobin()` : 2e passe avec home/away inversés et `round` continu (n-1 + n-1).
- Aucune migration : on génère juste 2× plus de matchs.

### 1.3 Système suisse
- Nouveau format `swiss`.
- Paramètres : `rounds` (fixe, défini à la création), pas de groupes.
- Algorithme : ronde 1 = appariement par seed (haut vs bas) ; rondes suivantes = tri par points puis appariement haut/bas en évitant les rematchs.
- Nouveau fichier `src/modules/tournaments/lib/swiss.ts` + tests.
- UI : bouton "Générer la ronde suivante" (manuel, car dépend des résultats validés).

### 1.4 Migration
```sql
ALTER TYPE tournament_format ADD VALUE 'double_elimination';
ALTER TYPE tournament_format ADD VALUE 'swiss';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS double_round_robin boolean DEFAULT false;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS swiss_rounds integer;
ALTER TABLE knockout_matches ADD COLUMN IF NOT EXISTS bracket_side text;
```

---

## Lot 2 — Sports

### 2.1 Tennis & Padel
- Ajout `tennis` et `padel` dans `src/lib/sports.ts` (catégorie nouvelle "racket").
- `sport-config.ts` : scoreUnit `sets`, `cardsEnabled: false`, `setScoresEnabled: true`.
- `formats.ts` : profil scoring `mode: 'sets'`, bestOf 3, pointsToWin 6, tieBreak 7, winBy 2.
- `defaultRulesForSport()` : pas de nul (ajout dans `SPORTS_WITHOUT_DRAW`), format par défaut = `knockout`, roster `playersPerTeam` = 1 (tennis) / 2 (padel).

### 2.2 Sport personnalisé
- Option `custom` dans la sélection de sport, accompagnée d'un input texte `customSportName`.
- Colonne `tournaments.custom_sport_name text` (déjà sport=text donc on stocke `custom:<name>` ou ajout colonne dédiée — je propose colonne dédiée pour clarté).
- `getSportConfig('custom')` → fallback générique (points, pas de cartons, pas de sets).
- Affichage : si `sport='custom'`, on affiche `customSportName` partout au lieu de la clé.

---

## Lot 3 — Streaming par terrain

État actuel : un seul lien `stream_url` au niveau tournoi.

Cible : un lien par **terrain** (`fields` / `venues`). Le viewer choisit le terrain.

- Migration : `ALTER TABLE tournament_fields ADD COLUMN stream_url text;` (table existe déjà pour les terrains/poules).
- UI admin : dans la config des terrains, input "URL de stream" par ligne.
- UI public (`t.$slug.tv.tsx`) : sélecteur de terrain, embed dynamique selon le terrain choisi. Fallback sur `stream_url` global si terrain sans lien.

---

## Lot 4 — Préset points Hockey

- Ajout d'un préset nommé "Hockey (OT)" dans la config des points :
  `{ win: 2, draw: 0, loss: 0, otWin: 2, otLoss: 1 }`.
- Extension de `PointsConfig` : champs optionnels `otWin?: number` et `otLoss?: number`.
- `computeStandings` : si match marqué `decided_in: 'overtime' | 'shootout'`, applique `otWin` au vainqueur et `otLoss` au perdant à la place de `win`/`loss`.
- Migration : ajout colonne `matches.decided_in text` (NULL = temps réglementaire).
- UI règles : nouvelle section "Préset" avec boutons rapides (Standard, Hockey OT, Personnalisé).

---

## Section technique (détails impl)

- **Tests** : Vitest pour les 3 nouveaux algorithmes (double-elim, suisse, round-robin aller-retour), couvrant 4/8/16 équipes et cas impair.
- **Types Supabase** : régénérés automatiquement après chaque migration.
- **i18n** : nouvelles clés `tournaments.formats.*` (FR/EN/ES/DE/IT/NL/PT) — copie FR puis script de traduction existant.
- **Rétro-compat** : tous les tournois existants conservent leur format ; les nouvelles colonnes sont nullable / défaut sûr.
- **Hors scope V1** : reset de grande finale (double-elim), tie-break avancé (suisse Buchholz score), multi-stream simultané (le viewer choisit 1 terrain à la fois).

---

## Ordre d'exécution proposé

1. Lot 4 (Hockey OT) — petit, isolé, valide la mécanique points
2. Lot 2 (Tennis/Padel/custom) — étend sport-config
3. Lot 3 (streams par terrain) — UI + 1 colonne
4. Lot 1 (formats tournoi) — le plus gros, livré en 3 PR internes (round-robin a/r, suisse, double-élim)

Confirmes-tu l'ordre et le scope, ou tu veux que je commence par un lot particulier ?
