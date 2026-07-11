## Phase 2 — Page publique du stage + inscription famille

Périmètre : rendre les stages `published` visibles publiquement, permettre à une famille (non authentifiée) de préinscrire un enfant avec upload des pièces obligatoires. Aucune modification du back-office Phase 1.

### 1. Routes publiques (TanStack file-based, SSR)

- `src/routes/stages.$clubSlug.$campSlug.tsx` — page stage.
  - `loader` → server fn public `getPublicCampBySlug({ clubSlug, campSlug })` (client publishable + policies anon existantes `published`).
  - `head()` : title `<Camp.title> — <Club.name>`, meta description = `short_description`, `og:image` = `cover_url` absolu, `twitter:card=summary_large_image`.
  - `errorComponent` + `notFoundComponent`.
  - Rend : cover, titre, dates, lieu (venue/facility), description longue, tranches d'âge (badges), programme (jours), documents fournis (liens signés éphémères ou publics), pièces à fournir (liste + `is_sensitive` masqué au public), bouton "S'inscrire".
- `src/routes/stages.$clubSlug.$campSlug.inscription.tsx` — formulaire famille (page dédiée, meilleure ergonomie qu'un modal, permet deep-link + SEO `noindex`).
  - Champs : enfant (prénom, nom, date de naissance, sexe), parent référent (prénom, nom, email, téléphone), tranche d'âge choisie (select filtré selon date de naissance), notes libres, honeypot caché, consentement RGPD.
  - Upload des `required_documents` : un `<input type=file>` par pièce obligatoire, PDF/JPG/PNG ≤ 15 MB.
  - Soumission → `POST /api/public/submit-camp-registration` (voir §3).

### 2. Server function publique de lecture

`src/lib/public-camps.functions.ts` (client-safe path, pas de `requireSupabaseAuth`) :

- `getPublicCampBySlug({ clubSlug, campSlug })` : client `SUPABASE_PUBLISHABLE_KEY` (pas admin). SELECT projetés : camp (colonnes publiques), club (name, logo_url, slug), venue/facility, age_groups triés, program_items triés, documents fournis, required_documents (label + type + required, jamais `is_sensitive` côté public).
- Retourne `notFound()` si aucun résultat (la policy anon filtre déjà `status='published'`).

### 3. Route publique d'inscription

`src/routes/api/public/submit-camp-registration.ts` (server route, méthode POST) :

1. `getClientIp(request)` + `checkRateLimit(ip, 'camp-registration', 5)` — 5/h/IP.
2. `multipart/form-data` : parse champs + fichiers.
3. Validation Zod : payload complet + honeypot vide (sinon 200 fake success).
4. Résolution `club_id` + `camp_id` par slugs, vérif `status='published'` + `registration_open`, âge de l'enfant compatible avec `age_group_id` choisie.
5. Vérification que **toutes** les `required_documents.required=true` sont fournies. Type MIME + taille (≤ 15 MB).
6. `supabaseAdmin` (chargé via `await import`) :
   - Upload chaque fichier vers `camp-registration-documents/<camp_id>/<registration_id>/<slug(label)>.<ext>`.
   - INSERT `club_camp_registrations` (statut `pending`, données famille, age_group_id).
   - INSERT `club_camp_registration_documents` (une ligne par pièce, `storage_path`, `is_sensitive` recopié depuis la définition serveur — jamais du client).
7. Envoi email confirmation via `enqueueTransactionalEmailServer` avec template dédié `camp-registration-received` (à créer) — sujet FR par défaut, i18n via la locale du club.
8. Réponse `{ ok: true, registrationId }`.

### 4. Emails transactionnels

- Nouveau template serveur `camp-registration-received` (envoi serveur only, pas dans l'allowlist client).
- Contenu : merci + récap enfant + stage + statut "en attente de validation" + rappel des pièces reçues.
- Notification interne aux admins/dirigeants du club : template `camp-new-registration` (lien `/admin/stages/<campId>/inscriptions` — la route existe en Phase 3, on lie vers l'édition du stage pour l'instant).

### 5. UI publique et composants

- `src/components/camps/public/` :
  - `PublicCampHeader.tsx` (cover + titre + dates + lieu).
  - `PublicCampContent.tsx` (description, âges, programme, docs fournis).
  - `PublicRegistrationForm.tsx` (formulaire multi-étapes ou sections, react-hook-form + zodResolver, gestion uploads).
- Skinning via `ClubThemeProvider` déjà en place (les couleurs du club s'appliquent).
- État après soumission : écran de confirmation avec numéro de dossier, pas de redirection.

### 6. i18n (7 langues)

Étendre `src/locales/*/camps.json` avec un bloc `public` :
titre section, labels formulaire (enfant, parent, tranche d'âge, pièces), messages d'erreur (rate limit, pièce manquante, âge incompatible), confirmation, RGPD.

### 7. Sécurité & garde-fous

- Route publique `/api/public/*` : jamais authentifiée mais toutes les vérifs faites côté serveur.
- Aucune donnée sensible (`is_sensitive`) exposée en lecture publique.
- Honeypot `website` champ caché → 200 sans effet.
- Rate limit 5/h/IP bucket `camp-registration`.
- MIME + taille contrôlés serveur avant upload (client n'est qu'indicatif).
- Aucun INSERT anon direct sur Postgres — tout passe par la route publique service_role.
- Les URLs signées vers `camp-registration-documents` restent réservées Phase 3 (dossier de traitement admin) : Phase 2 n'expose jamais les fichiers uploadés.

### 8. Non compris (reste Phase 3)

- Dashboard admin des inscriptions (`/admin/stages/<id>/inscriptions`).
- Validation/refus, paiement, génération de convocations, purge après stage.
- Vue signée des pièces sensibles avec restriction `admin|dirigeant`.

### 9. Détails techniques

- Server route utilise `createFileRoute` avec `server.handlers.POST`.
- `getPublicCampBySlug` : ne pas utiliser `supabaseAdmin` (bug `Expected 3 parts in JWT` connu). Client publishable + policies anon existantes.
- Loader du stage : appel de la server fn publique (pas de bearer requis), safe pour SSR / prerender.
- Route inscription : loader charge le même camp + la liste des `required_documents`.
- Formatage tailles/MIME : constantes partagées dans `src/lib/camps-content.functions.ts` réexportées.
- Tests unitaires : ajouter au moins un test sur la validation Zod du payload d'inscription (types MIME, âge, required) — `bun run test`.

### 10. Séquencement

1. Server fn publique de lecture + route stage publique + `head()` SEO.
2. i18n `public` × 7 langues.
3. Composants d'affichage + skinning club.
4. Route inscription publique (page) + form.
5. Route API publique `/api/public/submit-camp-registration` + rate-limit + honeypot + uploads.
6. Templates emails `camp-registration-received` + `camp-new-registration`.
7. `bun run typecheck` + `bun run test` + `bun run check:i18n`.
