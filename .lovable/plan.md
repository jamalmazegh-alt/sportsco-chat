
# Wizard de création d'événement

Objectif : reproduire la philosophie du wizard tournoi pour la création d'événements (entraînement, match, réunion, autre), avec un écran d'entrée enrichi, un questionnaire à auto-avance, et la prise en charge des **séries saisonnières** d'entraînement. Le wizard produit *exactement le même événement* que la création classique en réutilisant `EventFormSheet` et `createTrainingSeries`. **Zéro migration.**

## 1. Écran d'entrée « + Nouvel événement » (`EventCreateChooser`)

Nouveau composant `src/components/events/EventCreateChooser.tsx` ouvert à la place du bouton "Créer" actuel dans `src/routes/_authenticated/events.tsx` (header + EmptyState).

Portes affichées dans cet ordre :
1. ✨ **Créer avec l'assistant** (porte principale → wizard guidé)
2. 📋 **Reprendre le dernier entraînement** (si présent) → ouvre `EventFormSheet` pré-rempli depuis le dernier event `type=training` du coach
3. 📋 **Reprendre le dernier match** (si présent) → idem `type=match`
4. ⚙️ **Création classique** → `EventFormSheet` vide actuel
5. Si une série active est détectée pour l'équipe (`series_id` du dernier event), bonus : carte **« Créer en un tap »** (« ⚽ Entraînement U15 · Mercredi 18h30 · Stade principal » + bouton `Créer maintenant`).

