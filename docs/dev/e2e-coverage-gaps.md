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

- `fundraising_v2` / `payments_v2` : **off** en beta → tests admin/member payments se `skip` si redirect.
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
E2E_UI=1              # timeout 90s
```

## 6. Reste non couvert

Consentement parental / mineurs (`player_guardians`), push, SES idempotence,
challenges, training_series, seasons UX, sponsors/venues, build Clubero,
tournament flights, support view sessions.

## 7. Dette i18n

`staffAvailability.*` absent des locales → `txOr()` dans le fichier 31.
Extraire vers `common.json` + `TODO-i18n-pending.md` quand possible.
