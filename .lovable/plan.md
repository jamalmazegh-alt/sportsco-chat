## Statistiques d'équipe — plan

Nouvel onglet "Statistiques / Statistics" sur la page équipe, qui s'appuie sur les données déjà capturées (matches, scores, buts, présences) et complète avec des stats spécifiques au sport.

### 1. Structure de la page équipe

La page `teams/$teamId` n'a pas encore d'onglets. Je vais introduire un système d'onglets simple en haut :
- **Effectif** (contenu actuel)
- **Statistiques** (nouveau)

Aucune route séparée pour rester sur la même URL ; les filtres seront dans l'état local.

### 2. Source des données

Tout est déjà en base :
- `events` : `type` (match/training/…), `competition_type`, `is_home`, `opponent`, `starts_at`, `status`, `team_id`
- `match_results` : `home_score`, `away_score`, `score_details` (jsonb libre), `notes`
- `event_goals` : `scorer_player_id`, `assist_player_id`, `kind` (`goal`, `yellow_card`, `red_card`, `penalty_scored`, `penalty_missed`, `try`, `conversion`, `rebound`, `assist`, `save`, `ace`, `block`, etc.), `minute`
- `convocations` : présences pour croiser avec les résultats

Le champ `event_goals.kind` étant un `text` libre, j'utilise des constantes par sport et j'étends la saisie post-match pour ces types. **Aucune migration nécessaire** pour la v1.

### 3. KPIs généraux (tous sports)

Affichés en cartes en haut :
- Matchs joués, Victoires, Nuls, Défaites, % victoires
- Marqués / Encaissés / Différence
- Moyennes par match
- Forme sur 5 derniers (V/N/D pills)
- Domicile vs Extérieur (mini-tableau)
- Clean sheets (sports concernés)
- Plus large victoire / défaite
- Dernier match + Prochain match (cartes)

### 4. Filtres

Au-dessus des KPIs :
- Saison (depuis `teams.season` actuel + saisons déduites des dates d'events)
- Compétition (amical / championnat / coupe / tournoi)
- Domicile / Extérieur / Tout
- Plage de dates

Tout est calculé côté client à partir d'un seul fetch (les volumes sont modestes pour une équipe amateur).

### 5. Historique par saison

Onglet secondaire "Saisons" dans la page Stats avec un tableau comparatif (saison → MJ, V, N, D, BP, BC, diff). Une saison = champ texte sur l'équipe + bucket déduit du `starts_at` (juillet→juin).

### 6. Stats spécifiques par sport

Selon `teams.sport`, j'affiche un bloc supplémentaire :
- **Football / Futsal** : top buteurs, top passeurs, cartons J/R, péno réussis/manqués, clean sheets
- **Basketball** : pts/match, rebonds, passes, interceptions, contres, fautes, top scoreurs
- **Rugby** : essais, transfo, péno, cartons, top marqueurs (pts), top essayeurs
- **Handball** : buts, arrêts, exclusions 2', péno, top buteurs
- **Volleyball** : sets gagnés/perdus, aces, blocks, attaques, taux par compétition
- **Hockey sur glace** : buts, passes, pénalités, power play, shutouts, top scoreurs
- **Hockey sur gazon** : buts, passes, clean sheets, corners, cartons, top scoreurs

Chaque ligne s'agrège depuis `event_goals.kind` + jointure joueurs. Les sports sans données ne montrent que la section générale + un état vide explicite ("Activez la saisie détaillée après chaque match pour voir ces statistiques").

### 7. Charts

Composants Recharts (déjà utilisé dans le projet si présent, sinon ajouté) :
- Aire empilée : buts marqués vs encaissés par mois
- Bar chart : résultats par compétition (V/N/D)
- Donut : domicile vs extérieur
- Sparkline forme

### 8. Saisie de match

Le coach a déjà l'écran résultat (`match_results` + `event_goals`). Je l'étends légèrement sur l'écran événement :
- Sélecteur de "type d'événement" par sport pour ajouter cartons, péno, etc. (mappé sur `event_goals.kind`)
- Rien d'obligatoire au-delà du score final

Pas de changement de schéma — uniquement de nouveaux `kind` autorisés côté UI.

### 9. UX

- Mobile-first : cartes empilées, charts responsive
- États vides clairs ("Pas encore de matchs joués cette saison")
- Filtres en sticky header sur mobile
- Le bloc spécifique-sport n'apparaît que si `teams.sport` est défini

### 10. Permissions

Lecture : tous les membres de l'équipe (RLS `events` + `match_results` + `event_goals` déjà OK via `can_view_team`).
Édition de la saisie post-match : déjà restreinte aux coachs.

### 11. Découpage technique

Nouveaux fichiers :
- `src/components/team-stats/index.tsx` (onglet principal + filtres)
- `src/components/team-stats/kpi-cards.tsx`
- `src/components/team-stats/form-strip.tsx`
- `src/components/team-stats/season-history.tsx`
- `src/components/team-stats/sport-blocks/<sport>.tsx` (un par sport)
- `src/lib/team-stats.ts` (agrégations purement client à partir des données fetched)

Modifications :
- `src/routes/_authenticated/teams/$teamId.tsx` : ajout des onglets Effectif / Statistiques
- Extension légère de la saisie post-match pour les `kind` supplémentaires (optionnel, peut être livré dans un 2e tour)

### Livraison en 2 phases recommandée

**Phase 1 (ce tour)** : onglets sur la page équipe + section Statistiques générales (KPIs, filtres, forme, dom/ext, charts, historique par saison, top buteurs/passeurs football qui marche déjà avec les données existantes).

**Phase 2 (prochain tour, si OK)** : blocs sport-par-sport restants + extension de la saisie post-match pour cartons/péno/etc.

Cela permet de livrer quelque chose d'utile immédiatement sans bâcler 7 sports d'un coup. Dis-moi si tu préfères que je tente tout en un seul tour ou que je commence par la Phase 1.
