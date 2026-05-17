## Onglet "Stats" dédié

Créer une nouvelle route `/stats` accessible depuis la navigation principale pour tous les rôles, avec un scope adapté au rôle. Cela retire les blocs stats actuellement mélangés dans `home.tsx`, `players/$playerId.tsx` et `teams/$teamId.tsx` pour les centraliser.

### Données disponibles aujourd'hui
- `convocations.status` → présence (présent / absent / incertain / en attente)
- `event_goals` (scorer, assist, kind=goal/own_goal, minute) → buts & passes décisives
- `match_results` (home_score, away_score, is_home) → victoires / nuls / défaites
- `events.type` (training / match / autre) + `competition_type` → filtres

### Scope par rôle

**Joueur / Parent (vue d'un enfant)**
- Sélecteur joueur (auto si 1 seul, sinon enfants + soi-même)
- Présence: % présent, absent, incertain, nb d'événements convoqués
- Performances match: buts, passes décisives, matchs joués
- Heatmap de présence (existante)
- Filtres: période (saison / 30j / tout), type d'événement

**Coach (équipes coachées)**
- Sélecteur d'équipe
- Vue **Équipe**: bilan matchs (V/N/D, buts pour/contre, diff), taux de présence global, prochains événements
- Vue **Joueurs**: tableau triable par joueur (matchs joués, buts, passes, %présence, %absence) → permet d'identifier meilleurs buteurs / passeurs / assidus
- Filtres: type d'événement (tous / matchs / entraînements), compétition, période

**Admin / Dirigeant (club)**
- Sélecteur d'équipe (toutes les équipes du club) + vue agrégée club
- Agrégats club: nb matchs, V/N/D global, taux de présence moyen
- Classement équipes (taux de présence, ratio victoires)
- Tout ce que voit le coach pour chaque équipe

**Super admin**
- Pas d'onglet Stats joueur — il a déjà `/admin` avec ses métriques plateforme. On ne l'ajoute pas dans la nav stats.

### Structure technique

- Nouvelle route: `src/routes/_authenticated/stats.tsx`
- Lien dans la navigation principale (bottom nav mobile + sidebar desktop) — visible pour player / parent / coach / admin / dirigeant
- Composants réutilisables existants: `PlayerAttendanceStats`, `TeamAttendanceStats`, `AttendanceHeatmap`
- Nouveaux composants:
  - `StatsTeamSummary` — V/N/D + buts pour/contre depuis `match_results`
  - `StatsPlayersTable` — tableau triable (buts, passes, %présence) avec headers cliquables
- Toutes les requêtes scoppées par RLS existantes (les policies actuelles suffisent: `can_view_team`, `events_select`, `event_goals_select`, `match_results_select`)
- Pas de migration DB nécessaire

### Nettoyage ultérieur (étape suivante, pas dans ce lot)
Une fois l'onglet validé, on pourra retirer les blocs stats redondants de `home.tsx`, garder une version condensée sur `players/$playerId.tsx` (juste un résumé + lien vers Stats) et idem sur `teams/$teamId.tsx`.

### Questions ouvertes
1. Veux-tu que je supprime tout de suite les stats de `home.tsx` / page joueur / page équipe, ou je commence par créer l'onglet sans rien retirer pour que tu valides la nouvelle page d'abord ?
2. Pour le tableau joueurs côté coach, tu veux quelles colonnes par défaut ? Je propose: Joueur · Matchs joués · Buts · Passes · % Présent · % Absent (triables).