# Tests E2E (Playwright)

Tests fonctionnels bout-en-bout couvrant les parcours critiques de Clubero.
Complètent les **226 tests unitaires** (`bun test`) et les **111 tests RLS** (`bun run test:rls`).

## Lancer en local

```bash
# Toute la suite (core puis ui, projects Playwright)
bun run test:e2e

# Core seulement — 00→25 (API / RLS / beta-closure, ~5–15 min)
bun run test:e2e:core

# UI flows seulement — 26→32 + ui-real-flows (clics réels)
bun run test:e2e:flows

# UI interactive Playwright (debug, watch, replay)
bun run test:e2e:ui

# Mode headed (voir le navigateur)
bun run test:e2e:headed

# Un seul fichier
bunx playwright test tests/e2e/01-onboarding-club.e2e.ts
```

En CI : deux jobs séquentiels (`E2E core` puis `E2E UI`), artifacts
`playwright-report-core` / `playwright-report-ui`. Le
`workflow_dispatch` accepte `suite=all|core|ui`.

## Variables d'env requises

| Var                                                     | Source                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `SUPABASE_URL`                                          | projet **bughunt** (même que RLS)                                 |
| `SUPABASE_PUBLISHABLE_KEY`                              | anon key bughunt                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                             | service role bughunt — auto-seed + SSR                            |
| `E2E_TARGET_PROJECT_REF`                                | ref projet bughunt (doit matcher `SUPABASE_URL`)                  |
| `E2E_BASE_URL`                                          | **obligatoire** — en CI `http://127.0.0.1:8080`                   |
| `E2E_ADMIN_EMAIL` / `_PASSWORD` (+ coach/player/parent) | secrets E2E                                                       |
| `E2E_REAL_AI`                                           | `1` pour appeler la vraie IA (test 10 + test 14), sinon mock/skip |
| `E2E_UI`                                                | `1` pour timeout 90s (auto via `test:e2e:flows`)                  |
| `E2E_SUITE`                                             | `core` \| `ui` — restreint le project Playwright (jobs CI)        |
| `E2E_TOURNAMENT_ID`                                     | optionnel — classement tournoi (`ui-real-flows`)                  |
| `E2E_CLUB_SLUG` / `E2E_CAMP_SLUG`                       | optionnel — pages publiques stages (`29-camps`)                   |

Seed manuel : `bun run seed:e2e` (idempotent, réécrit les mots de passe pour
matcher les secrets). Voir `tests/e2e/_fixtures/README.md`.

Specs UI récentes (lot Claude) : `ui-real-flows.e2e.ts` + `26`→`32`
(= project Playwright `ui` / `bun run test:e2e:flows`). Le core `00`→`25`
reste isolé (`bun run test:e2e:core`).
Matrice et dettes : `docs/dev/e2e-coverage-gaps.md`.

## Stratégie

Approche **hybride** : seed via service role (users + club partagés) + login
programmatique + actions ciblées + vérif via client RLS. Plus rapide et moins
flaky qu'une UI E2E pure, et ça teste réellement les flux (RLS, server
functions, triggers, etc.).

Chaque suite crée son propre **team / players / event** isolé via
`createTestClub(suiteName)` sur le club E2E partagé, et nettoie en `afterAll`.
Aucune dépendance entre fichiers.

## Couverture

| #   | Fichier                 | Périmètre                                                 |
| --- | ----------------------- | --------------------------------------------------------- |
| 01  | `onboarding-club`       | Signup admin, email log, création club                    |
| 02  | `teams-multi-sport`     | Football, basket, rugby, handball, volley                 |
| 03  | `users-roles`           | Invites admin/coach, rattachement équipe                  |
| 04  | `players-parents`       | Joueurs avec/sans parents, RLS parent                     |
| 05  | `events-all-types`      | training/match/tournament/meeting × 2 sports              |
| 06  | `lineup`                | Compo 4-4-2, publication, lecture joueur                  |
| 07  | `convocations-send`     | Création conv + lien WhatsApp                             |
| 08  | `convocations-respond`  | Réponse joueur, parent, override coach                    |
| 09  | `event-chat`            | Coach poste, joueur lit, joueur répond                    |
| 10  | `coach-feedback`        | Feedback × 2 + synthèse IA + édition                      |
| 11  | `match-result-stats`    | Score, buts, cartons, vérif stats                         |
| 12  | `convocation-lifecycle` | Annuler / renvoyer / reporter                             |
| 13  | `player-profile`        | MAJ profil par coach + consent parent                     |
| 14  | `assistant-chat`        | Appel /api/chat authentifié (skippé sans `E2E_REAL_AI=1`) |

## CI

Workflow `.github/workflows/e2e-tests.yml` :

- **Cron** : 4 AM UTC (après les RLS de 3 AM)
- **Manuel** : Actions → E2E Tests → Run workflow
- **Avant les tests** : `supabase db push --include-all --yes` sur bughunt
  (même anti-dérive que le workflow RLS — le schéma QA suit `main`)
- Démarre Vite localement contre bughunt, puis `bun run test:e2e`
- `globalSetup` auto-répare les users E2E via `SUPABASE_SERVICE_ROLE_KEY`
  (guard `E2E_TARGET_PROJECT_REF`)
- Rapport HTML uploadé en artifact (14 jours)
- Issue auto sur échec cron (labels `e2e` + `bug`)

Pour forcer une sync immédiate de bughunt sans attendre le cron E2E :
Actions → **RLS Security Tests** → Run workflow (branche `main`).
Ce workflow pousse aussi les migrations, puis exécute la suite RLS.

## Ajouter un test

1. Crée `tests/e2e/NN-mon-test.e2e.ts`
2. Démarre par `createTestClub("monsuffixe")` dans `beforeAll`
3. Toujours appeler `cleanup()` dans `afterAll`
4. Pour authentifier un user : `clientFor(user)` (client Supabase) ou
   `loginAs(page, user)` (session injectée en localStorage avant `goto`)
