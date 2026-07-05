# Feature « Défis & Tests » — Plan MVP

## Décisions cadrées

- **Périmètre** : MVP complet (schéma + RLS + tests RLS + UI saisie/classement + onglet Stats joueur + i18n).
- **Rattachement séance** : pas de table `training_sessions` dédiée. Les séances sont des lignes de `events` (type=`training`). Le champ sera `event_id UUID NULL` (référence à `events.id`).
- **VO₂ avec correction âge** : formules paramétrées, lues via `players.birth_date` (déjà présent).
- **UI** : design system Clubero (tokens sémantiques, shadcn), inspiration de la maquette pour la hiérarchie visuelle.

## Modèle de données

Nommage anglais, cohérent avec le schéma existant.

```text
challenges                      -- définition réutilisable
  id, club_id (FK clubs), team_id (FK teams, NULL = tout le club),
  season_id (FK seasons, NULL = permanent), created_by (FK auth.users),
  name, icon,
  kind         enum('challenge','physical_test'),
  unit         enum('count','time_seconds','distance_meters','stage'),
  direction    enum('higher_better','lower_better'),
  aggregate    enum('cumulative','record'),
  derived      enum('none','vo2_leger','vo2_cooper'),
  recurrence   enum('season','half_season','punctual'),
  ranking_visibility enum('staff','category'),  -- category = joueurs de la team
  template_key text NULL,
  is_active bool default true,
  created_at, updated_at

challenge_passages              -- une exécution datée
  id, challenge_id (FK), event_id (FK events NULL),
  passage_date date not null default current_date,
  created_by, created_at
  -- guard trigger: si event_id set, events.team_id doit matcher challenges.team_id (ou club)

challenge_results               -- 1 ligne par joueur/passage
  id, passage_id (FK cascade), player_id (FK cascade),
  value numeric CHECK (value >= 0),
  derived_value numeric NULL,   -- VO2 calculée serveur
  created_by, created_at, updated_at
  UNIQUE (passage_id, player_id)
```

Index : `(club_id)`, `(team_id, season_id)` sur challenges, `(challenge_id, passage_date)` sur passages, `(passage_id)`, `(player_id, created_at DESC)` sur results, `(event_id)` sur passages.

Formules VO₂ (fonction SQL immuable) :
- Léger : `vo2 = 3.5 * paliers_kmh(stage)` où `paliers_kmh(n) = 8 + 0.5*(n-1)`.
- Cooper : `vo2 = (distance_m - 504.9) / 44.73`.
- Correction âge (U13 et moins) : `vo2_ajustee = vo2 * age_factor(age)` — table de facteurs paramétrable (`age_factor` fonction).

## RLS et sécurité

- Toutes tables : RLS ON, `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`. Pas de `TO anon`.
- Helper existant réutilisé : `has_club_role(uid, club_id, role)`.
- Nouveau helper `public.can_read_challenge(uid, challenge_id)` (SECURITY DEFINER) qui centralise :
  - staff (admin/coach/dirigeant du club) → true ;
  - joueur/parent de la team + `ranking_visibility='category'` + `kind='challenge'` → true ;
  - sinon false.

Policies :

| Table | Action | Qui |
|---|---|---|
| challenges | SELECT | staff du club, ou membre catégorie si visibilité ouverte |
| challenges | INS/UPD/DEL | staff (admin/coach) du club_id |
| challenge_passages | SELECT | via `can_read_challenge(challenge_id)` |
| challenge_passages | INS/UPD/DEL | staff du club |
| challenge_results | SELECT | staff **OU** (le joueur lui-même) **OU** (parent lié via `player_parents.parent_user_id`) **OU** (autre joueur de la team si visibilité `category` ET `kind='challenge'`) |
| challenge_results | INS/UPD/DEL | staff uniquement |

**Verrous absolus** : `kind='physical_test'` ⇒ résultats jamais lisibles hors staff / joueur concerné / parent lié. `derived_value` (VO₂) filtrée en vue applicative : ne sort jamais dans un payload lisible par d'autres joueurs, même en cumul.

