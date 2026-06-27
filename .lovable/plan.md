# Vue arbitre simplifiée du tournoi

Quand l'utilisateur n'est **que** collaborateur `referee` d'un tournoi (sans rôle admin/dirigeant club, pas créateur, pas co-organisateur), la page tournoi est réduite au strict minimum.

## Ce qu'il voit

- **Hero** light : nom du tournoi, sport, lieu, date, statut (logo si présent). Pas de bouton édition, pas d'upload logo.
- **Section Matchs** avec filtre « Mes matchs » pré-coché — il peut saisir les scores des matchs où il est désigné arbitre (RLS existante laisse passer).
- **Section Classements** (StandingsView) — consultation seule.
- **Section Phases finales / Bracket** si elles existent — consultation seule.
- **Classement final / podium** quand le tournoi est terminé.

## Ce qui disparaît

Stepper, ContinueCTA, AlertsPanel, Counters admin, LiveCourts cliquable, TournamentSettingsMenu (engrenage), PublishWorkflow, TournamentToClubBanner, bannière inscriptions OFF, TeamsManager, RegistrationsManager, FlightsManager, sticky CTA bas.

## Détection du rôle

Nouveau server fn `getMyTournamentRole({ tournament_id })` (auth requise) qui retourne `{ role: "owner" | "co_organizer" | "referee" | "viewer" }` en croisant :
- `tournaments.created_by` → owner
- `tournament_collaborators` (par `user_id` ou par email du JWT, `revoked_at IS NULL`) → co_organizer / referee
- sinon → viewer

Dans `tournaments.$tournamentId.tsx` :
```
isRefereeOnly = role === "referee" && !canManage
```
`canManage` reste basé sur `data.canManage || admin || dirigeant` (un admin de club n'est jamais downgradé).

## Liste tournois

Déjà OK depuis le fix précédent : `listMyPersonalTournaments` inclut les tournois où l'utilisateur est collaborateur (user_id ou email pending). pcolina verra donc uniquement Jamy Cup.

## Fichiers touchés

- `src/modules/tournaments/tournaments.functions.ts` — ajout `getMyTournamentRole`
- `src/routes/_authenticated/tournaments.$tournamentId.tsx` — branche conditionnelle `isRefereeOnly` qui rend un layout réduit (réutilise `MatchesList`, `StandingsView`, `BracketView`, `FinalStandings` existants)
- `MatchesList` reçoit déjà `currentUserId` et a un toggle « Mes matchs » — on l'auto-active via une nouvelle prop `defaultOnlyMine` quand `isRefereeOnly`.

Aucun changement DB / RLS — la sécurité réelle reste portée par les policies existantes ; la vue est uniquement un confort UX.
