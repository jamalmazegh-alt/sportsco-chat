# Match scoring & stats par sport (V1)

Objectif : adapter la saisie de score et de stats joueurs au sport de l'équipe, en restant volontairement simple. Sports supportés : football, futsal, basketball, rugby, handball, volleyball, ice_hockey.

---

## 1. Sport config (front, pas de table)

Nouveau fichier `src/lib/sport-config.ts` qui exporte, par clé sport :

- `scoreLabel` : `goals` | `points` | `sets`
- `statKinds` : sous-ensemble de `goal | assist | try | point | yellow_card | red_card | foul | penalty`
- `assistsEnabled`, `cardsEnabled`, `setScoresEnabled`, `minuteEnabled`
- `defaultStatKind` (ce qui s'ajoute en 1 clic)

Mapping :

| Sport       | Score | Stats joueur                                |
|-------------|-------|---------------------------------------------|
| football    | goals | goal, assist, yellow_card, red_card         |
| futsal      | goals | goal, assist, yellow_card, red_card         |
| basketball  | points| point, assist, foul                         |
| rugby       | points| try, yellow_card, red_card                  |
| handball    | goals | goal, yellow_card, red_card (assist opt.)   |
| volleyball  | sets  | point (+ set scores)                        |
| ice_hockey  | goals | goal, assist, penalty                       |

Tout sport non listé tombe en mode "score only" (home/away + notes).

---

## 2. Migration DB

Renommer/élargir le modèle existant pour rester générique :

- `match_results` : ajouter `score_details JSONB NULL` (utilisé pour les sets de volley : `{ "sets": [[25,22],[23,25],…] }`).
- `event_goals` → garder le nom (déjà des données) mais :
  - élargir la contrainte `kind` pour accepter : `goal`, `own_goal`, `penalty`, `assist`, `try`, `point`, `yellow_card`, `red_card`, `foul`.
  - rendre `assist_player_id` toujours nullable (déjà le cas).
  - garder `minute` nullable.
  - Pas de renommage de table pour préserver les données.

RLS inchangée (déjà coach-write / view-team-read).

---

## 3. UI : `MatchResultCard`

Refactor `src/components/match-result-card.tsx` :

- Récupère le `sport` de l'équipe via `teams.sport`.
- Résout `cfg = getSportConfig(sport)`.
- Inputs score :
  - `goals`/`points` → 2 inputs numériques (home/away) + label dynamique.
  - `sets` (volley) → home/away = sets gagnés + bouton "Ajouter set" qui pousse `[home, away]` dans `score_details.sets[]`. Affichage : `3-2 (25-22, 23-25, 25-20…)`.
- Liste d'événements joueurs (renommer "Scorers" en "Player events" / `match.playerEvents`) :
  - Filtrer par `cfg.statKinds`.
  - Form add : sélecteur `kind` limité à `cfg.statKinds`, sélecteur joueur (convoqués), `assist` masqué si `!cfg.assistsEnabled` ou si kind ∈ cards/foul/penalty, `minute` masqué si `!cfg.minuteEnabled`.
  - Affichage : icône + couleur selon kind (carton jaune/rouge, but, etc.).
- Outcome (win/loss/draw) :
  - sports score-based (goals/points) → comparer scores.
  - volley → comparer sets gagnés.

---

## 4. Stats joueur

`src/components/player-attendance-stats.tsx` (ou son équivalent) :

- Ajouter agrégats par `kind` selon le sport principal du joueur (déduit de l'équipe). Affiche compteurs des kinds pertinents seulement (ex : basketteur → points/assists/fouls ; rugbyman → tries/cards).
- Calcul côté client à partir de `event_goals` filtré par `scorer_player_id = playerId`.

---

## 5. i18n

Ajouter clés FR/EN dans `match.*` et `match.kinds.*` :
`yellowCard`, `redCard`, `foul`, `try`, `point`, `assist`, `set`, `addSet`, `setsWon`, `playerEvents`, `addEvent`, `kind`, etc.

---

## 6. Ordre d'exécution

1. Migration `match_results.score_details` + élargissement contrainte `event_goals.kind`.
2. `src/lib/sport-config.ts`.
3. Refactor `MatchResultCard`.
4. Mise à jour stats joueur.
5. i18n FR/EN.

Pas d'impact sur l'IA assistant ni sur les autres écrans.
