# Plan — Flights & finales multiples

Objectif : un **moteur Flight générique** qui couvre Champions/Europa/Conference, Coupe/Plaque/Bowl/Shield, Or/Argent/Bronze, ou n'importe quelle config custom. Jamais hardcodé.

État actuel (déjà livré) :
- `double_elimination`, `swiss`, `round_robin_home_away` (formats + algos + tests)
- Préset Hockey OT (`otWin`/`otLoss` dans PointsConfig, colonne `decided_in`)
- `field_streams` (jsonb) + UI admin + onglet public Streams par terrain
- Tennis/Padel/Custom + i18n complet

Reste à faire ↓

---

## Lot A — Moteur Flight (PRIORITÉ 1)

### A1. Schéma DB

Une seule nouvelle table `tournament_flights`. Le bracket réutilise `tournament_matches` (déjà flexible) avec une colonne `flight_id`.

```sql
CREATE TABLE public.tournament_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  sort_order int NOT NULL,                 -- A=0 (meilleur), B=1, ...
  name text NOT NULL,                      -- "Champions", "Coupe", "Or"…
  short_name text,                         -- "A", "B", optionnel
  color text,                              -- accent visuel (or/argent/bronze)
  qualification_rules jsonb NOT NULL,      -- voir A2
  enable_third_place boolean DEFAULT true,
  enable_fifth_place boolean DEFAULT false,
  enable_seventh_place boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tournament_matches ADD COLUMN flight_id uuid REFERENCES tournament_flights(id) ON DELETE SET NULL;
ALTER TABLE tournament_matches ADD COLUMN placement_kind text;  -- 'final'|'third_place'|'fifth_place'|'seventh_place'|'semi'|'quarter'|'round_of_16'
```
GRANT + RLS hérités via `can_manage_tournament` / lecture publique si tournoi publié.

### A2. `qualification_rules` (jsonb)

Une règle = une source d'équipes. Cumulables.
```ts
type QualRule =
  | { kind: "group_position"; positions: number[] }          // ex: [1] pour tous les 1ers
  | { kind: "group_position_in"; group_id: string; positions: number[] }
  | { kind: "best_n_remaining"; n: number; among: "all" | "position"; position?: number }  // wild cards
  | { kind: "manual"; team_ids: string[] };
```
Le générateur applique les règles dans l'ordre, ignore les doublons, s'arrête quand le quota du Flight est atteint.

### A3. Générateur — équilibrage automatique

`proposeFlightDistributions(numTeams, opts)` → renvoie 2-3 options pré-faites (pure function, testée Vitest) :
- équilibrer en N flights de tailles puissances de 2 quand possible
- sinon, propose un flight "irrégulier" (5 ou 6 équipes avec un mini round-robin court ou bye)

Exemples couverts : 12 (3p4 → 4/8), 16 (4p4 → 4/4/8), 24 (4p6 → 8/8/8), 13 (4/4/5 ou 4/3/3/3).

L'UI admin affiche les options sous forme de cartes, l'organisateur clique → la config se matérialise dans `tournament_flights` + `qualification_rules` pré-remplis.

### A4. Génération du bracket par Flight

Réutilise `generateKnockoutBracket()` existant avec `flight_id` propagé + flag `placement_kind`. Pour chaque Flight :
- semis (si ≥4), finale, et selon flags : 3e/5e/7e place (perdants des semis/quarts s'enchaînent dans les matchs de classement)
- bracket vide tant que les équipes ne sont pas qualifiées ; rempli quand l'admin clique "Générer les Flights" (après clôture des poules)

### A5. Qualification manuelle / réajustement

Action UI "Déplacer cette équipe vers Flight X" → `moveTeamToFlight(tournament_id, team_id, flight_id)` server fn :
- supprime l'équipe des matchs non-joués du Flight d'origine
- l'ajoute dans le Flight cible (à la position vacante ou en remplacement d'une équipe forfait)
- recalcule le bracket si nécessaire

Garde-fou : interdit si des matchs du Flight ont déjà commencé (status ≠ scheduled).

### A6. Classement final global

`computeOverallStandings(tournament)` agrège :
```
Flight A (sort_order=0) : 1=vainqueur, 2=finaliste, 3/4 selon match 3e place
Flight B (sort_order=1) : reprend à la place 1+offset (où offset = somme tailles flights précédents)
…
```
Affiché sur la page publique en fin de tournoi + onglet "Palmarès".

### A7. UI

