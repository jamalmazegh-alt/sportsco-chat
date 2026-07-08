## Objectif
Intégrer en production la page publique `/build-clubero` (questionnaire feedback), avec collecte anonyme, contacts opt-in séparés (newsletter / bêta), dashboard superadmin de lecture. Pas de worker, pas d'email, pas d'architecture parallèle.

## 1. Base de données (migration Supabase)

Une seule migration qui applique le SQL fourni, avec 3 adaptations projet:

- **`is_superadmin()`** → remplacé par un check via la table `super_admins` déjà existante (même pattern que le reste du projet — `has_role` / `super_admins` selon ce qui est utilisé pour `exempt_from_billing`). Vérification sur `auth.uid()`.
- **Rate-limit** → dans `start_build_clubero_response` et `save_build_clubero_answer`, appel de la fonction `increment_rate_limit` existante (bucket horaire, limite raisonnable type 60/h) via un wrapper qui prend l'IP en paramètre depuis l'appelant. Comme les RPC n'ont pas accès à l'IP directement, on passe `p_ip text` optionnel depuis le client (best-effort, non bloquant si null).
- **Tables `build_clubero_responses` / `build_clubero_answers`** créées avec RLS activé et **zéro policy** (deny-all). Aucun GRANT SELECT/INSERT sur les tables. Uniquement `GRANT EXECUTE` sur les 3 RPC publics + 1 RPC admin. Les vues restent lisibles uniquement par `service_role` (usage interne de `admin_build_clubero_dashboard`).

## 2. Route publique `/build-clubero`

Fichier `src/routes/build-clubero.tsx` (route publique, SSR par défaut, `head()` avec titre + description + og:title/description en FR).

Conversion du prototype en `.tsx` production:
- Types stricts (`Question`, `Answer`, `ContactPayload`, discriminated union par `type`).
- Config `QUESTIONS` déplacée dans `src/lib/build-clubero-config.ts`: `question_key` et `option.id` **immuables**, seuls titles/subtitles/labels/hints/scales/placeholders lus via `t('buildClubero.questions.<key>.…')`.
- Suppression du `<style>` injecté et de l'`@import` Google Fonts → réécriture avec Tailwind + tokens design system Clubero. Garde l'esprit visuel (dégradés bleu/cyan, animations shimmer, cartes glass) mais via classes Tailwind + variables CSS existantes. Respect `prefers-reduced-motion` (déjà géré via classes conditionnelles).
- Composants extraits: `Logo`, `ProgressBar`, `SingleChoice`, `MultiChoice`, `IconGrid`, `Rating`, `Slider`, `Rank`, `TextArea`, `WelcomeScreen`, `DoneScreen`, `ContactForm`.
- Accessibilité: aria-labels sur boutons rank monter/descendre, focus visibles, contrastes AA, parcours clavier.

## 3. Persistance & autosave

Hook `useBuildCluberoSession` (dans `src/lib/build-clubero-session.ts`):
- Génère `session_id` (uuid v4) au mount, persiste en `localStorage` sous `clubero:build-clubero:session`.
- Au mount: lit `localStorage` (réponses + index courant), puis appelle `start_build_clubero_response` avec `session_id`, `locale` (i18n courant), `utm` (parsés depuis `window.location.search`), `device` (`window.innerWidth < 768 ? 'mobile' : 'desktop'`).
- Chaque changement de réponse: `setState` local + persist localStorage immédiat + appel debounced 600ms de `save_build_clubero_answer`.
- Flush sur `visibilitychange` (hidden) et `pagehide` → annule le debounce et appelle la RPC immédiatement (via `supabase.rpc` — pas de `keepalive` nécessaire, `fetch` classique tient dans le délai de `pagehide` la plupart du temps; acceptable, best-effort documenté).
- Serveur = source de vérité: dès qu'une RPC répond OK, on ne re-flush pas cette réponse tant qu'elle n'a pas changé.

## 4. Finalisation

Sur clic "Envoyer" à l'écran final:
- État `loading`, désactive le bouton.
- Détermine `contact`:
  - Ni newsletter ni bêta cochés → `contact = null`.
  - Sinon → validation email (`emailOk`) obligatoire, sinon erreur inline non-bloquante pour le reste des champs. Payload: `{ first_name, email, phone, club, newsletter, beta }`.
- Appel `complete_build_clubero_response(session_id, contact)`.
- Sur succès: écran "merci" + purge localStorage (garde `session_id` pour éviter double envoi si retour).
- Sur erreur: garde l'état, message d'erreur i18n, permet de rejouer.

