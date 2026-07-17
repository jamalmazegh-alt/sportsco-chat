
## Objectif

Rendre l'envoi de convocations robuste face au `recipient_mismatch` en burst, séparer proprement retry technique et renvoi métier, et fournir une action `replay_dlq` sûre pour rattraper les 17 destinataires en DLQ — sans jamais renvoyer un doublon à un destinataire déjà livré.

Aucune relance en production tant que les étapes 1 à 7 ne sont pas vertes.

---

## Étape 1 — Diagnostic : qui contrôle le run ?

Livrable : un court document `docs/email-run-ownership.md` répondant à :
- Le provider (Mailgun via connector gateway Lovable) crée-t-il le "run" transactionnel côté gateway, ou côté Mailgun ?
- Peut-on passer un identifiant qui force un run isolé par destinataire ?
- Reproduction contrôlée : envoyer 2 emails à 100 ms d'intervalle, capturer status + headers de réponse (`X-Mailgun-*`, corps JSON).

Décision qui en découle :
- Si le run est contrôlable côté client → isolation par message (pas de burst possible).
- Si le run est auto-créé côté provider → **sérialisation amont obligatoire** (étape 6).

Hypothèse de travail retenue par défaut avant preuve du contraire : run auto-créé côté provider → sérialisation.

---

## Étape 2 — Modèle de données : dispatch et idempotence

Migration :

1. Table `email_dispatches`
   - `id uuid pk`
   - `event_id uuid null` (nullable — les emails hors-événement existent)
   - `template_name text`
   - `dispatch_type text check in ('initial','manual_resend','dlq_replay')`
   - `created_by uuid null`
   - `created_at timestamptz default now()`
   - RLS : lecture club-scopée, écriture service_role.

2. Colonnes ajoutées à `email_send_log`
   - `dispatch_id uuid null references email_dispatches(id)`
   - `recipient_id uuid null` (player_id, parent_id ou user_id selon le cas — logique métier)
   - `notification_type text null` (`convocation`, `convocation_resend`, `tournament_invite`, …)
   - `attempt_count int not null default 0`
   - `mismatch_count int not null default 0`
   - `worker_build text null` (SHA court du build ayant traité le message)

3. Index unique partiel d'idempotence technique :
   ```sql
   create unique index email_send_log_dispatch_recipient_success
     on email_send_log (dispatch_id, recipient_id, notification_type)
     where status in ('sent','delivered');
   ```
   → Empêche techniquement un deuxième `sent` pour la même clé, même en cas de replay concurrent.

4. Fallback pour lignes historiques sans `dispatch_id` : index unique partiel sur `(event_id, recipient_id, notification_type) where status in ('sent','delivered')`.

---

## Étape 3 — Séparer retry technique vs renvoi métier

Backend (`src/lib/email/dispatch.functions.ts`, nouveau) :
- `createInitialDispatch({ eventId, templateName, recipients })` : crée un dispatch `initial`, insère un log `pending` par destinataire avec `dispatch_id`, enfile dans pgmq.
- `createManualResendDispatch({ eventId, reason })` : nouveau dispatch `manual_resend`, réservé au bouton UI explicite "Renvoyer à tous". Ne s'appuie **pas** sur `convocation_version`.
- `replayDlq({ eventId })` : voir étape 4.

UI (`src/routes/_authenticated/events/$eventId.tsx`) :
- Le bouton "Renvoyer la convocation" au niveau de la liste joueurs reste le **renvoi métier** volontaire → `createManualResendDispatch` avec confirmation modale explicite ("Un nouvel email sera envoyé aux X destinataires").
- Un nouveau bouton secondaire "Rattraper les échecs" apparaît **uniquement** si `email_send_log` contient au moins une ligne `dlq` pour l'événement → `replayDlq`.
- Une modification de l'événement (horaire, lieu) **n'enfile plus** automatiquement un renvoi. À la place, une bannière propose explicitement le renvoi métier.

---

## Étape 4 — `replayDlq(eventId)` server function

Fichier : `src/lib/email/replay-dlq.functions.ts`.

Contrat :
1. Middleware `requireSupabaseAuth` + vérification que l'utilisateur est admin/coach du club de l'événement.
2. Créer un nouveau `email_dispatch` de type `dlq_replay`.
3. Sélectionner les candidats :
   ```sql
   select distinct on (recipient_id, notification_type) *
   from email_send_log
   where event_id = :eventId
     and status = 'dlq'
   order by recipient_id, notification_type, created_at desc
   ```
4. Filtrer : exclure tout `recipient_id` ayant déjà une ligne `sent` ou `delivered` pour la même `(event_id, notification_type)`.
5. Pour chaque candidat retenu : insérer une nouvelle ligne `pending` avec le nouveau `dispatch_id`, réenfiler dans pgmq avec le payload d'origine reconstitué (destinataire + `template_data` récupérés depuis le log ou la source métier).
6. Verrou d'exécution : `pg_advisory_xact_lock(hashtext('replay_dlq:' || event_id))` pour bloquer les doubles clics et exécutions concurrentes.
7. Journaliser dans `superadmin_audit_logs` : `{event_id, dispatch_id, candidates, requeued, skipped_already_delivered, skipped_no_payload}`.
8. Retour typé : `{ dispatchId, requeued, skippedAlreadyDelivered }`.

L'index unique partiel de l'étape 2 est la ceinture : même si un candidat livré traverse par erreur, l'INSERT `sent` final échouera proprement, aucun doublon ne partira.

---

## Étape 5 — Processeur queue : durcir `recipient_mismatch`

Fichier : `src/routes/lovable/email/queue/process.ts`.

