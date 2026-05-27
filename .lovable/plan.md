
# Covoiturage événements · V1 — Plan d'implémentation

Feature de mise en relation parents/coaches pour organiser le transport vers les événements (déplacements principalement).

## 1. Migration base de données

Une seule migration `add_event_carpooling`:

- `events`: ajouter colonne `carpool_enabled boolean NOT NULL DEFAULT false`. Trigger BEFORE INSERT/UPDATE qui force `carpool_enabled = true` si `is_home = false` ET la colonne n'a pas été explicitement modifiée (via défaut à la création; l'admin garde la main pour désactiver ensuite).
- Table `carpools` (id, event_id FK CASCADE, driver_user_id FK auth.users, driver_name, vehicle_type CHECK in ('car','van'), total_seats int CHECK 1-8, departure_note, created_at). Unique `(event_id, driver_user_id)`.
- Table `carpool_passengers` (id, carpool_id FK CASCADE, passenger_user_id FK, player_ids uuid[], created_at). Unique `(carpool_id, passenger_user_id)`. Trigger qui empêche un même `passenger_user_id` d'être dans deux carpools du même event (un seul véhicule par parent par event).
- Table `carpool_needs` (id, event_id FK CASCADE, parent_user_id FK, player_ids uuid[], note, created_at). Unique `(event_id, parent_user_id)`.
- GRANTS standards pour `authenticated` + `service_role` sur les trois tables.
- RLS sur les trois tables, scopée via `events → teams → clubs` et appartenance club:
  - SELECT: tout membre du club de l'event.
  - INSERT/UPDATE/DELETE carpools: le conducteur lui-même OU coach/admin du club.
  - INSERT/DELETE carpool_passengers: le passager lui-même (sur des player_ids dont il est parent et convoqués `present|uncertain`) OU coach/admin.
  - INSERT/UPDATE/DELETE carpool_needs: le parent lui-même OU coach/admin.
- Publication realtime: ajouter `carpools`, `carpool_passengers`, `carpool_needs` à `supabase_realtime`.

## 2. Notifications

Ajouter 4 nouveaux types dans le système de notifications existant (`notifications` table déjà utilisée pour convocations):
- `carpool_new_driver` → parents convoqués sans transport
- `carpool_booked` → conducteur
- `carpool_cancelled` → conducteur
- `carpool_needs_ride` → coaches/admins du team

Implémenté via triggers Postgres (cohérent avec convocations) qui insèrent dans `notifications`.

## 3. UI — Onglet covoiturage

Nouveau composant `src/components/carpool-tab.tsx` rendu dans `src/routes/_authenticated/events/$eventId.tsx`, visible quand `carpool_enabled = true`. Ajout d'un onglet "🚗 Covoiturage" dans la barre d'onglets existante.

Sous-composants dans `src/components/carpool/`:
- `CarpoolDisclaimer.tsx` — encart gris en haut.
- `CoverageBar.tsx` — jauge coach/admin (vert/orange/rouge).
- `WithoutTransportList.tsx` — liste compacte coach.
- `DriverCard.tsx` — carte conducteur + bouton Réserver.
- `OfferSeatsForm.tsx` — formulaire commun coach/parent.
- `ReserveSeatDialog.tsx` — modal sélection joueurs.
- `NeedRideButton.tsx` + dialog associé.
- `CarpoolToggle.tsx` — toggle coach/admin sur la page event (au-dessus de l'onglet).

Realtime via `supabase.channel('carpool:'+eventId)` avec `postgres_changes` sur les 3 tables filtrés par event_id. Optimistic updates côté React Query (`setQueryData` avant mutation).

## 4. Règles métier (vérifiées côté client + RLS)

- Un parent ne peut réserver que dans un véhicule par event (contrainte trigger + UI).
- Places restantes calculées: `total_seats − sum(carpool_passengers où carpool_id = X)` — chaque passager compte pour 1 (le nombre d'enfants n'occupe pas des places séparées en V1, conforme au prompt qui dit "places dispo (conducteur exclu)" et "Réserver une place").
- Conducteur ne peut pas réserver dans son propre véhicule (UI + check).
- Seuls parents de joueurs convoqués (present/uncertain) peuvent agir.
- Auto-suppression `carpool_needs` quand le parent réserve (déclenché via trigger ou côté client après insert).

## 5. Traductions

Ajouter le bloc `carpool.*` dans `src/locales/fr/common.json` et `src/locales/en/common.json` (la structure existante stocke les libellés généraux dans `common.json`; à confirmer en lecture).

## 6. Ce qu'on ne fait PAS en V1

Pas de GPS, auto-matching, minibus, tableau global, heure obligatoire, chat dédié.

## Détails techniques

- Toutes les mutations passent par le client Supabase (RLS), pas de server function nécessaire (cohérent avec les autres actions sur events).
- Le toggle `carpool_enabled` est un simple `update` sur `events` avec policy existante coach/admin.
- Les notifications passent par des triggers SQL `AFTER INSERT` sur `carpools`, `carpool_passengers`, `carpool_needs`, qui insèrent dans la table `notifications` en récupérant la liste des destinataires depuis `convocations` (parents) et `team_members` (coaches).
- Realtime: ajout de la souscription dans un `useEffect` du composant `CarpoolTab`, invalidation des queries React Query au lieu de mutations manuelles (plus simple, optimistic UI conservé via `useMutation onMutate`).

## Fichiers touchés

- migration SQL (1 fichier)
- `src/routes/_authenticated/events/$eventId.tsx` (ajout onglet + toggle)
- `src/components/carpool/` (8 nouveaux fichiers)
- `src/locales/fr/common.json` + `src/locales/en/common.json`

## Hors scope explicite (V1)

Pas de page admin dédiée, pas d'export CSV des trajets, pas d'historique covoiturage par joueur.
