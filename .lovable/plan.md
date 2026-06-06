## Contexte

Le code existant couvre déjà une bonne partie du périmètre :

- **Ranking / tie-breakers** : `src/modules/tournaments/lib/standings.ts` implémente déjà points / GD / GF / head-to-head (points/GD/GF) / fair-play / draw-lot, avec ordre configurable par tournoi (`tiebreakers: Tiebreaker[]`). Pas besoin de schéma DB — l'ordre est déjà persisté dans `tournaments.settings`. → il manque surtout **les tests** et la valeur par défaut alignée avec la spec.
- **Freeze tournoi** : pas de garde-fou unifié. Les server fns laissent supprimer équipes / changer format même après démarrage. → ajout d'un helper `assertTournamentMutable` + tests cross-tenant via les guards `assertClubRole` déjà testés.
- **Paiement atomicité** : flux Stripe → `tournament_registrations`. Aujourd'hui le webhook met juste `payment_status='paid_online'` mais ne crée pas la team (sauf en auto-approval avant paiement). Pas de self-heal. Pas de statut explicite `paid_pending_team`. Montant déjà recalculé serveur (✅), mais pas d'idempotency stricte sur eventId.

Je découpe en 3 lots livrables séparément.

---

## Lot 1 — Ranking tie-breakers (tests + défaut aligné spec)

**Changements code (minimes)**
- `src/modules/tournaments/lib/standings.ts` : ajuster `DEFAULT_TIEBREAKERS` pour matcher exactement l'ordre demandé :
  `points → goal_diff → goals_for → head_to_head_points → head_to_head_gd → head_to_head_gf → fair_play → draw_lot`.
  (actuellement : points → h2h_points → h2h_gd → goal_diff → goals_for ; on inverse pour mettre GD/GF avant H2H comme spec.)

**Tests (`src/tests/unit/standings-tiebreakers.test.ts`)**
- Tied points, séparés par GD
- Tied GD, séparés par GF
- Tied stats générales, séparés par H2H points
- Tied H2H, séparés par fair-play
- Tied total → résolu par `draw_lot` déterministe (salt stable)
- Ordre custom : tournoi qui met `fair_play` avant `goal_diff` produit un classement différent

---

## Lot 2 — Tournament freeze + cross-tenant

**Nouveau helper** : `src/lib/tournament-guards.server.ts`
- `assertTournamentMutable(tournamentId, { allow: 'structure' | 'scores' | 'logistics' })`
  - lit `tournaments.status` via supabaseAdmin
  - `structure` (delete team, change format, change groups, change ranking rules, delete matches) → throw 409 si status ∈ `in_progress | completed`
  - `scores` / `logistics` → toujours autorisés
- `assertCanSubmitMatchScore({ userId, matchId, role: 'referee' | 'organizer' })`
  - referee : doit être assigné au match (table `tournament_matches.referee_user_id` ou équivalent)
  - organizer : doit être admin/tournament_manager du club du tournoi (→ délègue à `assertClubRole`)
  - match `locked=true` → referee refusé, organizer OK avec `correction_reason` non vide
- `assertCanLockMatch(...)` : organizer only

**Câblage minimal côté server fns** (pas de réécriture massive) :
- ajouter `assertTournamentMutable` dans : `deleteTournamentTeam`, `updateTournamentFormat`, `updateGroupComposition`, `updateRankingRules`, `regenerateMatches`/`deleteMatch` (identifier les fns exactes dans `tournaments.functions.ts`).
- ajouter `assertCanSubmitMatchScore` dans `submitMatchScore` / `updateMatchScore` / `lockMatchResult`.

**Tests (`src/tests/unit/tournament-guards.test.ts`)** (même pattern que `authz.test.ts`, mocks via `vi.hoisted`)
- `assertTournamentMutable` : draft → autorisé ; in_progress + structure → 409 ; in_progress + scores → autorisé
- Locked match : referee re-edit → 403 ; organizer sans reason → 400 ; organizer + reason → OK + audit log
- Cross-tenant :
  - organizer club A + tournoi club B → 403
  - referee match A + score match B → 403
  - staff tournoi A + edit tournoi B → 403
  - user public (pas de userId) → 401/403

