# Clubero Tournaments

Module standalone (mais intégré) de gestion de tournois sportifs.

## Architecture

```
src/modules/tournaments/
├── lib/              # Logique pure (scheduling, standings, bracket) — testable, réutilisable
├── server/           # Server functions TanStack (createServerFn)
├── components/       # Composants UI dédiés tournois
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
- `/t/$slug` — page publique partageable
- `/t/$slug/tv` — mode TV clubhouse

## Tables (Supabase)
`tournaments`, `tournament_groups`, `tournament_teams`, `tournament_matches`
(voir migration `20260521210113_*`).

## Modèle business (V1)
- **Free** : ≤ 8 équipes, branding Clubero obligatoire
- **Premium** : 40€/tournoi, inclus dans abonnement Clubero Club
