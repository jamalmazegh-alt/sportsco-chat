# TICKET A-bis — Follow-up (hors patch fail-loud v1)

**Statut :** ouvert après PHASE 1 investigation (2026-07-11)  
**Parent :** [`PROMPT-A-bis-v1.md`](PROMPT-A-bis-v1.md) — fail-loud `validateMatch` seul

---

## 1. Même fail-loud + UI — `recordMatchScore` / `setMatchStatus`

| Handler            | Ligne                           | Guard             | Progression                      | UI                                    |
| ------------------ | ------------------------------- | ----------------- | -------------------------------- | ------------------------------------- |
| `recordMatchScore` | `tournaments.functions.ts:813`  | `assertCanManage` | `applyBracketProgression` direct | `MatchesList.tsx` save mutation ~L655 |
| `setMatchStatus`   | `tournaments.functions.ts:1556` | `assertCanManage` | idem                             | `MatchesList.tsx` statusM ~L792       |

**Note :** retirer le catch silencieux dans `applyBracketProgression` (patch v1) affecte **aussi** ces handlers au runtime — même risque S3/S1, mais **pas de message UI dédié** dans v1.

**Ordre écritures `recordMatchScore` :** score UPDATE (L797-810) → progression (L813) → best-effort `in_progress` (L816-827, catch avale).  
Message UI variante A applicable si même ordre confirmé (score commit avant progression).

---

## 2. Tier C — RPC transactionnelle atomique

Voir [`TICKET-A-bis-atomicity.md`](TICKET-A-bis-atomicity.md).

**Exigences ticket C (rappel) :**

- `SECURITY DEFINER` + `SET search_path = ''`
- Re-check `can_validate_match` dans RPC pour chemin arbitre
- Honnêteté TOCTOU si updates pré-calculés en TS (C1)
- Rollback validation si progression échoue (ferme S1)

**Hors scope** tant que fail-loud v1 non stabilisé en prod.

---

## 3. Gap résiduel post-v1

### 3a. UPDATE validation 0 lignes (race delete)

- UPDATE validation sans `.select()` : 0 lignes ne throw pas (race delete match entre fetch et write) → progression peut quand même partir.
- **Pré-fail-loud :** validation silencieusement no-op + progression tourne → `{ ok: true }` sans rien avoir validé.
- **Post-fail-loud (v1) :** même race → progression peut throw → `500 bracket_progression_failed` alors que la validation n'a rien persisté — message variante A **techniquement faux** dans ce race étroit (résultat _non_ enregistré). Fréquence négligeable.
- **Durcissement Tier C :** `.select().single()` (ou guard `count`) sur l'UPDATE validation pour faire échouer proprement le 0-row avant progression.