---

## Lot 3 — Payment atomicity

**Migration DB** (`tournament_registrations`)
- Nouvelle colonne `registration_state text` (enum-like check) avec valeurs :
  `pending_payment | paid_pending_team | confirmed | failed | cancelled`
  (on garde `payment_status` legacy pour rétrocompat ; `registration_state` devient la source de vérité).
- Index unique partiel : `(tournament_id, tournament_team_id)` où `tournament_team_id is not null` (évite la double-team).
- Table `stripe_webhook_events (event_id text primary key, processed_at timestamptz)` pour idempotency stricte au niveau webhook (si pas déjà existante).

**Code**
- `src/routes/api/public/stripe-webhook.ts` :
  - en tout début de handler, `INSERT … ON CONFLICT DO NOTHING` dans `stripe_webhook_events`. Si conflict → 200 immédiat.
- `src/modules/tournaments/tournament-payments.server.ts` :
  - `handleTournamentCheckoutCompleted` :
    1. transition `registration_state → paid_pending_team` (idempotent)
    2. appelle `ensureRegistrationTeam(registrationId)` :
       - SELECT `tournament_team_id` ; si non null → no-op (idempotent)
       - sinon INSERT team + UPDATE registration en une transaction RPC (`create_team_for_registration` SECURITY DEFINER, returns team_id, exception-safe sur unique violation → retourne team existante)
    3. transition `→ confirmed`
  - `buildCheckoutForRegistration` : déjà OK (montant serveur), on ajoute une assertion explicite que `metadata.tournament_id` côté checkout est ignoré et toujours re-résolu depuis la registration côté webhook.
- **Self-heal** : route `/api/public/hooks/payment-self-heal.ts` (cron-friendly) qui repère `registration_state='paid_pending_team'` depuis > 5 min et rejoue `ensureRegistrationTeam`.
- `checkout.session.expired` / `payment_intent.payment_failed` → `registration_state='failed'`.
- `checkout.session.async_payment_failed` + cancel URL hit → `cancelled`.

**Tests (`src/tests/unit/tournament-payment-atomicity.test.ts`)**
- Webhook livré 2× même eventId → 1 seule team créée
- `paid_pending_team` puis team-creation échoue puis retry → exactement 1 team
- Client POSTant un amount custom → ignoré (montant relu depuis `tournaments.registration_fee`)
- Client POSTant `tournament_id` d'un autre club → registration créée sur le bon tournoi (slug-driven, déjà OK) + assertion explicite
- `payment_intent.payment_failed` → `failed`, pas de team
- Cancel → `cancelled`, pas de team

---

## Section technique (pour les développeurs)

- **Stack** : TanStack Start + Supabase. Guards = pures fonctions serveur testables avec mocks `vi.hoisted` (déjà en place dans `authz.test.ts`).
- **Tests** : Vitest (déjà câblé via `unit-tests.yml` après le fix `bun run test`).
- **Idempotency Stripe** : table `stripe_webhook_events` est la barrière #1. La transition d'état dans `tournament_registrations` est la barrière #2 (les UPDATE sont conditionnés sur l'état attendu : `WHERE registration_state IN ('pending_payment','paid_pending_team')`).
- **RLS** : `tournament_registrations` reste write-only via supabaseAdmin côté server (déjà le cas).
- **Pas d'edge function** : tout reste dans server routes TanStack.

---

## Ordre d'exécution proposé

1. **Lot 1** (1 fichier code + 1 fichier test) — risque ~nul, valide la base.
2. **Lot 2** (1 helper + ~5 call-sites + 1 fichier test) — risque modéré, mais aucune migration DB.
3. **Lot 3** (1 migration + helpers webhook + 1 route self-heal + 1 fichier test) — risque le plus élevé, fait en dernier pour bénéficier des guards du Lot 2.

Chaque lot est mergeable indépendamment. Confirme si tu veux que je démarre par le Lot 1, ou les 3 d'affilée.