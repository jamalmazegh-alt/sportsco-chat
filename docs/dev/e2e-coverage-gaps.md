# Couverture E2E — features récentes

État au 23/07/2026. Lot Claude (UI real flows) intégré et seeds alignés sur le schéma réel.

## 1. Ce que ce lot ajoute

| Fichier                                   | Feature                   | Tables                                                                                    |
| ----------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `ui-real-flows.e2e.ts`                    | Parcours socle UI (14)    | teams, players, events, convocations, tournaments                                         |
| `26-publications-polls.e2e.ts`            | Publications & sondages   | `club_publications`, `club_poll_options`, `club_poll_votes`, `club_publication_audiences` |
| `27-club-groups.e2e.ts`                   | Groupes internes          | `club_groups`, `club_group_members`                                                       |
| `28-needs-coups-de-main.e2e.ts`           | Besoins / Coups de main   | `event_needs`, `event_need_publications`, `event_need_signups`, `event_need_audiences`    |
| `29-camps.e2e.ts`                         | Stages (admin + public)   | `club_camps`, `club_camp_registrations`                                                   |
| `30-payments-fundraising.e2e.ts`          | Paiements & collectes     | `payment_items`, `payment_obligations`, `seasons`                                         |
| `31-staff-availabilities-meetings.e2e.ts` | Indispos staff & réunions | `staff_availabilities`, `events` (type meeting)                                           |

## 2. Alignements schéma (vs draft Claude)

| Assumé                                     | Réel                                                                |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `club_publications.status` / `type`        | `publication_type` + timestamps ; pas de `status`                   |
| `club_poll_options.position`               | `sort_order`                                                        |
| `event_need_publications` avec title/seats | Seed via **`event_needs`** (`label`, `capacity`, `validation_mode`) |
| audience `parents_equipe` (needs)          | `team_parents`                                                      |
| `club_camps.name` / `starts_on`            | `title` / `start_date` / `end_date` + `capacity`                    |
| `payment_obligations.paid_cents`           | `amount_due_cents` + `status`                                       |
| `staff_availabilities.starts_at`           | `start_date` / `end_date` + `reason` + `created_by_user_id`         |
| `players.birthdate`                        | `birth_date`                                                        |

## 3. Feature flags

- `fundraising_v2` : **off** en beta → fichier `30-payments-fundraising.e2e.ts`
  skippé **au niveau fichier** via `isV2("fundraising_v2")` (rapport : N skipped,
  motif flag — pas de faux verts par détection de redirect).
- `public_player_profiles` : **off** en beta → le test UI `/p/$slug` mineur dans
  `ui-real-flows` est skippé avec motif explicite ; la règle mineur/majeur est
  couverte via RPC `get_public_player_profile` (hors flag UI).
- Publications, needs, camps, groups : **pas** gated par `isV2`.

## 4. data-testid ajoutés

| Fichier                            | testid                                              |
| ---------------------------------- | --------------------------------------------------- |
| `teams.tsx`                        | `team-name-input`                                   |
| `teams/$teamId.tsx`                | `player-first-name-input`, `player-last-name-input` |
| `event-form-sheet.tsx`             | `event-name-input`, `event-opponent-input`          |
| `CampCreateChooser.tsx`            | `camp-title-input`                                  |
| `declare-staff-absence-drawer.tsx` | `availability-range-trigger`                        |

Needs : champs déjà en `#need-label` / `#need-capacity` — pas de testid supplémentaire.

## 5. Env optionnelles

```bash
E2E_TOURNAMENT_ID=…   # classement tournoi
E2E_CLUB_SLUG=…       # pages publiques /stages/$clubSlug/…
E2E_CAMP_SLUG=…       # formulaire d'inscription
E2E_UI=1              # timeout 90s (posé dans le workflow E2E CI)
```

`loginViaUI` injecte la session (`loginAs`) puis `goto /home` avec
`waitUntil: "domcontentloaded"` (comme beta-closure — le défaut `load`
timeout ~30s sur `/home` en CI) et attend `nav[aria-label]`. Le formulaire
`/login` est exercé une fois via `loginViaForm`. Les créations d'événement
passent par `openClassicEventForm` (`EventCreateChooser` → formulaire
classique) — les testids `event-*-input` n'existent pas dans l'assistant.

CI : jobs séparés `E2E core (00–25)` puis `E2E UI (26–31 + ui-real-flows)`
(`E2E_SUITE`, artifacts distincts). `workflow_dispatch` → `suite=all|core|ui`.

## 6. Reste non couvert

Consentement parental / mineurs (`player_guardians`) côté UI (RPC couverte),
push, SES idempotence, challenges, training_series, seasons UX, sponsors/venues,
build Clubero, tournament flights, support view sessions.

**Anonymat sondage verrouillé après création** — retiré de `26-publications-polls.e2e.ts`.
La page détail (`publications.$publicationId`) n'expose aucun contrôle de
visibilité (`#v-anon` / `#v-staff` n'existent que sur `publications.new`).
Le trigger SQL `_guard_publication_visibility` ne bloque un changement de
`poll_visibility` **qu'après des votes** (`poll_visibility_locked_with_votes`).
Pas de surface UI à exercer ; un test « absence de #v-anon » serait creux.
À re-couvrir quand une UI d'édition / un lock immédiat post-création existera.

## 7. Dette i18n

`staffAvailability.*` absent des locales → `txOr()` dans le fichier 31.
Extraire vers `common.json` + `TODO-i18n-pending.md` quand possible.
