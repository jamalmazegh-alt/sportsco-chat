# PROMPT CURSOR — Patch A-bis v1 (fail-loud `validateMatch` seul)

**Objectif :** fermer S3 (succès mensonger) sur `validateMatch` quand `applyBracketProgression` échoue. Rendre la corruption visible en beta — pas la masquer.
**Prérequis :** Classe A mergée (`derivedTournamentId`, tests spy `not.toHaveBeenCalled`) — **ne pas toucher**.
**Décisions verrouillées :**

- **Tier A fail-loud uniquement** sur `validateMatchHandler` — pas de compensate (Tier B tué), pas de RPC (Tier C → ticket séparé).
- `recordMatchScore` / `setMatchStatus` : **non touchés** — répertoriés dans ticket follow-up.
- Tests Classe A : **4/4 verts**, `not.toHaveBeenCalled()` sur mismatch inchangé.

**Type :** investigate-first → plan + GO → code. Aucun commit/push/PR. Lis `AGENTS.md`.

> Ticket atomicité complète : [`TICKET-A-bis-atomicity.md`](TICKET-A-bis-atomicity.md)  
> Tier C (RPC transactionnelle, `search_path = ''`, qualification TOCTOU) = **ticket distinct**, hors ce patch.

---

## 0. RÈGLES

- Zéro régression Classe A.
- Pas de Classe B, pas de `assertClubOwnsResource`.
- Pas de refactor `progression.ts` dans ce patch.
- Le **message UI n'est pas figé** — choisi en PHASE 2 selon résultats PHASE 1 (§2.5).
- `NEEDS-HUMAN` si investigation non tranchable.

---

## 1. MODÈLE DE MENACE

```
validateMatchHandler:
  WRITE 1 — UPDATE validation (context.supabase, RLS)     tournaments.functions.ts ~1474-1482
  WRITE 2..N — progression bracket (supabaseAdmin, boucle) via validateMatchBracketHooks ~1484
```

- **S3 (ce patch)** : catch silencieux `applyBracketProgression` L48-51 → `{ ok: true }` alors que bracket non recalculé.
- **S1 (documenté, pas corrigé ici)** : progression partielle possible (non-transactionnel).
- **Nouveau risque fail-loud** : l'utilisateur voit une **erreur** et **réessaie** → retry sur match déjà validé + progression re-jouée. Mitigation dépend de l'**idempotence** (investigation obligatoire §2.4).

**Hors scope ce patch :** `recordMatchScore` L813, `setMatchStatus` L1556 — même pattern S3, ticket follow-up.

---

## 2. PHASE 1 — INVESTIGATION (à restituer, aucune édition)

### 2.1 Écritures `validateMatchHandler` (ordre strict)

Lister chaque write/read mutant, client, ligne. **Confirmer explicitement** :

> L'UPDATE `validated_at` / `validated_by` est-il **commité avant** l'appel à `applyBracketProgression` ?  
> (Pas de transaction englobante — chaque appel PostgREST = commit implicite séparé.)

**Résultat attendu documenté** : `POST_VALIDATION_COMMITTED_BEFORE_PROGRESSION` | `INDETERMINATE` | `OTHER` (expliquer).

Ce résultat **détermine le libellé UI** (§2.5).

### 2.2 Comportement d'erreur actuel

- `applyBracketProgression` : catch L48-51 — que devient le handler ?
- UPDATE validation sans `.select()` : 0 lignes + `error: null` — encore possible post-Classe A ?

### 2.3 Idempotence de `applyBracketProgression` au retry

**Question obligatoire** : si validation est commitée et progression a échoué, un **second appel** `applyBracketProgression(derivedTournamentId)` est-il sûr ?

Analyser :

- `computeProgressionUpdates` (`progression.ts`) — commentaire L16-17 « idempotent : rejouer ne change rien »
- Les UPDATEs sont-ils des **assignations déterministes** depuis l'état courant, ou des incréments/inserts ?
- Citer `progression.test.ts` (test idempotence L149-150 si présent)

**Verdict** : `RETRY_SAFE` | `RETRY_UNSAFE` | `NEEDS-HUMAN` — avec preuves fichier+ligne.

Si `RETRY_UNSAFE` ou état indéterminé : le message UI **doit** inclure « ne rejouez pas » (§2.5 variante B).

### 2.4 Tier atomicité (constat, pas implémentation)

| Tier                     | Statut ce patch                                                                   |
| ------------------------ | --------------------------------------------------------------------------------- |
| A — Fail-loud            | **À implémenter** (`validateMatch` seul)                                          |
| B — Compensate rollback  | **Tué**                                                                           |
| C — RPC transactionnelle | **Ticket séparé** (honêteté TOCTOU, `search_path`, re-check `can_validate_match`) |

