# Clubero Tournaments

Module standalone (mais intégré) de gestion de tournois sportifs.

## Architecture

```
src/modules/tournaments/
├── lib/              # Logique pure (scheduling, standings, bracket) — testable, réutilisable
├── server/           # Server functions TanStack (createServerFn)
├── components/       # Composants UI dédiés tournois
├── hooks/            # Hooks React (useTournamentOnlyMode)
└── README.md
```

Le module est **isolé** : aucun import depuis le coeur Clubero. Il consomme
uniquement les helpers communs (`@/integrations/supabase/*`, `@/components/ui/*`).
Objectif : pouvoir extraire vers un sous-domaine `tournaments.clubero.app`
ou un produit standalone sans refactor.

## Routes
- `/_authenticated/tournaments` — liste & gestion (admin/dirigeant club)
- `/_authenticated/tournaments/new` — wizard de création
- `/_authenticated/tournaments/$tournamentId` — gestion d'un tournoi
- `/tournament/$slug` — page publique partageable
- `/tournament/$slug/tv` — mode TV clubhouse
- `/tournament/$slug/register` — formulaire d'inscription publique
- `/tournaments/start` — onboarding "pass tournoi" (achat unitaire)
- `/tournaments/pass-success` — retour Stripe après achat de pass

## Tables (Supabase)
`tournaments`, `tournament_groups`, `tournament_teams`, `tournament_matches`,
`tournament_match_events`, `tournament_registrations`, `tournament_passes`,
`tournament_collaborators`.

## Modèle business (V1)
- **Free** : ≤ 8 équipes, branding Clubero obligatoire
- **Premium** : pass unitaire (`STRIPE_PRICE_TOURNAMENT`), ou inclus dans abonnement Clubero Club

## Secrets requis
- `STRIPE_PRICE_TOURNAMENT` — ID du prix Stripe pour le pass tournoi unitaire
  (consommé par `passes.functions.ts` → `createPassCheckoutSession`).

## i18n
Le module utilise le namespace `tournaments` (`src/locales/{fr,en}/tournaments.json`).
Toujours wrapper les composants avec `const { t } = useTranslation("tournaments")`.
