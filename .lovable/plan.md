## Plan — Sprints A & B (priorités 1, 4, 5 + diaporama)

Périmètre verrouillé suite à tes réponses :
- **Sports couverts** : Football, Futsal, Basketball, Rugby, Handball, Volleyball, Hockey sur glace, Hockey sur gazon (= `TOP_SPORTS ∪ COLLECTIVE_SPORTS` actuels).
- **Paiement public** : reporté. Sprint C (inscription publique + Stripe) est mis de côté pour plus tard.
- **URL publique** : `clubero.app/tournament/$slug` (on migre l'actuel `/t/$slug` → `/tournament/$slug`, avec redirection de l'ancien).
- **Diaporama (#3)** : intégré au Sprint B.

---

### Sprint A — Formats flexibles & score par sets (#1, #5)

**Objectif** : un moteur de format modulaire par sport + saisie de score adaptée (sets pour volley/hockey, score simple pour les autres).

**Base de données**
- Enrichir `tournaments.settings` (JSONB déjà existant) avec un bloc `scoring` :
  - `mode`: `"simple"` | `"sets"`
  - `sets`: `{ bestOf: 3 | 5, pointsToWin: 21|25, tieBreakPoints?: 15, winBy: 2 }`
  - `periods` (pour hockey/rugby) : `{ count, durationMin }`
- Enrichir `matches` :
  - colonne `sets` (JSONB) : `[{ a: 25, b: 23 }, { a: 22, b: 25 }, ...]`
  - `score_a` / `score_b` restent (= sets gagnés en mode sets, ou score brut en mode simple)

**Moteur de formats** (`src/modules/tournaments/lib/formats.ts`)
- Profils par sport déterminant le mode par défaut :
  - Sets : `volleyball`
  - Mi-temps / périodes : `football`, `futsal`, `basketball`, `rugby`, `handball`, `ice_hockey`, `field_hockey`
  - Score simple universel disponible en fallback.
- Helpers : `defaultScoringForSport(sport)`, `computeWinnerFromSets(sets, rules)`.

**UI**
- `MatchesList` / saisie de score : nouvelle variante "score par sets" (volley uniquement pour V1), avec ajout/retrait de sets, validation auto du vainqueur.
- `TournamentRulesEditor` : section "Scoring" pilotée par le sport sélectionné.

**Restriction** : on garde `SportSelect` actuel, on ne touche pas aux sports listés.

---

### Sprint B — Site public + diaporama (#4 + #3)

**Objectif** : chaque tournoi publié a une URL partageable, SEO friendly, plus un mode TV plein écran auto-rotatif.

**Routing**
- Nouvelle route : `src/routes/tournament.$slug.tsx` (remplace `t.$slug.tsx`).
- Nouvelle route : `src/routes/tournament.$slug.tv.tsx` (remplace `t.$slug.tv.tsx`).
- Ancienne route `t.$slug` : redirection 301 vers `/tournament/$slug` (compat liens existants).
- Mise à jour des liens internes (`ShareDialog`, `tournaments.$tournamentId.tsx`, sitemap).

**Page publique `/tournament/$slug`**
- SSR via `getPublicTournament` (déjà existant), enrichi : `og:image` dynamique (cover ou fallback dérivé), `og:title`, `og:description` spécifiques au tournoi.
- Onglets existants conservés : Aperçu / Équipes / Matchs / Classement / Bracket.
- Affichage score : adapté au mode (sets visibles sous forme `25-22, 23-25, 15-12`).
- Bouton "TV / Diaporama" en évidence.
- Sitemap `sitemap.xml` : ajout des tournois publiés.

**Diaporama `/tournament/$slug/tv`**
- Plein écran, fond sombre, auto-rotation des écrans toutes N secondes (configurable via `?refresh=15`) :
  - Slide 1 : derniers résultats
  - Slide 2 : prochains matchs
  - Slide 3 : classement (par poule, paginé si > 1 poule)
  - Slide 4 : bracket (phase finale si présente)
- Refetch live toutes les 30 s (`refetchInterval` déjà en place).
- Logo Clubero discret + nom tournoi + horloge.
- Bouton plein écran natif (`requestFullscreen`).

---

### Détails techniques

**Sports couverts (verrouillé)**

```ts
// src/lib/sports.ts — inchangé
TOP_SPORTS = ["football", "basketball"]
COLLECTIVE_SPORTS = ["handball", "volleyball", "rugby", "futsal",
                    "ice_hockey", "field_hockey"]
```

**Scoring par défaut**

```text
football, futsal, basketball, rugby, handball,
ice_hockey, field_hockey   → mode "simple" (score brut)
volleyball                  → mode "sets" (3 sets gagnants à 25, tie-break 15)
```

L'orga peut surcharger via `TournamentRulesEditor`.

**Migrations DB**
1. `ALTER TABLE matches ADD COLUMN sets jsonb;`
2. Pas de nouveau type — `settings.scoring` vit dans le JSONB existant.

**Redirection ancienne URL**
- `src/routes/t.$slug.tsx` devient un simple `<Navigate to="/tournament/$slug" replace />`.
- Idem `t.$slug.tv.tsx` et `t.$slug.register.tsx` (cette dernière sera désactivée tant que Sprint C n'est pas livré).

**Tests**
- Unit : `formats.test.ts` (defaults par sport, calcul vainqueur sets).
- E2E : étendre `15-clubero-pack-purchase` ou nouveau `16-public-tournament.e2e.ts` (publication → URL publique accessible non-auth → TV s'ouvre).

---

### Livrables par sprint

**Sprint A**
- Migration `matches.sets`
- `src/modules/tournaments/lib/formats.ts`
- Mise à jour `MatchesList` (saisie sets pour volley)
- Section "Scoring" dans `TournamentRulesEditor`
- Tests unit

**Sprint B**
- Routes `tournament.$slug.tsx` + `tournament.$slug.tv.tsx`
- Redirections depuis `t.$slug*`
- Diaporama TV plein écran auto-rotatif
- `og:image` dynamique + sitemap mis à jour
- Mise à jour des liens internes (ShareDialog, etc.)

---

### Hors périmètre (à confirmer plus tard)
- Inscription publique + paiement Stripe (#6)
- Sponsors, stats joueur cross-tournois, co-organisateurs, PWA push