### 2.5 Message UI — règle de choix (pas de texte unique figé)

L'investigation §2.1 + §2.3 choisit **une** variante. Le prompt ne présuppose pas l'ordre des écritures.

| Condition (PHASE 1)                                                                                     | Libellé (clé i18n suggérée `matches.progressionFailed*`)                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** — `POST_VALIDATION_COMMITTED_BEFORE_PROGRESSION` **et** progression a throw après commit confirmé | _« Résultat enregistré. La progression du tableau n'a pas pu être finalisée — contactez un administrateur avant de continuer. »_                 |
| **B** — état indéterminé **ou** `RETRY_UNSAFE` **ou** commit non confirmé avant progression             | _« La validation n'a pas pu être finalisée complètement. Ne rejouez pas l'action ; contactez un administrateur pour vérifier l'état du match. »_ |

**Implémentation** : trouver le call site UI (`MatchesList.tsx` `validateM` mutation ~L768) — mapper l'erreur serveur (`bracket_progression_failed` ou status 500) vers la variante choisie. **Ne pas coder le libellé avant PHASE 1.**

### 2.6 Ticket follow-up (documenter, ne pas implémenter)

Créer ou compléter `TICKET-A-bis-followup.md` :

- `recordMatchScore` + `setMatchStatus` : même fail-loud + message
- Tier C RPC atomique (réf. `TICKET-A-bis-atomicity.md`)

**→ STOP. Restituer §2.1 ordre, §2.3 idempotence, §2.5 variante UI retenue. GO avant PHASE 2.**

---

## 3. PHASE 2 — FIX (après GO, `validateMatch` seul)

### 3.1 `applyBracketProgression` — fail-loud global

Supprimer le catch qui avale (L48-51). `log.error` + **rethrow**.  
_(Note : `recordMatchScore` / `setMatchStatus` appelleront encore la version fail-loud — comportement change pour eux aussi au runtime, mais **hors scope tests/UI** ce patch — documenter dans follow-up.)_

### 3.2 `validateMatchHandler` — propager l'échec

```typescript
// Après UPDATE validation réussi (inchangé, derivedTournamentId) :
await validateMatchBracketHooks.applyBracketProgression(derivedTournamentId);
// Si throw → ne pas return { ok: true }
```

- Throw `new Response("bracket_progression_failed", { status: 500 })` (ou wrapper après log) — **pas** `error.message` DB brut.
- **Pas** de rollback compensate (Tier B tué).
- Classe A inchangée (mismatch throw **avant** toute write).

### 3.3 UI — variante choisie en PHASE 1

- Mapper erreur `bracket_progression_failed` / 500 dans `MatchesList.tsx` (ou hook toast existant).
- Utiliser **uniquement** la variante A ou B selon §2.5.
- Si variante B : afficher explicitement l'avertissement anti-retry.

---

## 4. PHASE 3 — TESTS

| #   | Cas                                                                            | Attendu                                                                                      |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1-4 | Régression Classe A (`validate-match.test.ts`)                                 | 4/4 verts, spy mismatch inchangé                                                             |
| 5   | Progression mock throw après validation commit                                 | Handler **pas** `{ ok: true }` ; status 500 ; body contient `bracket_progression_failed`     |
| 6   | Spy : progression appelée avant throw                                          | `applyBracketProgressionSpy` called 1×                                                       |
| 7   | **État match post-échec** (mock UPDATE validation success + progression throw) | Documenter dans test : `validated_at` set (si ordre §2.1 = A) — assert sur mock update calls |
| 8   | `bun run test src/tests/unit/progression.test.ts`                              | Régression idempotence                                                                       |

Typecheck ciblé. Pas de commit/push.

---

## 5. DEFINITION OF DONE

- [ ] PHASE 1 : ordre commit confirmé + idempotence tranchée + variante UI justifiée
- [ ] Catch silencieux supprimé
- [ ] `validateMatch` fail-loud + erreur structurée
- [ ] UI variante correcte (pas de message présupposant un ordre non confirmé)
- [ ] Classe A 4/4 + mismatch spy
- [ ] `TICKET-A-bis-followup.md` (score/statut + Tier C)
- [ ] Pas de commit/push/PR

---

## 6. HORS SCOPE

- Classe A, Classe B paiements, Tier B compensate, Tier C RPC (ce patch)
- `recordMatchScore`, `setMatchStatus` (follow-up ticket seulement)
- `archived_at`, DB→500, `/api/chat`, `coach-notify`, `setUserClubStaffRoles`

---

**Commence par PHASE 1. Ne code rien avant GO.**