Modifications sur la logique déjà en place :
- Sur `recipient_mismatch` : status `mismatch_deferred`, aucun incrément de `attempt_count`, incrément `mismatch_count` uniquement. **Confirmé conforme.**
- Cooldown : **scopé transactionnel** (`transactional_retry_after_until`) — déjà en place.
- Borne `MAX_MISMATCH_ATTEMPTS = 8` → DLQ. **Déjà en place.**
- Ajouter `worker_build` (SHA court injecté via env `VITE_BUILD_SHA` / `BUILD_SHA`) dans chaque insert `email_send_log` pour tracer quel code a traité chaque message.
- Logs structurés JSON avec `{event_id, dispatch_id, recipient_id, worker_build, action}` pour rendre visibles arrêt de batch + cooldown.

---

## Étape 6 — Sérialisation amont (si run non contrôlable, hypothèse par défaut)

Objectif : ne plus présenter 40 emails simultanément à la gateway.

Approche configurée dans `email_send_state` (pas de code redéployé) :
- `transactional_batch_size = 1` (au lieu de 10) pour la file transactionnelle uniquement.
- `transactional_send_delay_ms` mesurable, valeur initiale à calibrer par l'étape 1 (démarrer à 250 ms, ajuster).
- Auth queue conserve ses paramètres actuels (pas de burst observé).

Adapter `process.ts` pour lire deux jeux de paramètres distincts par file (aujourd'hui il y en a un seul global).

Le cooldown 45 s reste comme filet de dernier recours ; il ne doit **jamais** se déclencher en régime normal après ce changement.

---

## Étape 7 — Tests obligatoires

Vitest (`src/tests/unit/`) :
1. `email-mismatch-defer.test.ts` — 1er envoi OK, 2e `recipient_mismatch` → batch stoppé, aucun `failed`, `attempt_count` inchangé, `mismatch_count = 1`, cooldown scopé transactionnel posé, auth queue non impactée.
2. `email-mismatch-bound.test.ts` — 8 cycles `mismatch_deferred` → 9e cycle DLQ avec le bon motif.
3. `replay-dlq.test.ts` — sélection stricte DLQ/event, exclusion des `sent`/`delivered`, verrou anti-concurrence, dispatch créé, index unique bloque un doublon simulé.
4. `email-idempotency.test.ts` — même `(dispatch_id, recipient_id, notification_type)` inséré 2× en `sent` → contrainte unique déclenche, un seul envoi conservé.
5. `manual-resend-vs-retry.test.ts` — un renvoi métier crée un **nouveau** dispatch (nouveaux envois attendus) ; un replay DLQ n'envoie **pas** aux destinataires déjà livrés du dispatch initial.

Test d'intégration réel — 40 destinataires (`src/tests/integration/burst-40.test.ts`, marqué `it.skip` par défaut, exécuté manuellement via `TEST_BURST_40=1`) :
- Utilise 40 adresses Yopmail dédiées à l'auteur.
- Assertions : total, `sent`, `mismatch_deferred`, `dlq`, `dedup rejects`, durée totale, **zéro `Max retries exceeded`**, queue vide en fin, DLQ vide après replay éventuel.

`bun run test` doit rester vert.

---

## Étape 8 — Vérification de déploiement avant tout replay production

1. `stack_modern--invoke-server-function` sur `/lovable/email/queue/process` avec header debug → réponse inclut `worker_build`.
2. `supabase--read_query` : `select distinct worker_build from email_send_log where created_at > now() - interval '1 hour'` → une seule valeur, celle du build attendu.
3. Confirmer via logs structurés qu'un `mismatch_deferred` est visible et non un `failed` sur un envoi test contrôlé (5 destinataires suffisent pour reproduire).

---

## Étape 9 — Action de production

**Uniquement après validation des étapes 1 à 8.**

1. `replayDlq(eventId)` sur l'événement APM Metz.
2. Suivi live : `select status, count(*) from email_send_log where dispatch_id = :newDispatchId group by status` jusqu'à stabilisation.
3. Vérification : aucun destinataire du dispatch initial `sent`/`delivered` n'a de nouvelle ligne `sent` sur ce replay.
4. Bilan écrit des 40 destinataires : livrés initialement, rattrapés par replay, échecs résiduels avec motif technique.

---

## Détails techniques

### Fichiers touchés (récap)
- Migration SQL : `email_dispatches`, colonnes + index unique partiel sur `email_send_log`.
- `src/lib/email/dispatch.functions.ts` (nouveau).
- `src/lib/email/replay-dlq.functions.ts` (nouveau).
- `src/lib/email/send.server.ts` : intégration `dispatch_id`, `recipient_id`, `notification_type` dans le payload pgmq et les inserts log.
- `src/routes/lovable/email/queue/process.ts` : lecture params par file, `worker_build`, logs structurés.
- `src/routes/_authenticated/events/$eventId.tsx` : bouton "Rattraper les échecs" conditionnel, confirmation renvoi métier, suppression du renvoi implicite sur édition.
- `email_send_state` : `transactional_batch_size`, `transactional_send_delay_ms`.
- Tests vitest + un test d'intégration `skip` par défaut.

### Ce qui reste inchangé
- Le comportement anti-burst actuel (arrêt batch + cooldown scopé + borne 8) sert de filet et ne change pas fonctionnellement.
- Les templates React Email, les triggers push, les autres flux (tournois, absences) — hors périmètre.

### Points explicitement rejetés du spec original
- Aucune inclusion de `convocation_version` dans la clé d'idempotence — confirmé.
- Aucune supposition sur 45 s comme espacement cible entre destinataires ; la valeur sort de la mesure étape 1.

### Ordre d'exécution proposé
Étapes 1 → 2 → 5 (petits ajustements) + 6 (config) → 3 → 4 → 7 → 8 → 9. Chaque étape est mergeable indépendamment ; le replay production (9) est le tout dernier acte.
