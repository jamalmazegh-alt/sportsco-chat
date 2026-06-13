
# Plan — 7 corrections tournoi

## 1. Simulateur : timeline visuelle
Restaurer une vue chronologique :
- Champ **heure de début** du tournoi (HH:MM, défaut 09:00)
- Barre horizontale avec 3 segments colorés : **Poules** (vert), **Éliminatoires** (orange), **Finales** (or)
- Largeur de chaque segment = durée calculée (matchs × durée / terrains + pauses)
- Heures de fin de chaque phase affichées sous les segments
- Recalcul instantané quand on change nb équipes / terrains / durée / pauses
- Heure de finale + heure de fin globale en gros au-dessus

Fichier : `src/modules/tournaments/components/TournamentSimulator.tsx` (+ helper dans `lib/planner.ts` si besoin).

## 2. Agent IA repositionné
Bouton flottant actuellement caché en bas-gauche derrière le bottom-nav.
→ Le déplacer en **bas-droite au-dessus du bottom-nav** (bottom: 80px right: 16px), ou **haut-droite** dans le header du dashboard tournoi.
→ Réduire taille (48px), badge "IA" discret.

Fichier : `src/modules/tournaments/components/TournamentAIAssistant.tsx` (FAB) ou wrapper dans `tournaments.$tournamentId.tsx`.

## 3. Récap wizard "à la carte" (vrai)
Le récap doit lister **chaque paramètre** comme une ligne cliquable :
```
Nb équipes        8         >
Durée match       15 min    >
Pauses            5 min     >
Déjeuner          12h-13h   >
Terrains          2         >
Prix              10 €      >
...
```
Click → `goToStep(stepId)` + `returnToSummaryRef = true`. Sur "Suivant" du step modifié → retour direct au récap (déjà implémenté côté logique, mais l'UI summary actuelle ne liste pas tous les items).

Fichier : `src/modules/tournaments/components/TournamentAIAssistant.tsx` (renderSummary).

## 4. Écran TV (`t.$slug.tv.tsx`)
Cartes match actuelles : noms tronqués, pas de terrain/horaire visibles.
→ Layout carte refondé :
- Ligne 1 : **Terrain N · HH:MM** (petit, muted)
- Ligne 2 : nom équipe A (taille réduite, `truncate` retiré au profit de `break-words` ou `text-balance`)
- Score
- Ligne 3 : nom équipe B
→ Réduire `text-3xl/4xl` à `text-xl` pour laisser place aux noms complets.

Fichier : `src/routes/t.$slug.tv.tsx` (et/ou `tournament.$slug_.tv.tsx`).

## 5. Classement final tournoi
Quand toutes les finales sont terminées :
- Si **mono-trophée** : podium 1/2/3 + classement complet
- Si **multi-flights** : podium 1/2/3 **par flight** (Champions, Coupe, etc.)
- Section "Classement final" en haut du dashboard (au-dessus des poules) avec confettis/trophées
- Bouton "Partager le classement"

Fichier : nouveau `src/modules/tournaments/components/FinalStandings.tsx` + intégration dans `tournaments.$tournamentId.tsx`.

## 6. "Régénérer les brackets" déplacé
Bouton actuellement bien visible dans le bloc Flights → **dangereux**.
→ Le retirer de la vue principale.
→ Le mettre dans le **menu détaillé** (settings tournoi / onglet "Avancé") avec double confirmation.

Fichier : `src/modules/tournaments/components/FlightsBlock.tsx` (ou équivalent) + déplacer vers settings.

## 7. État "démarré" automatique
Aujourd'hui on peut saisir tous les scores sans cliquer "Démarrer".
→ Quand le **premier score est saisi**, passer automatiquement `status = in_progress` côté server (mutation `recordMatchScore`).
→ Masquer le bouton "Démarrer le tournoi" si `status >= in_progress`.

Fichier : `src/modules/tournaments/tournaments.functions.ts` (mutation score) + UI dashboard.

---

## Ordre d'exécution
1. Simulateur timeline (autonome, gros impact UX)
2. FAB IA repositionné (5 min)
3. Récap wizard à la carte (impact UX)
4. TV layout
5. Auto-start tournoi
6. Régénérer brackets → settings
7. Classement final

Tests unitaires mis à jour pour le planner timeline + auto-start.

Confirmes-tu l'ordre et le contenu ?
