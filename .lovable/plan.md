# PR4 — Fermeture des canaux restants & waitlist V2

## Préalable bloquant à trancher (à valider)

`src/config/features.ts` est client/SSR only. Les notifications, emails et triggers DB sont émis côté serveur (edge functions + triggers Postgres) et n'ont pas accès à ce module. Il faut une **source serveur** du flag.

**Recommandation (option pragmatique bêta)** : variables d'env Worker/Edge :
- `SOCIAL_NETWORK_V2=false`
- `PUBLIC_PLAYER_PROFILES=false`
- `FUNDRAISING_V2=false`
- `PAYMENTS_V2=false`

Plus un petit helper `src/lib/features.server.ts` qui lit `process.env` et expose `isV2Server('payments_v2')`. Pour les **triggers DB** (qui ne lisent pas l'env Node), on ajoute une table `app_flags(key text pk, enabled bool)` lue par les fonctions SQL concernées via une fonction `public.is_v2(key text) returns bool stable security definer`. Une seule source applicative (`features.ts`), deux miroirs serveurs (`process.env` pour TS, `app_flags` pour SQL), à garder synchronisés via doc dans `feature-matrix.md`.

**Décision attendue avant WS2/WS5.** Si validée → on l'implémente en début de PR4.

## Périmètre

6 chantiers (WS1→WS6) + i18n + DoD. On masque, on ne supprime pas. Flip de flag = réactivation totale.

### WS1 — Recherche globale (`src/components/global-search.tsx`)
- Gater la branche `players` derrière `isV2('public_player_profiles')`.
- Aucun résultat « club découverte » ni profil public.
- Conserver intra-club (mes équipes / mes events / membres de mon club uniquement).
- Garantir absence de lien `/p/$slug`, `/coach/$slug`, `/players/$id` (hors club courant).

### WS2 — Notifications & emails (serveur)
- Repérer émetteurs : `rg notifications|enqueue_email|notify` dans `src/routes/api/` + `supabase/functions/` + migrations triggers.
- Gater l'insert/enqueue derrière `isV2Server(...)` ou `public.is_v2(...)` selon contexte.
- Cibles : follows, receipts paiement, pass tournoi, rappels follow-ups, cagnottes.
- Auditer templates email (`src/routes/lovable/email/transactional/*`) : aucun lien vers route masquée.

### WS3 — Onboarding
- Auditer `src/routes/_authenticated/` (étapes setup club / profil / paiements).
- Retirer étapes "Configurer Stripe", "Profil public", "Suivre".
- Renuméroter, par rôle (parent/joueur/coach/admin/orga).

### WS4 — Menus contextuels, avatars, réglages Stripe
- Wrapper `Avatar` partagé : prop `linkToProfile` gatée par `isV2('public_player_profiles')`. Si off → rendre `<span>` non cliquable (ou mini-fiche club-scoped).
- Audit `rg "to=\"/players|/p/\\$|/coach/\\$|payments|new-from-pass" src` → neutraliser chaque `<Link>`.
- Menus kebab : retirer "Voir profil", "Suivre", "Mettre en relation".
- Admin club : masquer entrée "Stripe / Paiements / Connecter" derrière `payments_v2`.

### WS5 — Waitlist « Être prévenu »
- **Migration** : table `public.waitlist_interest` (sans policies select/insert anon/auth), GRANT service_role only.
- **Server route** `src/routes/api/public/waitlist-interest.ts` (POST) :
  - Zod validate `email`, `features[]`, `role?`, `marketing_consent`, honeypot.
  - Rate-limit via `checkRateLimit` existant.
  - Insert via `supabaseAdmin` (chargé dynamiquement).
  - `consent_at = now()` si consent true, sinon null.
- **Composant** dans section "À venir" de `src/routes/index.tsx` : multi-select features, select rôle, checkbox consent non pré-cochée. CTA "Être prévenu" uniquement.
- i18n 7 langues (labels, options, consent).
- Matrice : ajouter ligne "Capture liste d'attente V2 — Visible".

### WS6 — Smoke test étendu (`tests/e2e/beta-v1-masking.e2e.ts`)
Assertions :
- Chaque route masquée → accès direct → URL finale = `/home` (redirect), pas 404/500.
- Recherche globale d'un nom de joueur public seedé → 0 lien `/p/`, `/coach/`, `/players/`.
- Bottom-nav + nav secondaire → aucune entrée masquée.
- Onboarding 4 rôles → aucun lien masqué.
- Clic avatar roster → pas de navigation vers `/p/` / `/coach/`.
- `sitemap.xml` → ne contient ni `/players`, ni `/p/`, ni `/payments`.
- Profils publics → `<meta name=robots content=noindex,nofollow>` avant redirect.
- Waitlist → POST crée 1 ligne sans déblocage.
- `data-testid` ajoutés sur avatar, nav items, étapes onboarding, search input.

## i18n
Namespace `marketing` (7 langues) : badge "À venir", labels formulaire waitlist, options features/rôles, consent, bouton. Aucune clé supprimée.

## Definition of Done
- Flag serveur en place ; émission notif/email gatée serveur.
- Recherche globale purgée.
- Onboarding sans étape masquée (4 rôles).
- Avatars/noms non cliquables (ou mini-fiche) ; Stripe nettoyé.
- Zéro CTA résiduel (collecte/paiement/pass/suivre).
- `waitlist_interest` + route publique (honeypot/rate-limit) ; RGPD OK ; matrice à jour.
- Smoke test étendu vert.
- i18n 7 langues à jour.
- TypeScript vert ; aucun fichier supprimé ; flip flag = réactivation.

## Hors scope
- Championnats/Ligues (V2 non développé).
- Refonte exhaustive route-par-route au-delà de l'audit `rg`.

## Ordre d'exécution
0. **Décision flag serveur** (env + `app_flags` ?) ← bloque WS2/WS5
1. WS1 (recherche)
2. WS4 (avatars/menus/Stripe) — gros volume de grep, parallélisable
3. WS3 (onboarding)
4. WS2 (notifs/emails serveur)
5. WS5 (waitlist, en parallèle vitrine)
6. WS6 (smoke, en dernier)
7. i18n 7 langues
8. QA manuelle 6 rôles mobile+desktop

---

**Question avant exécution** : je pars sur l'option pragmatique (env Worker + table `app_flags` pour SQL), ou tu préfères tout centraliser dans `app_flags` (lecture client via RPC `public.is_v2`) ? Le 2e est plus propre mais ajoute 1 RPC + invalidation cache côté client.
