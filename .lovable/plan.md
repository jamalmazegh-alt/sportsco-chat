# Plan — Fondation Entité Personne (v2)

Implémentation fidèle du prompt joint. **Non-destructif** : aucune donnée existante n'est modifiée, toutes les features actuelles continuent de fonctionner.

## Vue d'ensemble

Le principe : une Personne existe indépendamment d'un club. Les clubs enrichissent son profil mais ne le possèdent pas. On pose les fondations DB + 2 surfaces UI minimales (inscription joueur indépendant, profil public coach). Le feed et le claim profile sont préparés en DB mais sans UI.

## Étape 1 — Migration DB (un seul fichier)

### 1.1 `players.club_id` nullable
- `ALTER TABLE players ALTER COLUMN club_id DROP NOT NULL`
- Mise à jour RLS players : si `club_id IS NULL` → lecture/écriture par `user_id = auth.uid()` + super-admin uniquement. Sinon RLS club-scoped inchangée.
- Ajout colonnes claim : `claim_requested_by uuid`, `claim_status text CHECK (...)`, `claim_requested_at timestamptz` (architecture seulement, pas d'UI).

### 1.2 Enrichissement `profiles`
- `ADD COLUMN IF NOT EXISTS` : `first_name`, `last_name`, `birth_date`, `city`, `region`, `country DEFAULT 'FR'`, `bio`, `public_slug UNIQUE`, `profile_visibility` (private/club/public), `is_independent`, `person_type` (player/coach/parent/staff/user), `looking_for_club`, `followers_count`, `parental_public_consent`, `updated_at`.
- Index unique partiel sur `public_slug WHERE NOT NULL`.

### 1.3 Nouvelles tables
- `coach_profiles` (avec `current_club_id`, `sport`, `speciality`, `philosophy`, `years_experience`, `looking_for_club`, `public_slug`, `public_profile_enabled`, `profile_visibility`, `followers_count`, UNIQUE(user_id))
- `coach_diplomas` (rattachée à `coach_profiles`)
- `coach_club_history` (rattachée à `coach_profiles`)
- `follows` (cible polymorphique player/coach/club via `target_type` + 3 FK exclusives, contraintes CHECK + UNIQUE)
- `feed_events` (log immuable, actor polymorphique, metadata jsonb, visibility, occurred_at)

### 1.4 `clubs`
- `ADD COLUMN followers_count integer DEFAULT 0`
- `ADD COLUMN looking_for_coach boolean DEFAULT false`

### 1.5 GRANTs + RLS sur toutes les nouvelles tables
Suivant exactement la section 12 du prompt (coach_profiles, coach_diplomas, coach_club_history, follows, feed_events) + grants `authenticated`/`anon` selon visibilité.

### 1.6 Triggers
- `follows` INSERT/DELETE → incrément/décrément `followers_count` sur la bonne table cible (floor à 0).
- `club_members` AFTER INSERT → `feed_events` (player_joined_club / coach_joined_club) si profil public activé.
- `player_achievements` AFTER UPDATE (status → confirmed) → `feed_events` (player_achievement) si visibilité public.
- `coach_diplomas` AFTER INSERT → `feed_events` (coach_diploma) si coach public.
- `players` AFTER UPDATE (public_profile_enabled → true) → `feed_events` (player_public_profile_created).
- `coach_profiles` AFTER UPDATE (public_profile_enabled → true) → `feed_events` (coach_public_profile_created).
- `clubs` AFTER INSERT → `feed_events` (club_created), en excluant les clubs `is_personal=true` et `__rls_*`/`__e2e_*`.
- Mineurs sans `parental_public_consent=true` → aucun feed_event public.
- Tous SECURITY DEFINER, idempotents (guard anti-doublon), immutables.

### 1.7 Slugs
- Étendre `gen_player_public_slug()` : adultes `{first}-{last}-{4 alphanum}`, mineurs `10 alphanum` sans nom.
- Nouvelle `gen_coach_public_slug()` même format adulte.

## Étape 2 — Inscription joueur indépendant

Route `/register/player` (publique, 3 étapes) :
1. Identité : prénom, nom, date de naissance, email, mot de passe.
2. Sport : sport, poste (optionnel), pied fort (optionnel), ville/région (optionnel).
3. Confidentialité : explication visibilité publique, checkbox consentement parental si mineur, toggle `looking_for_club`.

À la fin :
- Crée `auth.users` (signUp standard, pas anonyme)
- `profiles` rempli (`is_independent=true`, `person_type='player'`, champs identité)
- `players` créé avec `club_id=NULL`, `user_id=new_user.id`
- Redirection vers le dashboard joueur existant

Lien depuis `/register` (CTA secondaire "Je suis joueur, créer mon profil") et depuis l'annuaire public `/players`.

## Étape 3 — Profil public coach

Route `/coach/$slug` (publique, SSR + SEO complet comme `/p/$slug`) :
- Nom, photo/avatar, club actuel, sport+spécialité, diplômes, historique clubs, philosophie, années d'expérience.
- Badge `looking_for_club` si actif.
- Bouton Follow (no-op si non connecté → CTA login) + `followers_count`.
- Meta tags OG/Twitter, JSON-LD Person, noindex si profil non public.

## Étape 4 — i18n

Ajout des clés FR/EN listées section 13 dans `common.json` (namespace `person`, `coach`, `follow`, `availability`, `feed`, `register`).

## Étape 5 — Hors scope (préparé, non implémenté)

- UI feed d'actualité (tables + triggers OK, pas de page).
- UI claim profile (colonnes OK, pas de flow).
- Bouton Follow côté UI joueur/club (table OK, on n'ajoute que sur `/coach/$slug` cette fois pour vérifier la mécanique).

## Détails techniques

- **Migration unique** via `supabase--migration` : tout en une fois, avec GRANT + RLS dans le même fichier (sinon PostgREST refuse l'accès).
- **Respect mémoire projet** : les RPC SECURITY DEFINER protégées par contrôles internes restent acceptées par le linter (rule core).
- **Clubs personnels** : `handle_new_user` reste inchangé (memory rule). Le trigger `club_created` exclut `is_personal=true`.
- **Realtime** : aucune nouvelle subscription (les nouvelles tables sont consommées via requêtes classiques).
- **Routes TanStack** : fichiers plat `register.player.tsx` et `coach.$slug.tsx` sous `src/routes/`.

## Fichiers créés/modifiés

Migrations :
- `supabase/migrations/<ts>_person_entity_foundation.sql`

Code :
- `src/routes/register.player.tsx` (nouveau, wizard 3 étapes)
- `src/routes/coach.$slug.tsx` (nouveau, profil public coach)
- `src/routes/register.tsx` (ajout CTA secondaire vers `/register/player`)
- `src/routes/players.tsx` (ajout CTA "Crée ton profil joueur" → `/register/player`)
- `src/locales/fr/common.json` + `src/locales/en/common.json` (clés i18n)
- `src/integrations/supabase/types.ts` (auto-régénéré après migration)
- `src/routeTree.gen.ts` (auto-régénéré)

## Validation

- Lint Supabase après migration (warnings SECURITY DEFINER attendus sur les helpers de slug et triggers — acceptables d'après la memory).
- Smoke test : un user existant continue de voir ses players liés à son club sans changement.
- Test manuel : `/register/player` crée bien profile + players avec club_id NULL ; `/coach/$slug` renvoie 200 pour un coach public, noindex sinon.