Confirmation à la fermeture si progression non vide (pattern `clubero:event-wizard-draft` en `sessionStorage`, miroir de l'assistant tournoi).

## 2. Wizard guidé (`EventWizard`)

Nouveau composant `src/components/events/EventWizard.tsx` (UI inspirée de `TournamentAIAssistant` mais déterministe, sans LLM).

Structure :
- En-tête sticky « guide » qui reste visible (rappel du contexte de la question).
- Récap **« Ton événement »** en direct (carte qui se remplit au fil des réponses).
- Stepper visuel (barres remplies).
- Boutons cliquables, auto-avance, auto-scroll.
- Bouton « ← Retour » conserve toutes les réponses.
- Bouton « ⚙️ Réglages détaillés » à tout moment → ouvre `EventFormSheet` pré-rempli en surcouche, ferme proprement le wizard sans purger le draft.

### Questions (branches selon type)

| # | Question | Champ | Condition |
|---|---|---|---|
| 1 | Type (Entraînement / Match / Réunion / Autre) | `type` | toujours |
| 2 | Équipe | `team_id` | toujours |
| 3 | Quand ? (vrai `DateTimeField` + chips rapides « Ce soir / Demain / Samedi ») | `starts_at` | toujours |
| 4 | Durée → calcule `ends_at` (défauts par type : 90 min training, 105 min match, 60 min meeting) | `ends_at` | toujours |
| 5 | **Série / récurrence** (voir §3) | `series_id` | training, other |
| 6 | Domicile / extérieur | `is_home` | match |
| 6b | Point de rendez-vous | `meeting_point` | match extérieur |
| 7 | Adversaire | `opponent` (+ titre auto « U15 vs X ») | match |
| 8 | Officiel / amical | `is_official` + `competition_type` | match |
| 9 | Lieu (LocationAutocomplete existant + `location_url` Maps) | `location` | toujours |
| 10 | Convoquer ? (toute l'équipe / sélection / aucune) | flag interne → flux convocations existant | toujours |
| 11 | Covoiturage | `carpool_enabled` | match extérieur, training |

**Titre auto-généré** : `Entraînement <team>` / `<team> vs <opponent>` / `Réunion <team>`. Modifiable dans Réglages détaillés.

Écran final : récap + 2 actions
- **Créer** → POST event simple
- **Créer & convoquer** → POST + invocation flux convocations actuel (réutilisé tel quel)

## 3. Séries saisonnières (entraînements)

Étape 5 (`type=training` uniquement) :
```
○ Événement unique
○ Toutes les semaines (1 jour)        → choix du jour
○ Plusieurs jours par semaine          → cocher Lun..Dim
○ Planning personnalisé (slots détaillés)
```
Si série : champs `Début` / `Fin` de saison, et **aperçu live** : « Créer 42 entraînements ».

Au submit : appel `createTrainingSeries` (déjà existant, prend `slots[]`, `startsOn`, `endsOn`) — crée la ligne `training_series` parente + `training_series_slots` + N events enfants liés par `series_id`. **Pas de boucle de créations individuelles.**

Pour l'édition à portée (Google-Calendar-style) : déjà couverte par `updateSeriesOccurrence` / `deleteSeriesOccurrence` existants (rien à ajouter ici, hors périmètre wizard).

## 4. Brouillon auto-sauvegardé

`sessionStorage` clé `clubero:event-wizard-draft` :
- Snapshot à chaque réponse.
- À l'ouverture, si draft non vide : bandeau **« Reprendre votre brouillon ? »** (Reprendre / Repartir de zéro).
- Purge à la création réussie ou à l'abandon confirmé.

Helpers dans `src/components/events/event-wizard-draft.ts` (`readDraft`, `writeDraft`, `clearDraft`, `draftHasProgress`).

## 5. Création — un seul chemin

Le wizard mappe l'état interne vers `EventFormValues` (cf. `event-form-sheet.tsx` ligne 68) et :
- soit ouvre `EventFormSheet` en mode `create` pré-rempli (chemin « Réglages détaillés »),
- soit appelle directement la mutation `createEvent` interne du sheet via un export léger (refactor minimal : extraire `submitEvent(values, userId)` côté `event-form-sheet.tsx` pour la réutiliser depuis le wizard sans dupliquer la logique).

→ Garantit que wizard et form-sheet produisent le **même** event (mêmes invariants, mêmes invalidations React Query, mêmes convocations).

## 6. Branchement

- `src/routes/_authenticated/events.tsx` : remplacer les deux `EventFormSheet` actuels (header + EmptyState) par `<EventCreateChooser ...>`. Le `EventFormSheet` reste utilisé en interne (réglages détaillés + édition depuis la liste).
- i18n : nouvelles clés sous `src/locales/<lng>/events.json` (ou fichier dédié `event-wizard.json`) — FR rédigé, autres langues = copie FR + script `scripts/translate-locales.mjs` (suivi sur les langues déjà actives : en/de/es/it/nl/pt).

## 7. Tests

- Unit (`src/tests/unit/event-wizard.test.ts`) :
  - mapping wizard → `EventFormValues` (chaque type, branches match/training)
  - calcul `ends_at` selon durée
  - génération aperçu nombre d'occurrences (1 jour / multi-jours sur plage)
  - draft : write/read/clear/hasProgress
- Pas de nouveau E2E (hors scope rapide) ; vérification manuelle sur preview.

## 8. Critères d'acceptation (checklist du brief)

- [x] Deux portes : Assistant + Création classique
- [x] Event complet sans menu (toutes branches)
- [x] Match : adversaire, home/away, officiel, covoiturage
- [x] Entraînement : série saisonnière (1j / multi-j / perso, début→fin, aperçu)
- [x] Une série = `training_series` + enfants `series_id`
- [x] Édition/suppression à portée : déjà supportée par fns existantes
- [x] Reprendre dernier + brouillon auto
- [x] Vrai date-picker + chips rapides
- [x] Clic = next, guide visible, récap live, retour conserve tout
- [x] « Créer & convoquer » branche le flux existant
- [x] Même event que création classique
- [x] **Zéro migration**

## Détails techniques

**Nouveaux fichiers**
- `src/components/events/EventCreateChooser.tsx`
- `src/components/events/EventWizard.tsx`
- `src/components/events/event-wizard-draft.ts`
- `src/components/events/event-wizard-config.ts` (types `EventWizardState` + mapping → `EventFormValues` + helpers durée par défaut, titre auto, génération slots série)
- `src/locales/fr/event-wizard.json` (+ copies traduites pour en/de/es/it/nl/pt)
- `src/tests/unit/event-wizard.test.ts`

**Fichiers modifiés**
- `src/routes/_authenticated/events.tsx` (remplace les deux EventFormSheet du header/empty par EventCreateChooser, garde sheet pour édition)
- `src/components/event-form-sheet.tsx` : extraire la logique de submit en helper exporté `submitEventForm(values, userId, mode, supabase, …)` pour réutilisation par le wizard (refactor minimal, comportement inchangé)
- `src/i18n.ts` (déclaration namespace `event-wizard`) si namespaces explicites
- `.lovable/plan.md` : note d'avancement

**Pas touché**
- Schéma DB (zéro migration)
- `createTrainingSeries`, `updateSeriesOccurrence`, `deleteSeriesOccurrence`, flux convocations, carpool
- Wizard tournoi
