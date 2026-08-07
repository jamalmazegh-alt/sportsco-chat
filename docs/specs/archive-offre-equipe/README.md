# Archive — chantier « Offre Équipe » (abandonné)

> Ces sept documents décrivent un chantier **abandonné** au profit du modèle à crédits
> d'équipes, spécifié dans `docs/specs/offre-credits-equipes.md`.
>
> **Ne pas les utiliser comme base d'implémentation.**

## Pourquoi ce chantier a été abandonné

Le modèle initial prévoyait une souscription Stripe **par équipe**, indépendante de
l'abonnement du club. Un même club pouvait donc avoir des équipes couvertes différemment :
l'une payante, l'autre en essai, une troisième sans couverture.

Cette **couverture partielle** imposait un contrôle d'accès à portée équipe, et par
conséquent la réécriture des policies RLS sur des chemins déjà utilisés en production —
soit 27 policies, une classification de 42 actions métier en quatre catégories, et la
conversion de plusieurs mutations en RPC dédiées.

Le modèle retenu à la place — des crédits d'équipes portés par l'abonnement du club
existant — supprime la couverture partielle : **un club a un abonnement ou n'en a pas**.
Le verrouillage existant, au niveau club, suffit. L'ensemble de ce dispositif devient donc
sans objet.

## Ce qui reste utile

Ces documents conservent une valeur **documentaire sur le code existant**, indépendamment
du chantier :

| Document | Ce qui reste exploitable |
|---|---|
| `inventaire-lecteurs-subscriptions.md` | Cartographie des 39 sites de lecture de `subscriptions` ; constat qu'aucun `.single()` n'existe ; comportement de chaque consommateur face à une ligne absente |
| `inventaire-mutations-directes.md` | Cartographie des 44 fichiers faisant des mutations Supabase directes depuis le client ; découverte que `soft_delete_entity` est un point de passage central couvrant cinq types d'entités |
| `matrice-enforcement-lot5.md` | Classification de 42 actions métier par acteur et par intention — utile si un contrôle d'accès fin devait un jour être introduit |
| `offre-equipe-team-plan.md` §0 | Faits vérifiés sur le dépôt : stack, absence d'Edge Functions, pièges du trigger d'essai, bug `exempt_until`, rate limiter fail-open |
| `IMPLEMENTATION_ORDER.md` | Discipline de déploiement (R1 à R4, contrat de rollback, ajouter avant remplacer) — **toujours applicable**, reprise au §9 de la spécification en vigueur |

## Constats techniques repris dans la spécification en vigueur

- le trigger `auto_create_trial_subscription` donne 14 jours alors que le marketing promet
  30 jours ;
- `club_has_active_subscription` ignore `exempt_until` — bug réel, désormais traité comme
  une dette indépendante ;
- `checkRateLimit` est fail-open, ce qui interdisait de le réutiliser pour un endpoint
  public de recherche de club — point devenu sans objet, la recherche de club étant hors
  périmètre ;
- `team_members` ne possède ni `status`, ni `member_type`, ni `deleted_at` ; une ligne
  joueur s'identifie par `player_id IS NOT NULL`.
