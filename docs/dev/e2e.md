# Tests E2E (Playwright)

Tests fonctionnels bout-en-bout couvrant les parcours critiques de Clubero.
Complètent les **226 tests unitaires** (`bun test`) et les **111 tests RLS** (`bun run test:rls`).

## Lancer en local

```bash
# Toute la suite
bun run test:e2e

# UI interactive (debug, watch, replay)
bun run test:e2e:ui

# Mode headed (voir le navigateur)
bun run test:e2e:headed

# Un seul fichier
bunx playwright test tests/e2e/01-onboarding-club.e2e.ts
```

## Variables d'env requises

| Var | Source |
|-----|--------|
| `SUPABASE_URL` | `https://woawmhuntajpiezmmgzm.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud → Backend (secret) |
| `SUPABASE_PUBLISHABLE_KEY` | `.env` (publique) |
| `E2E_BASE_URL` | optionnel — défaut: preview Lovable |
| `E2E_REAL_AI` | `1` pour appeler la vraie IA, sinon mock |

## Stratégie

Approche **hybride** : seed via service role + login programmatique + actions
ciblées + vérif via client RLS. Plus rapide et moins flaky qu'une UI E2E pure,
et ça teste réellement les flux (RLS, server functions, triggers, etc.).

Chaque test crée son propre club isolé via `createTestClub(suiteName)` et
nettoie en `afterAll`. Aucune dépendance entre fichiers.

## Couverture

| # | Fichier | Périmètre |
|---|---------|-----------|
| 01 | `onboarding-club` | Signup admin, email log, création club |
| 02 | `teams-multi-sport` | Football, basket, rugby, handball, volley |
| 03 | `users-roles` | Invites admin/coach, rattachement équipe |
| 04 | `players-parents` | Joueurs avec/sans parents, RLS parent |
| 05 | `events-all-types` | training/match/tournament/meeting × 2 sports |
| 06 | `lineup` | Compo 4-4-2, publication, lecture joueur |
| 07 | `convocations-send` | Création conv + lien WhatsApp |
| 08 | `convocations-respond` | Réponse joueur, parent, override coach |
| 09 | `event-chat` | Coach poste, joueur lit, joueur répond |
| 10 | `coach-feedback` | Feedback × 2 + synthèse IA + édition |
| 11 | `match-result-stats` | Score, buts, cartons, vérif stats |
| 12 | `convocation-lifecycle` | Annuler / renvoyer / reporter |
| 13 | `player-profile` | MAJ profil par coach + consent parent |

## CI

Workflow `.github/workflows/e2e-tests.yml` :
- **Cron** : 4 AM UTC (après les RLS de 3 AM)
- **Manuel** : Actions → E2E Tests → Run workflow
- Rapport HTML uploadé en artifact (14 jours)
- Issue auto sur échec cron (labels `e2e` + `bug`)

## Ajouter un test

1. Crée `tests/e2e/NN-mon-test.e2e.ts`
2. Démarre par `createTestClub("monsuffixe")` dans `beforeAll`
3. Toujours appeler `cleanup()` dans `afterAll`
4. Pour authentifier un user : `clientFor(user)` (client Supabase) ou
   `loginAs(page, user)` (session injectée en localStorage avant `goto`)
