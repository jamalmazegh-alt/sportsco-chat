# Sprint 5 — IA / LLM (Lovable-ready)

Objectif : brancher le LLM (Lovable AI Gateway) sur 3 zones à forte valeur, sans jamais remplacer le moteur déterministe. Fallback silencieux obligatoire.

## Principes transverses

- **Provider** : Lovable AI Gateway via `createLovableAiGatewayProvider` (déjà présent dans `src/lib/ai-gateway.ts`). Modèle par défaut : `google/gemini-3-flash-preview` (le moins coûteux pour ces features).
- **Timeout** : 5s max via `AbortController` côté serveur.
- **Fallback silencieux** : toute erreur (timeout, 429, 402, JSON invalide, validation Zod KO) ⇒ retour du fallback déterministe. Aucun toast d'erreur LLM côté UI.
- **Anonymisation prompts** : helper `anonymizePlayers()` (Joueur A/B/C…), pas d'emails, âge → catégorie (U13/U15…).
- **Validation** : toute réponse LLM passe par Zod avant affichage.
- **Pas de mutation directe** depuis le LLM : tout contenu généré est éditable / confirmable par l'utilisateur.

## Migrations DB (1 seule)

```sql
-- llm_usage : log d'usage (audit + facturation)
CREATE TABLE public.llm_usage (
  id uuid PK default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  club_id uuid null,
  feature text not null,           -- 'tournament_reco' | 'tournament_qa' | 'coach_insights' | 'tournament_rules'
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  status text not null,            -- 'ok' | 'timeout' | 'invalid_json' | 'rate_limited' | 'error'
  created_at timestamptz default now()
);
-- GRANT INSERT to authenticated, ALL to service_role, SELECT pour superadmin via policy.

-- llm_cache : cache server-side
CREATE TABLE public.llm_cache (
  cache_key text PK,
  feature text not null,
  locale text not null,
  response jsonb not null,
  created_at timestamptz default now()
);
-- Service_role only (lu/écrit depuis serverFn).

-- Index : llm_usage(user_id, feature, created_at) pour rate-limit lookup.
```

Rate-limit réutilise le bucket horaire existant `public_rate_limits` (route="llm:<feature>", ip=user_id) — pas de nouvelle table.

## Feature 1 — Assistant tournoi enrichi

### A. Explication de recommandation

