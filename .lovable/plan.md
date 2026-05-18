# Player Feedback & Development System

Système structuré de retours post-match et de développement long terme pour chaque joueur, avec historique, visibilité contrôlée et synthèse IA.

## 1. Modèle de données

Nouvelles tables :

**`player_feedback`** — un retour par (coach, joueur, optionnellement événement)
- `id`, `club_id`, `team_id`, `player_id`, `event_id` (nullable — feedback hors match possible)
- `author_user_id` (coach)
- `rating` smallint nullable (1–5, optionnel)
- `comment` text (privé)
- `dev_notes` text (notes de développement)
- `strengths` text
- `improvements` text
- `tags` text[] (positioning, mentality, effort, leadership, technical, physical, discipline, teamwork…)
- `visibility` enum `feedback_visibility` : `coach_only` (défaut), `staff`, `share_summary`, `parent_summary`, `player_summary`
- `shared_summary` text nullable (résumé édulcoré exposable selon `visibility`)
- `created_at`, `updated_at`, `deleted_at`

**`player_reviews`** — synthèses générées par IA, archivées
- `id`, `club_id`, `player_id`, `author_user_id`
- `kind` text (`end_of_season`, `meeting`, `development`, `coaching`)
- `period_start`, `period_end` dates (nullable)
- `content` text (markdown)
- `visibility` enum (mêmes valeurs)
- `model` text, `created_at`

Helpers SQL (SECURITY DEFINER) :
- `can_view_player_feedback(_user_id, _feedback_id)` — applique la matrice de visibilité (coach/staff/parent/joueur)
- `can_view_player_review(_user_id, _review_id)`

RLS :
- `player_feedback` :
  - SELECT : `can_view_player_feedback(auth.uid(), id)`
  - INSERT/UPDATE/DELETE : coach/admin du club du joueur uniquement, et `author = auth.uid()` pour UPDATE/DELETE (admin peut tout)
- `player_reviews` : même logique

## 2. Backend / Server functions (`src/lib/player-feedback.functions.ts`)

- `listPlayerFeedback({ playerId })` — timeline filtrée par RLS
- `createPlayerFeedback({ playerId, eventId?, rating?, comment, devNotes?, strengths?, improvements?, tags?, visibility, sharedSummary? })`
- `updatePlayerFeedback({ id, ...patch })`
- `deletePlayerFeedback({ id })` (soft-delete)
- `listEventPlayers({ eventId })` — joueurs convoqués/présents pour la saisie rapide post-match
- `generatePlayerReview({ playerId, kind, periodStart?, periodEnd?, visibility })` :
  - charge feedbacks (privés visibles au coach), convocations/attendance, stats (`event_goals`, `match_results`)
  - appelle Lovable AI Gateway (`google/gemini-3-flash-preview`) avec un prompt cadré « développement, bienveillant, constructif »
  - persiste dans `player_reviews`, retourne contenu
- `listPlayerReviews({ playerId })`

## 3. UI

**Saisie post-match — route `/_authenticated/events/$eventId/feedback`**
- Liste verticale des joueurs convoqués (présents en haut)
- Carte compacte par joueur (mobile-first) : note optionnelle (5 étoiles douces, libellées « Excellent / Bon / OK / À travailler / Difficile » — pas de score chiffré agressif), tags chips multi-select, champs `Commentaire`, `Forces`, `À développer`, sélecteur `Visibilité` (icône cadenas → Coach uniquement par défaut)
- Bouton « Enregistrer » par joueur + raccourci « Tout enregistrer »
- Bouton d'accès depuis la page de l'événement (visible aux coachs uniquement)

**Profil joueur — nouvel onglet `Retours Coach` / `Coach Feedback`**
- Timeline chronologique : date + lien événement, auteur, note (si présente), tags, sections forces / à développer, commentaire (selon visibilité)
- Badges visuels pour visibilité (cadenas privé, œil partagé…)
- Bouton « Générer une synthèse » (coach/admin) → modal : type (fin de saison / réunion / développement / coaching), période, visibilité → affiche la synthèse Markdown, sauvegardée
- Section « Synthèses » sous la timeline listant les `player_reviews`

## 4. Ton & UX

- Vocabulaire développemental : « À développer » et non « Faiblesses », « Difficile » et non « Mauvais »
- Note 1–5 optionnelle, jamais affichée publiquement comme classement
- Aucun classement comparatif entre joueurs
- Confidentialité visible : icône cadenas + libellé partout, par défaut « Coach uniquement »
- Tags pré-définis (i18n FR/EN) avec saisie libre limitée

## 5. Périmètre de cette itération

Inclus :
- Migration tables + RLS + helpers
- Server functions CRUD + génération IA
- UI saisie post-match
- Onglet `Retours Coach` dans le profil joueur (timeline + génération synthèse)
- i18n FR/EN

Préparé pour plus tard (non inclus) :
- Graphiques de progression, comparaisons saisons, PDF, scouting, évaluations entraînement — l'architecture (tags structurés, `kind`, périodes, `rating` numérique optionnel) reste compatible.
