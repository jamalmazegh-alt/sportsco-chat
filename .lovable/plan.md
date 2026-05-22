
# Moteur de règles de tournoi — Plan d'implémentation

## Ce qui existe déjà ✅
- Tables `tournaments`, `tournament_groups`, `tournament_matches`, équipes, brackets
- Format `group / knockout / mixed` + génération auto poules + bracket
- Calcul de classement (`computeStandings`) avec tie-breakers basiques : `points, goal_diff, goals_for, head_to_head, wins`
- Auto-scheduling avec terrains, pause déjeuner, durée match
- Page publique `/t/$slug`, mode "accès tournoi uniquement", multi-sport (foot, basket, hand, volley, rugby, hockey…)
- i18n FR/EN en place (`react-i18next`)

## Ce qui manque (objet de ce plan)
1. **Points configurables** (W/D/L + bonus)
2. **Tie-breakers riches & ré-ordonnables** (drag & drop, ajout : head-to-head GD/GF, fair play, penalty shootout, tirage)
3. **Règles de qualification avancées** (N par poule + meilleurs 3èmes + wildcards)
4. **Fair play** : cartons → points de discipline → tie-breaker
5. **Génération PDF du règlement** (FR/EN, logo, branding)
6. **Round-robin pur & format ligue** (juste une variante de `group` sans bracket — petite étoffe)
7. **Statut de validation des scores** (provisional vs validated, override admin)

## Architecture

### 1. DB — une seule migration

**Étendre `tournaments.settings` (jsonb)** plutôt qu'ajouter 10 colonnes. Schéma typé côté TS :

```ts
type TournamentRules = {
  points: { win: number; draw: number; loss: number; bonusWin?: number };
  tiebreakers: TiebreakerKey[];          // ordre configurable
  qualification: {
    perGroup: number;                     // ex. 2
    bestThirds?: number;                  // ex. 2 meilleurs 3èmes
    wildcards?: string[];                 // team_ids
  };
  fairPlay: {
    enabled: boolean;
    yellow: number;                       // -1 pt par défaut
    red: number;                          // -3 pts
    secondYellow?: number;
  };
  overtime: { enabled: boolean; minutes?: number };
  penaltyShootout: { enabled: boolean };
  language: "fr" | "en";
  branding: { primaryColor?: string; organizerName?: string };
};
```

**Nouvelles tables / colonnes** :
- `tournament_match_events` : `id, match_id, team_id, player_id?, kind ('yellow'|'red'|'goal'|'own_goal'|'assist'), minute, created_at` — pour fair-play et stats détaillées
- `tournament_matches` : ajouter `validated_at`, `validated_by`, `dispute_flag boolean`, `penalty_score_a`, `penalty_score_b`, `overtime_score_a`, `overtime_score_b`
- `tournament_documents` : `id, tournament_id, kind ('rules'), language, file_url, generated_at` — historique des PDF
- Bucket Storage `tournament-documents` (public read)

RLS : reprendre les helpers `can_view_tournament` / `can_manage_tournament` déjà en place.

### 2. Moteur de classement (étendu)

`src/modules/tournaments/lib/standings.ts` — élargir `Tiebreaker` :
```
"points" | "head_to_head_points" | "head_to_head_gd" | "head_to_head_gf"
| "goal_diff" | "goals_for" | "wins" | "fair_play" | "draw_lot"
```
- Ajouter `fairPlayPoints` par équipe (calculé depuis `tournament_match_events`)
- `draw_lot` → ordre stable basé sur hash(teamId+tournamentId) (déterministe, transparent)
- Mini-ligue head-to-head : quand ≥3 équipes ex-aequo sur "points", recalculer un sous-classement entre elles avant de continuer

### 3. Qualification

`src/modules/tournaments/lib/qualification.ts` (nouveau) :
- `selectQualified(groups, standings, rules)` → liste ordonnée de team_ids qualifiés
- Logique meilleurs 3èmes : extraire les Nèmes de chaque poule, les classer entre eux
- Ajouter wildcards manuels
- Brancher sur `generateBracket` existant

### 4. UI Admin — onglet "Règles"

