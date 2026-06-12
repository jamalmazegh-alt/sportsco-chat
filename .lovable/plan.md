## Partie 1 — Suppression du type "Autre"

**Pourquoi :** type inutile, source de confusion (voir l'événement caché dans les passés).

- Retirer `"other"` du type `EventType` (`src/components/event-form-sheet.tsx`).
- Retirer le bouton "Autre" du sélecteur de type (boucle ligne 666).
- Retirer toutes les branches `type === "other"` dans le form-sheet (envoi convoc, suspensions, etc.) et dans `src/routes/_authenticated/events/$eventId.tsx`.
- Supprimer les clés i18n `events.typeOther` dans les 7 locales.
- Migration : convertir les events existants `type='other'` → `type='meeting'` (le plus proche fonctionnellement) pour ne pas perdre l'historique.
- Optionnel : ajouter un check CHECK sur la colonne `events.type` pour interdire `'other'`.

---

## Partie 2 — Refonte des entraînements récurrents

Remplacer le champ "Répéter pendant X semaines" par un vrai planificateur de saison, type Google Calendar.

### 2.1 Modèle de données

Nouvelle table `training_series` :

- `team_id`, `created_by`
- `title`, `description`, `location` (défauts pour les séances)
- `starts_on` (date), `ends_on` (date)
- `is_official` (bool, défaut true pour les entraînements)
- `excluded_dates` (date[]) — exclusions ponctuelles
- timestamps + RLS comme `events`

Nouvelle table `training_series_slots` (créneaux hebdo) :

- `series_id` → `training_series.id` (cascade)
- `weekday` (0–6)
- `meeting_time`, `start_time`, `end_time` (time)
- `location` (override optionnel)
- `position` (ordre d'affichage)

Sur `events`, ajout :

- `series_id` uuid null → `training_series.id` (set null on delete)
- `series_slot_id` uuid null → `training_series_slots.id`
- `series_detached` bool default false (true = occurrence modifiée, ignorer les updates de série)

Index : `events(series_id, starts_at)`.

RLS : mêmes règles que `events` (membres du club/équipe via helpers existants).

### 2.2 Server functions (`src/lib/training-series.functions.ts`)

- `createTrainingSeries({ teamId, title, location, startsOn, endsOn, isOfficial, slots[], excludedDates[] })` :
  - insère la série + slots
  - génère toutes les occurrences `events` (type=`training`, status=`published`, `series_id`, `series_slot_id`, `is_official`)
  - retourne `{ seriesId, createdCount, conflicts[] }` (conflits = events existants même équipe + même créneau)
- `previewTrainingSeries(...)` : renvoie la liste des dates générées + conflits, sans écrire (utilisé par la prévisualisation calendrier en live).
- `updateOccurrence({ eventId, scope: "single" | "future" | "all", patch })` :
  - `single` : update event + marque `series_detached=true`
  - `future` : recrée les events futurs (≥ date courante) à partir d'un patch slot
  - `all` : update série + slots + recrée toutes les occurrences non-détachées et sans données (présences/convocs/stats/messages préservées : on update au lieu de recréer si l'event a des FK).
- `deleteOccurrences({ eventId, scope })` : équivalent suppression.
- `addExcludedDate({ seriesId, date | { from, to } })` : ajoute à `excluded_dates` et supprime les events correspondants **sans données** (sinon warning).

Préservation des données : avant tout DELETE/recreate, vérifier l'existence de lignes liées dans `convocations`, `event_lineups`, `event_messages`, `match_results`, `event_goals`, `player_feedback`. Si présentes → UPDATE in-place uniquement.

### 2.3 UI — `event-form-sheet.tsx`

Lorsque `type === "training"` en mode create, remplacer la section "Répéter" actuelle par :

1. **Toggle radio** : "Séance unique" / "Planning récurrent" (récurrent par défaut).
2. **Si récurrent**, masquer le date+heure unique et afficher :
   - Date début / date fin (date pickers)
   - Liste de créneaux (composant `SeriesSlotsEditor`) :
     - Jour de semaine (Select Lun→Dim)
     - RDV, Début, Fin (TimePicker existant)
     - Terrain (Input ou Select sur lieux club)
     - Bouton "+ Ajouter un créneau", bouton supprimer par ligne
   - **Calendrier de prévisualisation** (`SeriesPreviewCalendar`) basé sur shadcn Calendar :
     - met en évidence toutes les dates générées
     - clic sur date incluse → l'exclut (ajoute à `excludedDates`)
     - clic sur date exclue → la réintègre
     - badge visuel pour les dates en conflit (couleur destructive)
   - Section "Dates exclues" : liste + bouton "+ Date unique" / "+ Période"
   - **Résumé dynamique** sous le calendrier : "X séances du lundi, Y du mercredi… Total : N séances. Z dates exclues."
   - Warning conflits terrain si overlap détecté.

### 2.4 UI — Édition / suppression d'une occurrence

Dans `events/$eventId.tsx` (et menu contextuel liste) :

- Si `event.series_id` non null, à l'enregistrement ou suppression : ouvrir un `AlertDialog` "Que souhaitez-vous modifier/supprimer ?" avec 3 radios (Cette séance / Cette séance et les suivantes / Toute la série).
- Appel server fn `updateOccurrence` / `deleteOccurrences` selon scope.

### 2.5 i18n (7 langues : fr, en, de, es, it, nl, pt)

Nouvelles clés sous `events.series.*` : modeSingle, modeRecurring, period, startDate, endDate, slots, addSlot, weekday, meetingTime, startTime, endTime, location, preview, excludedDates, addSingleDate, addPeriod, summary, totalSessions, conflictWarning, editScope.{single,future,all}, deleteScope.{single,future,all}, dataPreserved, etc.

### 2.6 Hors scope (explicitement)

Vacances scolaires auto, sync Google Calendar, règles "1 semaine sur 2", créneaux alternés.

---

## Détails techniques (résumé pour devs)

- Génération des dates : itération `addDays` entre `startsOn` et `endsOn`, filtrer par `slot.weekday`, exclure `excludedDates` + plages exclues.
- Construction de `starts_at` / `ends_at` events : combine la date à `slot.start_time` et `slot.end_time` (timezone club).
- Conflits terrain : query `events` même `team_id`+`location`+overlap horaire avant insertion.
- `editScope === "future"` : pivot = `event.starts_at` ; update tous les events `series_id = X AND starts_at >= pivot AND series_detached = false`.
- Migration data : `UPDATE events SET type='meeting' WHERE type='other'` puis CHECK constraint.

---

## Étapes d'implémentation

1. Migration suppression "other" + conversion en "meeting".
2. Migration création `training_series` + `training_series_slots` + colonnes sur `events` (+ RLS + GRANTs).
3. `training-series.functions.ts` (preview/create/update/delete).
4. Composants `SeriesSlotsEditor`, `SeriesPreviewCalendar`, `EditSeriesScopeDialog`.
5. Refonte de la section "Répéter" dans `event-form-sheet.tsx`.
6. Branchement édition/suppression scope dans `events/$eventId.tsx`.
7. Traductions × 7 langues.
8. Tests : unit pour générateur de dates + détection conflits.

Estimation : gros chantier (~600-900 lignes), à valider avant de lancer.