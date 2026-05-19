## Football Lineup Builder ("Composition") — V1

Une nouvelle fonctionnalité réservée au **football** permettant aux coachs de bâtir, sauvegarder et publier une composition visuelle pour un match.

### 1. Où ça vit
- Sur la page d'un événement de type **match** dont l'équipe a `sport = 'football'`.
- Nouvel onglet **« Composition »** (FR) / "Lineup" (EN) à côté des onglets existants (Convocations, Feedback, etc.).
- Masqué si l'événement n'est pas un match ou si le sport n'est pas football.

### 2. Modèle de données
Nouvelle table `event_lineups` (1 ligne par event) :
- `event_id` (unique), `team_id`, `club_id`
- `formation` (texte : '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', 'custom')
- `slots` (jsonb) : tableau `[{ slot_id, role: 'GK'|'DEF'|'MID'|'FWD', x, y, player_id|null }]` — positions en % (0-100) pour responsive
- `bench` (jsonb) : `[player_id...]`
- `captain_player_id`, `gk_player_id` (nullable)
- `visibility` enum : `draft` | `staff` | `selected_players` | `team` (défaut `draft`)
- `published_at` (nullable), `include_in_convocation` (bool)
- `created_by`, timestamps

RLS :
- SELECT : coach/admin de l'équipe toujours ; joueurs/parents seulement si publié + visibilité le permet.
- INSERT/UPDATE/DELETE : coach de l'équipe ou admin du club.

### 3. UI / UX
- **Terrain** : SVG vertical demi-terrain (mobile-first), responsive, fond vert avec lignes. Composant `<PitchBoard>`.
- **Joueurs disponibles** : panneau latéral (desktop) / drawer (mobile) listant le roster de l'équipe. Les joueurs convoqués (statut ≠ "decline") sont mis en avant ; les non-convoqués sont grisés mais utilisables (avec badge "non convoqué").
- **Banc** : zone horizontale scrollable sous le terrain.
- **Drag & drop** : `@dnd-kit/core` (déjà compatible mobile/touch). Drop sur slot pitch, slot banc, ou retour à la liste.
- **Sélecteur de formation** : Select shadcn ; changer de formation réorganise les slots vides en gardant les joueurs déjà placés quand possible (par rôle).
- **Capitaine / GK** : icônes cliquables sur la carte joueur dans le terrain (brassard C, gants GK).
- **Player card** : photo/initiales, numéro, nom court.
- **Actions header** : `Formation`, `Visibilité`, `Enregistrer brouillon`, `Publier`.

### 4. Intégration convocation
- Toggle "Inclure dans la convocation" dans les options de visibilité.
- Quand activé + publié : le template email `convocation-invite` ajoute une section "Composition prévue" (formation + XI + remplaçants en texte). Pas d'image générée en V1.
- Dans l'app, sur la fiche événement côté joueur/parent : affichage de la composition si publiée et visible pour eux.

### 5. Découpage technique
1. Migration SQL : table `event_lineups` + enum visibility + RLS + trigger updated_at.
2. Server fns (`src/lib/lineup.functions.ts`) : `getLineup`, `upsertLineup`, `publishLineup`.
3. Composant `<PitchBoard>` (SVG + dnd-kit) + `<PlayerChip>` + `<FormationSelect>` + `<BenchStrip>` + `<AvailablePlayersList>`.
4. Route/onglet : nouvelle section dans `src/routes/_authenticated/events/$eventId.tsx` (ou sous-route `$eventId/lineup.tsx`) conditionnée à football+match.
5. Patch du template email `convocation-invite` pour la section composition optionnelle.
6. Lecture côté joueur : afficher la composition publiée sur la page event si visible.

### 6. Restrictions V1 (non inclus — volontaire)
- **Section composition dans l'email de convocation** : le toggle `include_in_convocation` est stocké en base mais **pas encore branché** dans le template `convocation-invite`. Comportement cible (V2) :
  - Si `include_in_convocation = true` au moment de l'envoi/renvoi de la convocation **et** qu'une compo est publiée → ajouter la section "Composition prévue" (formation + XI + remplaçants) dans l'email de convocation.
  - Sinon, au moment de **publier** la compo → envoyer un **email séparé** "Composition publiée" aux joueurs convoqués (+ parents).
- **Image PNG générée pour l'email** (rendu visuel du terrain) — texte simple uniquement en V1.
- **Tactiques avancées** : flèches, zones, heatmaps, consignes par joueur.
- Pas de multi-sport (basket/rugby/etc. réutiliseront le modèle plus tard).
- Pas d'historique de compositions par event (1 seule ligne, modifiable).

### Détails techniques
- Dep : `bun add @dnd-kit/core @dnd-kit/sortable` (si pas déjà présents).
- Slots formation prédéfinis en constantes (`src/lib/football-formations.ts`) avec coordonnées % par formation.
- i18n : nouvelles clés sous `lineup.*` (FR + EN).
- Mobile : drag tactile via PointerSensor + TouchSensor.