Nouveau composant `TournamentRulesEditor.tsx` dans l'écran tournoi :
- Section Points : 3 inputs numériques
- Section Tie-breakers : liste drag-and-drop (`@dnd-kit/sortable` déjà dispo ? sinon `react-sortable-hoc`) avec switch on/off
- Section Qualification : N par poule, meilleurs 3èmes, sélecteur wildcards
- Section Fair Play : toggle + valeurs cartons
- Section Overtime / Penalty / Branding / Language
- Bouton "Enregistrer" → `updateTournament({ patch: { settings: rules } })`
- Bouton "Réinitialiser aux défauts"

### 5. Validation des matchs

`MatchesList.tsx` :
- Badge "Provisoire" / "Validé"
- Bouton "Valider" (manager/admin) → `validateMatch(matchId)`
- Bouton "Signaler litige" → `dispute_flag = true`
- Standings recalculées en live mais option "n'inclure que matchs validés" (settings)

### 6. PDF du règlement

`src/modules/tournaments/lib/rules-pdf.server.ts` + server route `src/routes/api/public/tournaments/$slug/rules.ts` :
- Lib : **`pdf-lib`** (déjà compatible Workers, pure JS, pas de native bin)
- Génère PDF avec logo (fetch depuis Storage), nom, organisateur, sport, format, dates, lieu
- Sections : Points, Tie-breakers (numérotés dans l'ordre choisi), Qualification, Fair-play, Prolongations/Tirs au but, Calendrier (si dispo)
- i18n via `src/locales/{fr,en}/tournament-rules.json` (nouvelle namespace)
- Stocké dans bucket `tournament-documents`, ligne dans `tournament_documents`
- Bouton "Télécharger règlement (FR)" / "(EN)" dans l'admin + page publique

### 7. i18n

Nouveau namespace `tournament-rules` (FR + EN) avec toutes les clés : labels colonnes classement, noms de tie-breakers, sections PDF, messages.

## Découpage en livraison (incrémental)

**PR 1 — Fondations** (migration + moteur)
- Migration : settings étendus, colonnes validation match, table events, table documents, bucket
- Étendre `standings.ts` (nouveaux tie-breakers, fair-play, mini-ligue h2h)
- `qualification.ts` (sélection qualifiés + meilleurs 3èmes)
- Tests unitaires (`src/tests/unit/standings.test.ts`, `qualification.test.ts`)

**PR 2 — UI Règles**
- `TournamentRulesEditor.tsx` (drag-and-drop tie-breakers, tous les toggles)
- Branchement dans la page tournoi (nouvel onglet "Règles")
- Server fns `updateTournamentRules`, `resetRulesToDefaults`

**PR 3 — Validation matchs & fair-play**
- UI validation + dispute dans `MatchesList`
- Saisie cartons (réutiliser `event_goals` pattern si possible, sinon `tournament_match_events`)
- Server fns `validateMatch`, `recordMatchEvent`

**PR 4 — PDF règlement**
- `rules-pdf.server.ts` avec `pdf-lib`
- Server route publique `/api/public/tournaments/$slug/rules?lang=fr`
- Namespace i18n `tournament-rules`
- Boutons "Télécharger règlement FR/EN"

## Détails techniques

- **DnD** : `@dnd-kit/core` + `@dnd-kit/sortable` (à installer si absent)
- **PDF** : `pdf-lib` (Workers-safe ; PAS `puppeteer`, PAS `pdfkit` native)
- **Storage** : bucket `tournament-documents` public-read, écritures via `supabaseAdmin` côté server fn
- **RLS** : `tournament_match_events` & `tournament_documents` → `can_view_tournament` (SELECT public/anon), `can_manage_tournament` (WRITE)
- **Future-proofing** : `tournament_match_events` sert déjà de socle pour le live-scoring et l'app arbitre futurs ; le bucket documents peut accueillir feuilles de match, affiches, etc.

## Hors scope (à confirmer)
- App arbitre dédiée, push live, IA résumés, QR codes, bannières sponsors → mentionnés comme "future-proofing" → on prépare la DB mais **on n'implémente pas** ces écrans maintenant.
- Référi-validation séparée du manager → l'admin override couvre le besoin V1.

Confirme-moi : **on attaque dans cet ordre (PR1 → PR4) ?** Ou tu préfères que je livre tout d'un coup ?
