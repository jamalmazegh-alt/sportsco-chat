## Objectif

Livrer les 2 sujets restants priorisés :
1. **Module stats & scores** (coach/dirigeant) : stats de présence par joueur, saisie du score final, buteurs + passeurs.
2. **Screenshots features** sur le site vitrine (`/features`) pour illustrer concrètement les modules.

---

## 1. Stats de présence par joueur

**Base de données** : aucune nouvelle table — on agrège la table `convocations` existante (statut `present` / `absent` / `uncertain` / `pending`).

**UI** : nouvelle section dans la page joueur `players/$playerId` + une vue agrégée par équipe dans `teams/$teamId`.

- Cartes : % présent / % absent / % incertain / total convocations
- Filtre par période (saison en cours, 30 derniers jours, tout)
- Filtre par type d'événement (entraînement, match, tous)
- Liste des dernières convocations avec statut

**Visibilité** : coach + admin uniquement (pas les parents/joueurs sur la vue agrégée équipe ; le joueur voit ses propres stats sur sa fiche).

---

## 2. Saisie score + buteurs

**Schéma** :

- `match_results` : `event_id` (unique), `home_score`, `away_score`, `notes`, `recorded_by`
- `event_goals` : `event_id`, `scorer_player_id`, `assist_player_id` (nullable), `minute` (nullable), `kind` (`goal` / `own_goal` / `penalty`), `created_by`

**RLS** :
- Lecture : tout membre pouvant voir l'équipe (`can_view_team`)
- Écriture : coach/admin de l'équipe uniquement (`is_team_coach`)

**UI** : dans `events/$eventId`, pour les événements de type `match` après la date, un bloc "Résultat du match" pour le coach :
- Inputs score domicile / extérieur (orientés selon `is_home`)
- Liste des buteurs : sélecteur joueur (parmi les convoqués `present`), passeur optionnel, minute optionnelle, type (but / csc / penalty)
- Bouton "Enregistrer"

**Affichage public** (parents/joueurs) : carte résultat avec score final + liste des buteurs (lecture seule).

**Stats joueur** : compteurs `buts` / `passes` agrégés depuis `event_goals` sur la fiche joueur.

---

## 3. Screenshots site vitrine

Sur `/features`, ajouter pour chaque pilier (clubs, coachs, parents, joueurs) une capture d'écran illustrative.

**Approche** : générer 4 mockups SVG/PNG stylisés (pas de vraies captures pour éviter les données réelles) qui montrent :
- **Coach** : tableau de présence avec pastilles + bouton "Relancer"
- **Club** : tableau de bord équipes
- **Parent** : convocation reçue avec boutons Présent / Absent / Incertain
- **Joueur** : prochain événement + chat équipe

Génération via `imagegen--generate_image` en quality `premium` (texte lisible) puis import dans `features.tsx`.

---

## Ordre d'exécution

1. Migration DB : `match_results` + `event_goals` + RLS + index
2. Composant "Résultat du match" dans `events/$eventId`
3. Composant "Stats présence" dans `players/$playerId` + bloc équipe sur `teams/$teamId`
4. Génération des 4 screenshots + intégration dans `/features`
5. Traductions FR (clés `stats.*`, `match.score`, `match.scorers`, etc.)

## Points techniques

- Toutes les requêtes via le client browser (RLS protège).
- Pas de server function nécessaire — agrégations faites côté client en mémoire (volumes faibles).
- Les screenshots sont générés en `1280×800` PNG avec fond solide (pas transparent), stockés dans `src/assets/features/`.
