
# Player Journey — Plan d'implémentation

Transformer le profil joueur en parcours sportif long-terme avec saisons, palmarès et timeline.

## 1. Base de données (1 migration)

**Tables créées** :
- `player_achievements` — palmarès (champion, MVP, top scorer, etc.) avec status (suggested/confirmed/hidden/rejected), visibility (private/club/public), source (manual/tournament/league/coach/system).
- `player_seasons` — une ligne par (joueur, club, saison), avec coach_summary manuel. Stats (matches/goals/assists/attendance) calculées à la volée via vue SQL — pas stockées.
- `player_timeline_events` — fil chronologique (joined_club, first_match, first_goal, matches_milestone, achievement, season_completed, etc.).

**GRANTs + RLS** :
- SELECT : private = joueur + parents liés + coach/admin ; club = membres du club ; public = tout le monde (anon inclus).
- INSERT : coaches/admins, parents pour leur enfant.
- UPDATE status : coach/admin/parent. UPDATE visibility : parents/admins seulement. UPDATE title/desc : coach/admin.
- DELETE : admins.
- `player_seasons` : SELECT membres club, INSERT/UPDATE coach/admin, DELETE admin.

**Triggers auto** :
- `AFTER INSERT club_members` → timeline `joined_club`.
- `AFTER UPDATE convocations` (présence sur match) → `first_match` + `matches_milestone` (10/25/50/100).
- `AFTER INSERT match_events` (goal) → `first_goal`.
- `AFTER UPDATE player_achievements` (status → confirmed) → timeline `achievement`.
- `AFTER UPDATE tournaments` (status → closed) → suggested achievements pour finalistes/vainqueurs.

**Vue `player_season_stats`** : calcule matches/goals/assists/attendance par (player, club, season) depuis convocations + match_events.

**Forçage privacy mineurs** : trigger BEFORE INSERT qui force visibility='private' si âge < 18.

## 2. Server functions (`src/lib/player-journey.functions.ts`)

- `getPlayerAchievements(playerId)` — liste filtrée par RLS.
- `createAchievement / updateAchievement / deleteAchievement`.
- `confirmAchievement / rejectAchievement` — change status.
- `getPlayerSeasons(playerId)` — joint vue stats + coach_summary.
- `updateSeasonSummary(seasonId, text)`.
- `getPlayerTimeline(playerId)`.
- `createTimelineEvent / deleteTimelineEvent`.

## 3. UI — onglets sur `/players/$playerId`

Ajouter 3 nouveaux onglets après "Profil" : **Saison · Palmarès · Timeline**. Onglets existants (Retours coach, Suspensions, etc.) préservés.

**Composants créés** dans `src/components/player-journey/` :
- `achievements-tab.tsx` — grille de badges (icônes par type), section "En attente de confirmation" pour coach/admin/parent, bouton "Ajouter un palmarès" → sheet form.
- `seasons-tab.tsx` — cards empilées (saison récente en haut) : titre saison, club + équipe + catégorie, stats inline, mini-badges achievements liés, coach_summary éditable inline pour coach/admin.
- `timeline-tab.tsx` — fil vertical chronologique, icône + date + titre + description, bouton "Ajouter un moment" (coach/admin/parent).
- `achievement-badge.tsx` — composant visuel réutilisable (icône emoji + label + variant).
- `achievement-form-sheet.tsx` — form ajout/édition (type select, titre, saison, date, description, visibility).
- `timeline-event-form-sheet.tsx` — form ajout moment manuel.
- `visibility-select.tsx` — petit select private/club/public.

Design mobile-first : cards, badges, pas de tableaux. Tons sobres, palette existante.

## 4. i18n

Ajouter le namespace dans `src/locales/fr/common.json` et `en/common.json` : `journey.tab.*`, `achievement.type.*`, `achievement.status.*`, `achievement.visibility.*`, `timeline.event.*`, `season.*`.

## 5. Hors scope MVP (préparé architecturalement)

- Résumés IA, profil public partageable, vidéos, profil recrutement → pas implémentés mais le champ `visibility='public'` et la séparation `player_seasons` permettront l'extension.

---

**Ordre d'exécution** : migration DB (avec ta confirmation) → server functions → composants UI + onglets → i18n → vérif build.

Approuvé ?