- Server fn `explainRecommendation` (`src/lib/llm/tournament-assistant.functions.ts`) :
  - input : `Recommendation` + `AssistantAnswers` (anonymisés, pas de PII de toute façon).
  - cache_key = hash(format+pools+perPool+flights+locale).
  - cache hit ⇒ retour immédiat. Cache miss ⇒ appel LLM (timeout 5s, max ~120 tokens).
  - validation Zod : `{ explanation: string (max 400 chars) }`.
  - fallback : `null` (UI n'affiche rien).
- UI : sous `RecoCard` dans `TournamentAIAssistant.tsx`, ligne italique `text-sm text-muted-foreground`. Skeleton léger pendant chargement (1.5s puis disparaît si toujours rien).
- Rate-limit : 10/h/user, bucket `llm:tournament_reco`.

### B. Questions de suivi

- Sous la reco, bloc "Une question sur ce format ?" avec input + bouton.
- Historique React state uniquement (pas de persist).
- Server fn `answerTournamentQuestion` :
  - input : `{ question, recoContext, history: [{role, content}] }` (history tronqué à 6 derniers tours).
  - system prompt restrictif : sujets autorisés (format, durée, terrains, équipes, organisation, conseils pratiques). Refus poli sinon.
  - max 4 phrases, validation Zod `{ answer: string (max 600 chars) }`.
  - fallback : message générique "Je ne peux pas répondre pour le moment, essaye plus tard."
- Rate-limit : 10/h/user, bucket `llm:tournament_qa`.

## Feature 2 — Coach Insights enrichis

- Étendre `src/lib/insights.server.ts` (déjà appelé par cron `coach-insights`) :
  - Collecter agrégats 7 derniers jours par club (taux réponse convoc, présents, absents, absences consécutives, events sans convoc, joueurs sans réponse >48h).
  - Construire un prompt **avec données anonymisées** (`Joueur A`, …).
  - Appeler LLM avec `response_format: json_object` (ou `Output.object` AI SDK). Schéma Zod :
    ```ts
    z.object({ insights: z.array(z.object({
      level: z.enum(['info','attention','critical']),
      icon: z.string().max(4),
      text: z.string().min(10).max(220),
    })).max(3) })
    ```
  - Si JSON invalide ⇒ fallback aux insights déterministes existants (déjà en place).
  - Insérer dans `coach_insights` (table existante) avec `insight_type='ai_weekly'`, `priority` mappé depuis `level`.
- UI : la carte `InsightsSection` existante affiche déjà tout ; on ajoute juste le filtre/icone pour ces 3 max + bouton "Actualiser" (server fn `refreshCoachInsights` limité à 1/24h via `public_rate_limits` bucket `llm:coach_insights_refresh`).
- Coach-only : guard via `has_role(auth.uid(), 'coach')` ou check sur `club_members.role`.
- Email hebdo lundi matin :
  - Étendre le cron existant `coach-insights` : si jour=lundi ET ≥1 insight `attention|critical` ⇒ enqueue email via `enqueueTransactionalEmailServer` (template `coach-weekly-insights` — server-only, pas dans l'allowlist user).

## Feature 3 — Génération du règlement de tournoi

- Bouton "Générer un règlement" dans la page de config tournoi (à brancher dans le composant qui édite `tournaments.rules` / `tournaments.description` — à identifier dans `src/modules/tournaments/components/`).
- Server fn `generateTournamentRules` :
  - input : `{ tournamentId }` (lit nom, sport, format, nb équipes, catégorie, durée, lieu, date depuis la DB serveur — pas depuis le client).
  - LLM produit du markdown simple, converti puis sanitisé en HTML restreint (whitelist `h2 p ul li strong`) via une regex/DOMPurify (côté serveur on peut juste filtrer les balises).
  - validation Zod : `{ html: string (max 6000 chars) }`.
  - rate-limit : 5/jour/tournoi via `public_rate_limits` bucket `llm:rules:<tournamentId>`.
  - fallback : template statique simple (nom + format + dates).
- UI : modal de prévisualisation (dialog shadcn) avec preview HTML, boutons **Insérer**, **Regénérer**, **Fermer**. Après insertion, le champ reste un textarea/éditeur normal — entièrement modifiable.

## Helpers partagés

`src/lib/llm/core.server.ts` :
- `callLLM({ feature, userId, prompt, system, schema, timeoutMs=5000, model })` : abort 5s, parse JSON, valide Zod, log `llm_usage`, retourne `{ ok: true, data } | { ok: false }`.
- `anonymizePlayers(players)` → map id → "Joueur A/B/…"
- `checkLlmRateLimit(userId, feature, limit, windowHours=1)` réutilisant `public_rate_limits`.
- `cacheGet/cacheSet(key, feature, locale, ttlDays=7)`.

## Tests (Vitest)

`src/tests/unit/llm.test.ts` :
- timeout ⇒ fallback ; JSON invalide ⇒ fallback ; rate-limit déclenche `rate_limited` ; cache hit court-circuite appel ; `anonymizePlayers` ne laisse jamais nom/email ; sanitization HTML strip `<script>` & `<img>` ; refresh button bloque <24h ; règlement modifiable après insertion (test du state) ; coach insights réservées au role coach ; email non envoyé si 0 insight attention.

## i18n

Ajout des clés `aiAssistant.explanation`, `aiAssistant.askQuestion.*`, `coachInsights.weekly.*`, `tournamentRules.generate.*` dans les 7 locales.

## Hors périmètre (confirmé)

cockpit prédictif, lineup auto, chatbot support, fine-tuning, modèle custom, analyse perf joueur.

---

**Prochaine étape** : si tu valides, j'implémente dans cet ordre :
1. Migration `llm_usage` + `llm_cache` + GRANT/RLS
2. Helpers `src/lib/llm/core.server.ts` + tests
3. Feature 1 (reco + Q&A)
4. Feature 2 (coach insights + email)
5. Feature 3 (règlement + modal)
6. Tests finaux + i18n complète

Tu valides ce plan ou tu veux que j'ajuste un point (ordre, modèle, scope d'une feature) ?
