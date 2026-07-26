# TICKET A-bis — Atomicité `validateMatch` + `applyBracketProgression`

**Priorité :** P1 (intégrité données bracket)  
**Hors scope :** patch Classe A (dérivation `tournament_id`) — **ne pas mélanger**  
**Statut :** ouvert — investigation audit 2b / prompt validateMatch

---

## Constat

`validateMatch` + `applyBracketProgression` exécutent **plusieurs écritures séparées**, sans transaction SQL englobante.

### Ordre d'exécution et écritures

| #    | Client                   | Opération               | Table                                                             | Fichier:ligne                        |
| ---- | ------------------------ | ----------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| 1    | `context.supabase` (RLS) | **UPDATE**              | `tournament_matches` (`validated_at`, `validated_by`)             | `tournaments.functions.ts:1449-1456` |
| 2    | `supabaseAdmin`          | SELECT (lecture)        | `tournament_matches` (tous les matchs du tournoi)                 | `tournaments.functions.ts:25-30`     |
| 3..N | `supabaseAdmin`          | **UPDATE** × k (boucle) | `tournament_matches` (`team_a_id`, `team_b_id`, `winner_team_id`) | `tournaments.functions.ts:34-42`     |

**Total écritures mutantes :** `1 + k` appels HTTP/PostgREST distincts (`k` = nombre de mises à jour de progression, variable).

**Transaction ?** **Non.** Aucune RPC transactionnelle, pas de `BEGIN/COMMIT`, pas de rollback applicatif.

### Gestion d'erreur actuelle

`applyBracketProgression` enveloppe tout dans `try/catch` et ne fait qu'un `console.warn` en cas d'échec (`tournaments.functions.ts:44-47`).  
→ La validation du match (étape 1) **réussit toujours** côté handler même si la progression échoue silencieusement.

---

## Scénarios de corruption

### S1 — Progression partielle (non-IDOR)

1. UPDATE validation OK (match M validé).
2. Boucle progression : updates 1..j OK, update j+1 échoue (timeout, contrainte, etc.).
3. Handler retourne `{ ok: true }` ; bracket **partiellement** propagé.

**Effet :** match validé en DB, équipes aval incohérentes pour une partie du bracket.

### S2 — Mismatch tournoi (IDOR pré-fix Classe A)

1. `can_validate_match` OK sur `match_id` ∈ tournoi A.
2. Client envoie `tournament_id` = B.
3. UPDATE validation avec `.eq("tournament_id", B)` → **0 ligne** (pas d'erreur — pas de `.select().single()`).
4. `applyBracketProgression(B)` s'exécute quand même → **corruption tournoi B**.

**Note :** le fix Classe A (dérivation scope) ferme S2 ; S1 reste ouvert.

### S3 — Progression silencieusement ignorée

1. Validation OK.
2. `applyBracketProgression` throw → catch → warn seulement.
3. UI affiche succès ; bracket jamais recalculé.

---

## Proposition (à implémenter dans un patch dédié)

Encapsuler validation + progression dans une **RPC Postgres transactionnelle**, ex. :

```sql
-- validate_match_and_progress(_user_id, _match_id, _validated boolean)
-- 1. can_validate_match (ou re-check inline)
-- 2. SELECT tournament_id FROM tournament_matches WHERE id = _match_id FOR UPDATE
-- 3. UPDATE validation sur ce match
-- 4. Calcul progression (SQL ou appel fonction existante) dans la même transaction
-- 5. UPDATE batch des matchs aval
```

**Alternative minimale (sans RPC) :** au minimum faire échouer le handler si `applyBracketProgression` échoue (retirer le catch silencieux) — améliore la visibilité, **ne garantit pas** l'atomicité.

---

## Critères d'acceptation A-bis

- [ ] Validation + toutes les updates de progression dans **une** transaction
- [ ] Échec progression → rollback validation
- [ ] Tests : échec simulé mi-progression → état DB inchangé vs début
- [ ] Même traitement pour `recordMatchScore` / `setMatchStatus` si ils appellent `applyBracketProgression` (même pattern)

---

## Références

- Audit 2b : `auth-2b-writes-inventory.md` — `validateMatch` IDOR-RISK P0
- Code : `src/modules/tournaments/tournaments.functions.ts` L22-48, L1400-1461
