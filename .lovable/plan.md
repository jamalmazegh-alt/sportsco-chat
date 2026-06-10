## Objectif

Transformer le composant `ConvertPersonalClubBanner` (aujourd'hui une simple boîte de conversion d'orga libre en FR uniquement) en un véritable funnel de conversion organisateur de tournoi → abonnement club, avec déclenchement contextuel, copy localisée, tracking et email post-tournoi.

## 1. Nouvelle bannière `TournamentToClubBanner`

Nouveau composant `src/components/tournament-to-club-banner.tsx` (on garde l'ancien `convert-personal-club-banner.tsx` pour le cas "renommer mon orga libre" sur l'admin — ce sont 2 usages différents).

- Design : fond dégradé `from-primary/15 to-accent/10`, ring `primary/30`, icône `Trophy` dans pastille primaire, layout 2 colonnes desktop / stack mobile.
- Contenu via i18n (namespace `common.tournamentToClub.*`) :
  - `title`, `subtitle`, `ctaPrimary`, `ctaSecondary`, `dismiss`.
- CTA primaire → `/pricing?source=tournament_conversion&tournament_id=<id>` + tracking `banner_clicked`.
- Lien secondaire "En savoir plus" → `/pricing?source=tournament_conversion`.
- Bouton X pour dismiss → écrit `clubero:tournament_banner_dismissed:<tournamentId>` en localStorage avec timestamp (TTL 30 j).
- `useEffect` au mount → tracking `banner_seen` (une seule fois par session/tournoi).

## 2. Déclenchement contextuel

Helper `shouldShowTournamentBanner(tournament, userIsClubMember)` dans `src/lib/tournament-conversion.ts` :

- false si user déjà membre d'un club non-personnel (utilise `useAuth().memberships`).
- false si `tournament.status ∈ {draft, cancelled}`.
- true si `tournament.status === 'completed'` OU `tournament.results_count > 0` (au moins un match avec résultat saisi). On lit `tournament_matches` filtré sur le tournoi via une `queryOptions` légère (count `home_score is not null`).
- false si dismissed dans les 30 derniers jours (localStorage check).

Points d'insertion :
- `src/routes/_authenticated/tournaments/$id.tsx` (ou équivalent gestion tournoi) : après la section résultats.
- `src/routes/t.$slug.tsx` (page publique) : visible uniquement si `useAuth().user?.id === tournament.organizer_id`.

## 3. Tracking — table `conversion_events`

Aucun outil analytics n'est intégré (pas de PostHog/Segment trouvé). On crée une table serveur.

Migration :
```sql
CREATE TABLE public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.conversion_events TO authenticated, anon;
GRANT SELECT, ALL ON public.conversion_events TO service_role;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own events" ON public.conversion_events FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "superadmin reads" ON public.conversion_events FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE INDEX ON public.conversion_events (event_name, created_at DESC);
```

Server fn `logConversionEvent` dans `src/lib/conversion-tracking.functions.ts` (POST, pas de auth requise pour permettre `pricing_viewed` anonyme) — input validé Zod : `event_name` enum, `properties` record. Wrapper client `trackConversion(name, props)` dans `src/lib/conversion-tracking.ts`.

Événements câblés :
- `banner_seen` / `banner_clicked` → dans `TournamentToClubBanner`.
- `pricing_viewed` → dans `src/routes/pricing.tsx` `useEffect` si `searchParams.source === 'tournament_conversion'` ou utm_source contient `tournament`.
- `trial_started` → dans le flow de création de club existant (`src/routes/club.create.tsx`) après succès.
- `club_activated` → dans la création du premier event (côté server fn `createEvent` : check si club a 1 event après insert).
- `payment_completed` → dans le webhook Stripe `src/routes/api/public/stripe-webhook.ts` sur `checkout.session.completed` plan club.

## 4. Page /pricing contextualisée

Dans `src/routes/pricing.tsx` :
- Lire `useSearch()`, détecter `source=tournament_conversion` ou utm.
- Si oui : afficher un hero spécial en haut (`t("pricing.tournamentHero.title/subtitle")`), highlight le plan club recommandé (ring primary + badge "Recommandé"), liste de bénéfices clubs sportifs (`pricing.clubBenefits[]`).
- Tracking `pricing_viewed` au mount.

## 5. i18n (FR/EN/DE/ES/IT/NL/PT)

Ajouter dans `src/locales/{lang}/common.json` :
```json
{
  "tournamentToClub": {
    "title": "...",
    "subtitle": "...",
    "ctaPrimary": "...",
    "ctaSecondary": "...",
    "dismiss": "..."
  },
  "pricing": {
    "tournamentHero": { "title": "...", "subtitle": "..." },
    "clubBenefits": ["...", "...", "..."]
  }
}
```

Copies exactes fournies par l'utilisateur pour les 7 langues.

## 6. Email post-tournoi `tournament-completed`

Nouveau template React Email `src/lib/email-templates/tournament-completed.tsx` :
- Props : `tournamentName`, `teamsCount`, `matchesCount`, `winnerName`, `pricingUrl`, `locale`.
- I18n inline via switch sur `locale` (les templates emails existants suivent ce pattern).
- CTA "Passer à l'abonnement club" → `https://clubero.app/pricing?utm_source=tournament_end_email&utm_medium=email&utm_campaign=tournament_conversion&tournament_id=<id>`.

Enregistré dans `src/lib/email-templates/registry.ts`.

Trigger : dans la mutation qui passe un tournoi à `status='completed'` (à identifier dans `src/modules/tournaments/tournaments.functions.ts`), enqueue email via `enqueueTransactionalEmailServer` avec idempotency key `tournament-completed:<id>`.

## 7. Fichiers modifiés / créés

Créés :
- `src/components/tournament-to-club-banner.tsx`
- `src/lib/tournament-conversion.ts`
- `src/lib/conversion-tracking.ts`
- `src/lib/conversion-tracking.functions.ts`
- `src/lib/email-templates/tournament-completed.tsx`
- Migration `conversion_events`

Modifiés :
- `src/routes/pricing.tsx` (hero contextuel + tracking)
- `src/routes/t.$slug.tsx` + page admin tournoi (insertion bannière)
- `src/routes/club.create.tsx` (track trial_started)
- `src/routes/api/public/stripe-webhook.ts` (track payment_completed)
- `src/modules/tournaments/tournaments.functions.ts` (trigger email completed)
- `src/lib/email-templates/registry.ts`
- 7 × `src/locales/{lang}/common.json`

## Hors scope

- Ne touche pas à `convert-personal-club-banner.tsx` (cas distinct : renommer une orga libre en vrai club, garde son flow RPC actuel).
- Pas de dashboard d'analyse des `conversion_events` côté superadmin (table prête, UI plus tard si demandé).

## Questions ouvertes (réponds avant que je build, sinon je prends ces défauts)

1. **Email post-tournoi** : tu confirmes qu'il faut bien envoyer **automatiquement** quand `status` passe à `completed` ? (sinon je le câble seulement sur action manuelle "Clôturer le tournoi"). Défaut = auto.
2. **Bannière sur page publique `/t/$slug`** : la rendre visible uniquement à l'organisateur connecté ? Défaut = oui.
3. **Trial 30 j** : le wording dit "Essayer gratuitement 30 j" — confirme que le plan club a bien un trial 30 j configuré dans Stripe / `subscriptions` (sinon le CTA ment). Défaut = je garde le wording, on assume que le trial existe.
