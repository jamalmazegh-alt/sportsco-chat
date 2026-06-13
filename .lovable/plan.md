Gros lot multi-sujets sur le wizard tournoi + dashboard. Je propose de découper en 6 chantiers ordonnés par impact, livrés en une seule passe.

## 1. Wizard — fusion Pause + Déjeuner (1 écran)
- Supprimer les étapes séparées `lunchDuration` / `lunchStart`, fusionner avec `pause` en un seul écran "Pauses".
- Champs : pause entre matchs (presets + manuel), plage déjeuner (heure début + heure fin → on déduit `lunchDurationMin`), bouton "Pas de pause déjeuner".
- Mise à jour `assistantStepOrder`, `TournamentAIAssistant.tsx`, locales FR + sync EN/DE/ES/IT/NL/PT.

## 2. Wizard — prix tournoi avec presets + manuel
- Étape `paidAmount` : grille de chips (0, 5, 10, 15, 20, 30, 50 €) + champ "Autre montant" libre.
- Format cohérent avec la devise (cents internes, affichage €).

## 3. Wizard — récap final éditable à la carte
- Écran `summary` : liste cliquable de tous les groupes (Sport, Équipes, Format, Pauses, Terrains, Prix, Identité, Lieu).
- Clic sur un item → saut direct à l'étape correspondante, après modif **retour direct au summary** (pas de re-parcours).
- Implémentation : `pushReturnToSummary` flag dans state ; `goNext` détecte le flag et saute à `summary`.

## 4. Dashboard tournoi — poules en haut + refresh auto
- Réordonner les sections de `tournaments.$tournamentId.tsx` : bloc Poules / Fixtures **avant** les autres widgets, dès que le tournoi a un format à poules.
- Après tirage (`DrawDialog` onSuccess) : `queryClient.invalidateQueries` sur les clés poules + fixtures pour rafraîchissement immédiat.

## 5. Édition des poules avant le début des matchs
- Dans `GroupsAndFixtures` (status `published` ou `draft`, **avant** `in_progress`) : bouton "Modifier les poules" qui ouvre un éditeur drag-and-drop simple (déplacer une équipe d'une poule à l'autre, renommer).
- Verrouillage strict dès que `status === in_progress`.
- Sauvegarde via mutation existante de réassignation d'équipes aux poules.

## 6. Revue complète i18n
- Audit `tournaments.aiAssistant.*` sur 7 locales (FR ref + EN/DE/ES/IT/NL/PT) : corriger incohérences (mentions "lézard", "motif", placeholders mal traduits remontés par l'utilisateur).
- Lancer `scripts/sync-tournaments-i18n.mjs` après mise à jour des overrides dans `scripts/i18n-patches/*.json`.
- Vérifier `scripts/check-i18n-parity.mjs` passe.

## Détails techniques

- **State wizard** : ajout `returnToSummary: boolean` dans le draft `sessionStorage`. Réinitialisé après retour summary.
- **Lunch model** : on garde `lunchDurationMin` + `lunchStart` en interne (compat planner) mais l'UI expose début/fin.
- **Pool editor** : composant `PoolEditor.tsx` (nouveau), réutilise `pool_assignments` table, mutation `reassignTeamToPool` (à créer si absente).
- **Locales** : je liste les clés douteuses en commentaire dans les patches, puis sync.

## Hors scope (à confirmer si besoin)
- Pas de refonte visuelle du dashboard au-delà du réordonnancement.
- Pas de changement du modèle DB pour les poules (juste UI + mutation existante).

OK pour partir là-dessus ?