## 5. Section superadmin

Route `src/routes/superadmin/build-clubero.tsx` + entrée dans la sidebar `NAV` de `src/routes/superadmin.tsx` (label "Construisons Clubero", icône `MessageCircleHeart` ou similaire).

Chargement via TanStack Query:
```ts
supabase.rpc('admin_build_clubero_dashboard')
```

Affichage:
- **Overview**: 5 stats cards (sessions, terminées, leads newsletter, leads bêta, durée moyenne).
- **Options** & **Ranking**: `BarChart` Recharts par `question_key` (déjà utilisé dans le projet).
- **Numeric**: cards par `question_key` (moyenne, médiane, min/max, n).
- **Verbatims**: liste scrollable avec `question_key` + texte + club + date.
- **Leads**: table avec colonnes séparées ✅ Newsletter / ✅ Bêta, dates de consentement séparées, bouton "Export CSV" via `downloadCsv` de `src/lib/csv.ts`.

## 6. i18n

Namespace `buildClubero` créé pour les 7 langues (`fr`, `en`, `de`, `es`, `it`, `nl`, `pt`) dans `src/locales/<lang>/buildClubero.json`. Ajout au `resources` de `src/lib/i18n.ts` et au tableau `ns`.

Contenu: `hero.*`, `questions.<key>.title/subtitle/placeholder`, `questions.<key>.options.<id>.label/hint`, `questions.<key>.scale.<v>.label`, `nav.next/back/send/skip`, `save.saving/saved`, `contact.*`, `errors.*`, `done.*`.

FR = source, autres langues traduites (ton coach/humain). Script check-i18n confirmera la parité.

## 7. Tests

Nouveaux tests dans `src/tests/unit/`:
- `build-clubero-config.test.ts`: `isAnswered()` par type, `emailOk()`, `reorder()`.
- `build-clubero-session.test.ts`: debounce, flush sur visibilitychange/pagehide (mock `document.dispatchEvent`), reprise après reload (mock localStorage), dérivation contact null vs newsletter vs bêta vs both.

Tests RLS dans `tests/rls/build-clubero.rls.ts`:
- Anon `SELECT` sur `build_clubero_responses` / `build_clubero_answers` → refusé.
- Anon `INSERT` direct → refusé.
- Anon `rpc('start_build_clubero_response')` → OK, retourne un uuid.
- Anon `rpc('save_build_clubero_answer')` → OK.
- Anon `rpc('complete_build_clubero_response')` avec contact newsletter+beta → OK, vérif via service_role que `newsletter_consent_at` ET `beta_consent_at` sont timestampés séparément.
- Non-superadmin authentifié `rpc('admin_build_clubero_dashboard')` → `42501 forbidden`.
- Superadmin authentifié → OK, retourne l'objet jsonb complet.

Script `bun run check:i18n` pour garantir aucune clé manquante sur les 7 langues.

Lancement: `bun run test`, `bun run test:rls`, `bun run check:i18n`, `bun run check:guards`.

## Fichiers créés/modifiés
- **Migration**: `supabase/migrations/<ts>_build_clubero.sql`
- **Route publique**: `src/routes/build-clubero.tsx`
- **Route superadmin**: `src/routes/superadmin/build-clubero.tsx` + sidebar update dans `src/routes/superadmin.tsx`
- **Config & hooks**: `src/lib/build-clubero-config.ts`, `src/lib/build-clubero-session.ts`
- **Composants**: `src/components/build-clubero/*.tsx` (un fichier par composant complexe)
- **i18n**: 7× `src/locales/<lang>/buildClubero.json` + `src/lib/i18n.ts`
- **Tests**: 2 fichiers unit + 1 fichier RLS

## Points d'attention
- La RPC `is_superadmin()` sera implémentée en tant que wrapper vers le vrai check du projet — je vais vérifier `super_admins` table et le pattern exact avant migration.
- Rate-limit IP: le client ne connaît pas son IP publique fiable → on branche `increment_rate_limit` côté serveur uniquement dans les routes `/api/public/*`. Comme ici on appelle les RPC en direct depuis le client Supabase, le rate-limit reste **best-effort** avec un TODO clair. Alternative si tu préfères : passer par un endpoint TanStack `src/routes/api/public/build-clubero/*.ts` proxifiant les RPC → là on a l'IP via `getClientIp()`. Dis-moi si tu veux cette variante (plus coûteux mais rate-limit dur).
- Pas de worker, pas d'email — la finalisation ne déclenche **aucun** side-effect au-delà de l'update DB.