## Modèles prêts à l'emploi

Seed statique côté code (`src/lib/challenges/templates.ts`, i18n keys pour name/icon) — pas en DB, pour rester éditable. Modèles : Cross Bar (cumul), Jonglerie (record), Luc Léger (test, VO₂), Cooper 12 min (test, VO₂), Sprint 20 m (record, lower_better).

## Server functions (`src/modules/challenges/`)

- `challenges.functions.ts` : `listChallenges({ teamId, seasonId })`, `createChallenge`, `updateChallenge`, `archiveChallenge`.
- `passages.functions.ts` : `createPassage({ challengeId, eventId? })`, `listPassages({ challengeId })`.
- `results.functions.ts` : `upsertResults({ passageId, entries: [{player_id, value}] })` — calcule `derived_value` côté serveur si `derived != 'none'` en lisant `players.birth_date`. `getRanking({ challengeId, seasonId })` — renvoie cumul ou record selon `aggregate`, filtre `derived_value` selon le lecteur (via middleware auth + `has_club_role`).
- `player-stats.functions.ts` : `getPlayerChallengeStats({ playerId })` — regroupe par challenge, retourne série temporelle + agrégat ; masque VO₂ si lecteur non-staff.

Toutes sous `.middleware([requireSupabaseAuth])`. Guards : `assertClubRole` réutilisé pour écritures.

## UI

- **Page événement (entraînement)** : bouton *Ajouter une activité* → sheet avec 3 groupes (Exercice · Défi · Test). Sélection modèle ou création sur mesure. Liste des activités rattachées à la séance avec bouton *Saisir*.
- **Écran saisie** (`/_authenticated/events/$eventId/challenge/$passageId.tsx`) : liste des présents (via `player_availabilities`), `ScoreStepper` (composant existant) pour count/stage, input numérique pour time/distance. Compteur X présents · Y saisis. CTA « Voir le classement ».
- **Écran classement** : podium + liste. Badge visibilité. Toggle staff pour ouvrir/fermer.
- **Onglet Stats joueur** (`/_authenticated/players/$playerId/challenges.tsx`, ou intégré dans l'onglet stats existant) : cartes par challenge, mini-graphe (recharts déjà dispo), agrégat explicite « Total saison » ou « Record ». Section « Suivi du staff » verrouillée si lecteur non-staff.

## i18n

Nouveau namespace `challenges` dans les 7 langues (fr/en/de/es/it/nl/pt). Aucun texte en dur. Termes produit : Défi / Test physique / Activité / Total saison / Record / Visible du staff / Visible de la catégorie.

## Tests

- **Unit** (`src/tests/unit/challenges-vo2.test.ts`, `challenges-ranking.test.ts`) : formules VO₂ (± age factor), agrégats cumul vs record, direction lower/higher.
- **RLS** (`tests/rls/challenges.rls.ts`) : les 8 cas listés dans le brief (staff écrit/lit, joueur bloqué en `staff`, joueur lit en `category`, jamais test physique, jamais stats d'un autre, parent lié = OK, parent non lié = KO, autre catégorie = KO, coach eval + VO₂ toujours staff-only).

## Découpage de livraison

1. **Migration** (tables, enums, indexes, contraintes, GRANTs, RLS, `can_read_challenge`, `vo2_leger/vo2_cooper/age_factor`, trigger cohérence `event_id`).
2. **Templates + server functions + guards**.
3. **UI saisie + classement** depuis la page événement.
4. **Onglet Stats joueur**.
5. **i18n 7 langues** (script sync existant).
6. **Tests unit + RLS**, `bun run test` + `bun run test:rls`.

## Hors scope (rappel)

Accès parent frontend complet, badges, comparaison inter-saisons, IA bilan hebdo, objectifs équipe, export.

---

Approuve pour que je démarre par la migration.
