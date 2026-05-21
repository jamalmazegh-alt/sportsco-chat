
# Suite E2E Playwright — Clubero

## Objectif

Automatiser les parcours fonctionnels critiques de bout en bout (UI réelle + base Lovable Cloud) en complément des tests unitaires (226) et RLS (111).

## Stack & organisation

- **Playwright** (`@playwright/test`) — navigateur Chromium par défaut, Firefox/WebKit en option.
- Dossier `tests/e2e/` avec un fichier `.e2e.ts` par parcours fonctionnel.
- `tests/e2e/_fixtures/` : helpers (création user via service role, login programmatique via Supabase session, seed/cleanup d'un club isolé par run).
- `playwright.config.ts` à la racine : baseURL = preview Lovable (`https://id-preview--<id>.lovable.app`) ou local (`http://localhost:8080`) selon `E2E_BASE_URL`.
- Isolation : chaque test crée son propre club via service role + supprime à la fin (comme les tests RLS).

## Parcours couverts (1 fichier par bloc)

```text
tests/e2e/
  01-onboarding-club.e2e.ts       # signup admin, validation email (lien magic dans email_send_log), création club, wizard
  02-teams-multi-sport.e2e.ts     # création équipes football, basket, rugby, handball, volley
  03-users-roles.e2e.ts           # invite admin, coach ; coach rattaché à équipe
  04-players-parents.e2e.ts       # ajout joueurs avec parents / sans parents, onboarding parent via lien
  05-events-all-types.e2e.ts      # entraînement, match (home/away), tournoi, réunion — sur 2 sports
  06-lineup.e2e.ts                # création compo football, drag-drop slots, publication
  07-convocations-send.e2e.ts     # envoi convocation email + WhatsApp (vérif lien wa.me)
  08-convocations-respond.e2e.ts  # réponse joueur, réponse parent, mise à jour par admin/coach
  09-event-chat.e2e.ts            # envoi message, mention, pièce jointe
  10-coach-feedback.e2e.ts        # feedback sur 3 joueurs, synthèse IA, édition synthèse
  11-match-result-stats.e2e.ts    # score, buts, cartons, vérif page stats
  12-convocation-lifecycle.e2e.ts # annuler conv joueur, renvoyer conv, reporter event
  13-player-profile.e2e.ts        # MAJ profil joueur (poste, dossard, photo)
```

~13 fichiers, ~40-60 tests, durée cible < 8 min en parallèle.

## Helpers clés

- `createTestClub()` → renvoie `{ clubId, adminUser, cleanup }` via service role.
- `loginAs(page, user)` → injecte session Supabase dans `localStorage` (évite UI login répétitif).
- `getLastEmail(recipient, template)` → lit `email_send_log` pour récupérer tokens (validation, invite, convocation).
- `seedTeamWithPlayers(clubId, sport, count)` → raccourci pour les tests qui ne testent pas la création.

## CI

- Nouveau workflow `.github/workflows/e2e-tests.yml`
  - **Cron** : `0 4 * * *` (4 AM UTC, après les RLS de 3 AM)
  - **Manuel** : `workflow_dispatch` avec choix de `target` (preview / production)
  - Timeout 20 min, upload du rapport HTML Playwright en artifact
  - Issue GitHub auto si échec cron (label `e2e` + `bug`)
- Scripts package.json :
  - `test:e2e` → `playwright test`
  - `test:e2e:ui` → `playwright test --ui` (debug local)
  - `test:e2e:headed` → mode headed

## Secrets GitHub requis (en plus des RLS)

- `E2E_BASE_URL` (par défaut preview URL)
- Réutilise `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

## Points d'attention

- **WhatsApp** : pas d'envoi réel — on vérifie juste que le lien `https://wa.me/...?text=...` est généré correctement (clic → `page.waitForEvent('popup')`).
- **Emails** : pas de SMTP en test — on lit `email_send_log` pour extraire tokens (déjà la stratégie utilisée par les RLS).
- **IA (synthèse coach)** : appel réel à Lovable AI Gateway (coût faible mais réel) OU mock via flag `E2E_MOCK_AI=1`. Recommandé : appel réel en nightly, mock en CI PR.
- **Flakiness** : `webkit` désactivé pour V1 (drag-drop compo instable), retry x2 en CI, x0 en local.

## Livrable

1. `playwright.config.ts` + install (`bun add -D @playwright/test`)
2. 13 fichiers de tests + fixtures
3. Workflow CI nightly + manuel
4. Doc courte `docs/dev/e2e.md` (comment lancer, debug, ajouter un test)

## Questions avant de coder

1. **Cible CI** : preview Lovable, ou prod ? (recommandé : preview)
2. **IA en CI** : appel réel ou mock ? (recommandé : réel en nightly seulement)
3. **WhatsApp** : on se contente de vérifier le lien généré, ou tu veux un vrai test bout en bout via une API tierce (genre Twilio sandbox) ?
4. **Périmètre V1** : on attaque les 13 blocs d'un coup, ou on commence par les 5 plus critiques (onboarding, événements, convocations, compo, feedback) ?
