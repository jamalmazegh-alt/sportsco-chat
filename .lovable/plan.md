## Objectif

Aligner la communication (site vitrine) et les prompts des assistants IA sur la liste réelle des features livrées dans l'app, puis propager dans les 7 langues.

## Phase 1 — Audit & réconciliation (livrable à valider avant écriture)

Je vais produire un seul document `docs/beta-v1/feature-inventory.md` qui :

1. Croise `docs/beta-v1/feature-matrix.md` avec ce que je trouve dans le code (`src/routes/_authenticated/*`, `src/modules/tournaments`, `src/lib/*`, migrations Supabase).
2. Classe chaque feature par module :
   - Coordination : convocations, réponses, chat événement, rappels, wall
   - Effectif : joueurs, parents, guardians, historique, follow-ups, feedback coach, défis, suspensions, dispos
   - Événements : matchs, entraînements, tournois (multi-clubs, flights, brackets), stages, covoiturage
   - Paiements : cotisations, obligations, reçus, Stripe, tournois payants, pass tournois
   - Communication : notifications push, emails transactionnels, WhatsApp bridge, wall, réseaux sociaux
   - Administration : rôles, invites, branding, venues, sponsors, RGPD, exports
   - Public : pages tournois publiques, TV, inscriptions publiques, profils joueurs publics, stages
   - IA : assistant coach, création tournoi, build Clubero, marketing-chat
3. Marque pour chacune : **shipped / partial / roadmap**, + note (« pas dans feature-matrix », « listé mais pas livré », etc.).
4. Section « écarts » : ce qui est dans le code mais pas sur le site, et l'inverse.

**→ Je te demande de valider cet inventaire avant de toucher au contenu vitrine ou aux prompts.**

## Phase 2 — Site vitrine (FR d'abord dans les JSON, puis traductions)

Fichiers touchés :

- `src/locales/fr/marketing.json` — sections `home`, `features`, `pricing`, `faq` réécrites à partir de l'inventaire validé.
- `src/routes/features.tsx` — restructurer en modules (voir Phase 1) avec pour chaque feature : nom, 1 phrase de valeur, icône Lucide, badge (nouveau/beta/pro).
- `src/routes/index.tsx` — sections `featuresTitle` + 4 perspectives (coach/parent/joueur/club) mises à jour avec les vrais bénéfices.
- `src/routes/pricing.tsx` — liste des features par plan alignée sur la matrice (indiquer clairement ce qui est gratuit / beta / à venir).
- `src/routes/faq.tsx` — ajouter les questions récurrentes (dispos, covoiturage, tournois payants, RGPD, WhatsApp, multi-clubs).
- Head metadata mise à jour si les titres/descriptions changent.

Contraintes respectées :
- Aucun texte en dur dans les composants — tout via `useTranslation` sur les clés existantes ou nouvelles dans `marketing.json`.
- Pas de nouveau design system, on garde les composants existants.

## Phase 3 — Traduction 7 langues

- Une seule passe automatisée via `scripts/translate-locales.mjs` (existe déjà) sur `marketing.json` uniquement, à partir du FR mis à jour.
- Contrôle final : `bun run check:i18n` doit rester vert.
- Locales cibles : de, en, es, it, nl, pt.

## Phase 4 — Assistants IA

Quatre prompts à mettre à jour, chacun avec une section « features actuelles » synthétique tirée de l'inventaire :

1. **`src/routes/api/public/marketing-chat.ts`** — prompt orienté prospect. Doit connaître : modules livrés, plans, langues supportées, RGPD/EU, différenciation vs WhatsApp.
2. **`src/lib/llm/tournament-assistant.functions.ts`** — assistant création tournoi : ajouter les nouveaux formats (flights, double élim, Swiss), options paiement, terrains, fair play.
3. **`src/routes/api/public/build-clubero/*`** — assistant de feedback produit : mettre la liste des features à jour dans le contexte pour poser des questions pertinentes.
4. **`src/routes/api/chat.ts`** (assistant in-app coach/club) — enrichir avec la connaissance des modules pour orienter l'utilisateur vers la bonne page.

Constantes partagées : je crée `src/lib/llm/feature-context.ts` qui exporte une string `FEATURE_CONTEXT` (dérivée de l'inventaire) importée par les 4 prompts. Une seule source à mettre à jour ensuite.

## Phase 5 — Vérifications

- `bun run test` (609 unit tests)
- `bun run check:i18n`
- `bun run check:guards`
- `bun run lint` sur les fichiers touchés
- Screenshots Playwright de `/`, `/features`, `/pricing`, `/faq` en FR et EN pour vérifier visuellement.

## Détails techniques

- `src/lib/llm/feature-context.ts` : ~150 lignes, format markdown bullet, versionné dans le repo, importé (pas lu à runtime).
- `marketing.json` : garder la structure actuelle des clés pour ne pas casser le code ; ajouter de nouvelles sous-clés `features.modules.<module>.<feature>`.
- Traductions : le script existant utilise Lovable AI ; coût ~6 locales × ~100 clés nouvelles = raisonnable.
- Pas de migration DB, pas de nouvelle route, pas de nouveau composant UI majeur.

## Ce que je NE fais PAS (sauf si tu le demandes)

- Refonte visuelle du site vitrine (design system, hero, illustrations).
- Nouvelle page dédiée par module.
- Ajout de screenshots produit dans /features.
- Modifications des textes in-app (autres que les 4 prompts d'assistants).
- Mise à jour de la doc `docs/` autre que le nouvel inventaire.

## Ordre d'exécution recommandé

1. Phase 1 seule → validation avec toi.
2. Phases 2 + 4 en parallèle (contenu FR + prompts, chacun s'appuie sur l'inventaire).
3. Phase 3 (traductions).
4. Phase 5 (vérifs + screenshots).

Ça représente ~3-4 tours de messages pour toi selon la profondeur des retours sur l'inventaire.