- **Admin** : nouvel onglet "Flights" dans la page tournoi (à côté de Poules/Matchs).
  - Vide tant que les poules ne sont pas créées
  - Bouton "Configurer les Flights" → wizard : choix template (Champions League / Coupe-Plaque / Médailles / Custom) → choix distribution → édition libre des noms/couleurs/règles → "Générer"
  - Une fois généré : liste des Flights avec leurs brackets miniatures + bouton "Déplacer équipe"
- **Public** : nouvel onglet "Flights" (ou intégré au Bracket existant si 1 seul flight).
  - 1 carte par Flight avec son bracket, son champion en haut, médailles si tournoi terminé

### A8. Templates noms (i18n)

Trois templates pré-traduits dans `src/modules/tournaments/lib/flight-templates.ts` (FR/EN/DE/ES/IT/NL/PT) :
- `champions` : Champions / Europa / Conference
- `cup_plate` : Coupe / Plaque / Bowl / Shield
- `medals` : Or / Argent / Bronze

Plus option `custom` (saisie libre).

---

## Lot B — Consolante simple (PRIORITÉ 2)

Cas particulier du moteur Flight :
- 2 Flights uniquement
- Flight A = qualifiés (top N) avec bracket principal
- Flight B = non-qualifiés ("Consolante" / "Plaque" / nom libre)

Bouton wizard dédié "Format Coupe + Consolante" qui pré-remplit cette config en 1 clic. Aucun code spécifique — juste un preset du moteur Flight.

---

## Lot C — Planning intelligent (transverse, requis pour Flights)

Ce qui manque aujourd'hui pour rendre Flights utilisable :

- `scheduleMatchesAcrossFlights(matches, fields[], opts)` : assigne `scheduled_at` + `field` à tous les matchs encore vides, sans conflit
- Contraintes :
  - 1 match à la fois par terrain
  - 1 match à la fois par équipe
  - **Temps de repos minimum** entre 2 matchs d'une même équipe (nouvelle option `min_rest_minutes` sur `tournaments`)
  - Durée match + buffer (déjà existants)
- Vue planning globale : grille terrains × créneaux, déjà partiellement en place dans `FieldsManager` — étendre pour afficher tous les flights mixés avec un filtre.

Algo : greedy avec backtracking limité ; suffisant pour ≤200 matchs.

---

## Lot D — Reste petit

Déjà OK : streams par terrain, hockey OT, double-élim algo, swiss algo, round-robin a/r.

Manque côté UI :
- Vue **DoubleEliminationBracket** (Winner / Loser / Grand Final côte à côte) — composant React
- Bouton **"Générer la ronde suivante"** pour Swiss (admin)
- Préset "Hockey OT" déjà ajouté à `TournamentRulesEditor` — vérifier qu'il apparaît bien dans la UI rules à côté de Football/Volleyball

---

## Section technique

- **Tests Vitest** :
  - `proposeFlightDistributions` : 12, 13, 16, 24, 32 équipes
  - `qualifyTeamsToFlight` : application des règles (positions, wild cards, manuel, doublons)
  - `computeOverallStandings` : 3 flights × 3 tailles
  - Planning : pas de conflit terrain/équipe, respect repos
- **Migrations** : 1 seule migration pour le lot A (table + colonnes + grants + RLS via `can_manage_tournament` + lecture publique sur tournois publiés). 1 migration pour `min_rest_minutes`.
- **Régression** : tournois existants (`format` ∈ knockout/group/mixed) ignorent complètement les Flights. Les Flights ne s'activent que si l'admin clique "Configurer les Flights" après les poules.
- **i18n** : ~30 nouvelles clés dans `tournaments.json` × 7 langues (templates + UI Flights + Planning).

---

## Ordre d'exécution proposé

1. **Lot A (Flights)** — le morceau central
   - A1 migration → A2 types + générateur testé → A3 distributions → A4 bracket par flight → A7 UI admin/public → A6 palmarès → A5 manual moves → A8 templates i18n
2. **Lot B (Consolante)** — preset au-dessus du Lot A
3. **Lot C (Planning intelligent)** — débloque l'usage réel des Flights
4. **Lot D (UI manquantes)** — DoubleEliminationBracket + bouton ronde suisse

Estimation : Lot A = gros morceau (~3 PR internes), Lot B = trivial après A, Lot C = moyen, Lot D = petit.

Tu valides ce découpage et on attaque par **Lot A1 (migration)** ?
