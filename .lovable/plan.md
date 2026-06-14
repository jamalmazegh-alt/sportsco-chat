## Périmètre — 7 éléments

### 1. Wizard ↔ Réglages détaillés (retour)
`EventCreateChooser.tsx` : quand on ouvre l'expert depuis le wizard (`expert-prefilled`), ajouter dans `EventFormSheet` (ou via wrapper) un bouton « ← Retour à l'assistant » qui ferme le sheet et rouvre le wizard avec l'état préservé. Quand on quitte l'expert via la croix dans ce mode, demander confirmation puis revenir au wizard au lieu de tout fermer.

### 2. Type de compétition dans le wizard (amical/championnat/coupe + nom préempli)
`EventWizard.tsx` étape `official` :
- 3 boutons (amical / championnat / coupe) au lieu de 2.
- Si championnat ou coupe sélectionné, ajouter un champ `competition_name` pré-rempli depuis `teams.competitions` (1er élément) via les options déjà exposées par `competitionOptions`. Étendre `Team` du wizard avec `competitions`.
- Mapper `competition_name` dans `toEventPayloadInput` + `toEventFormInitial`.

### 3. Croix « parfois ne fonctionne pas »
Dans `EventCreateChooser`, l'`EventFormSheet` reste monté avec `open={isExpert && open}`. Quand `mode === "chooser"` et `open === true`, le `Dialog` du chooser est ouvert et la croix appelle `onOpenChange(false)` qui passe par `close()` → OK. Mais quand on est en `mode === "wizard"` la croix du Dialog appelle aussi `close()` → confirm. Le souci probable : la confirm() native peut être bloquée par certains navigateurs/iframe → utiliser le `AlertDialog` shadcn à la place, et ne PAS demander confirmation si aucun champ n'a été touché (déjà via `draftHasProgress`). Aussi : forcer `e.preventDefault()` dans `onOpenChange` quand on annule pour que Radix ne referme pas en arrière-plan.

### 4. Icônes par type sur les cartes d'événements
`src/routes/_authenticated/events.tsx` + `home.tsx` (cartes upcoming) : ajouter un petit badge avec icône Lucide à côté du titre — `Dumbbell` (training), `Swords` (match), `Trophy` (tournament), `Users` (meeting), `Calendar` (other). Réutiliser un helper `getEventTypeIcon(type)` partagé dans `src/lib/event-type-icon.tsx`.

### 5. Raisons préselectionnées pour annulation/report
Dans `events/$eventId.tsx` dialogs cancel/reschedule : ajouter une grille de chips au-dessus du Textarea — « Terrain impraticable », « Manque de joueurs », « Météo », « Décision arbitrale », « Adversaire forfait », « Autre ». Cliquer un chip remplit le textarea (texte libre toujours possible). i18n keys `events.cancelReasonPresets.*`.

### 6. Bloquer score / faits de match si event annulé
- `event-form-sheet.tsx` : si `initial.status === "cancelled"`, désactiver les champs `is_official` n'a pas de sens — surtout cibler la page de détail :
- `events/$eventId.tsx` : si `event.status === "cancelled"`, masquer ou désactiver les sections « Résultat du match » (`MatchResultCard`) et « Faits de match » (`event_goals` / lineup goals UI). Afficher un bandeau "Événement annulé — édition du score désactivée".

### 7. Reset password non reçu (Mazegh.jamal@free.fr)
Diagnostic uniquement, pas de code :
- Vérifier `email_send_log` : statut, error_message, suppression.
- Vérifier `suppressed_emails` pour cette adresse (free.fr a un anti-spam strict — possible bounce/complaint).
- Vérifier que le hook auth pousse bien sur `auth_emails` (pas l'ancienne version sync).
- Rapport à l'utilisateur avec la cause + action (lever suppression / lui demander de vérifier spam).

## Ordre d'exécution
1, 2, 3 (wizard cluster) → 4 (icônes) → 5, 6 (event detail) → 7 (diagnostic email).

## Hors scope
Pas de refonte du `EventFormSheet`, pas de nouvelle table cancellation_reasons.
