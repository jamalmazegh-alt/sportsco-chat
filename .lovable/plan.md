# Mode nuit page événement

La page `/events/$eventId` (3491 lignes) et son écran lineup utilisent partout `bg-white`, `border-slate-200`, `text-slate-*`, `bg-emerald-50`, etc. en dur. Résultat : en mode nuit, ces sections restent blanches alors que le shell est sombre. Même chose, en plus léger, sur le wizard de création d'événement et quelques composants partagés.

## Approche

Plutôt que de réécrire ~3500 lignes ligne à ligne (risque de régression visuelle énorme sur la version claire qui est jolie), j'applique la **même technique que pour l'assistant tournoi** mais à l'envers : je scope le mode sombre via override des variables CSS sur la racine de la page, et je laisse Tailwind faire le reste pour les sections qui utilisent déjà les tokens sémantiques (`bg-card`, `text-foreground`, etc.).

Pour les sections en dur (`bg-white`, `text-slate-*`), je passe par une **conversion ciblée** en tokens, secteur par secteur, en gardant l'identité visuelle claire intacte côté `:root` et en laissant `.dark` rendre le contraste correct automatiquement.

## Étapes

1. **Inventaire visuel** : passer la page événement avec Playwright en dark mode pour identifier les blocs qui restent blancs (hero share, présences, joueurs convoqués, ma réponse, sections en bas, lineup).

2. **Refactor `events/$eventId.tsx`** :
   - `bg-white` → `bg-card`
   - `border-slate-200` / `border-slate-100` → `border-border`
   - `text-slate-900` → `text-foreground`, `text-slate-600/700` → `text-muted-foreground`
   - `bg-slate-50` → `bg-muted/40`
   - Conserver les sections "gradient hero" qui sont volontairement colorées (vert/bleu) — pas touche.
   - Conserver les badges colorés (`bg-emerald-50`, `bg-rose-50`) sur fond carte mais leur ajouter une variante dark via `dark:bg-emerald-500/10 dark:text-emerald-300` etc. là où le contraste casse.

3. **Refactor `events/$eventId/lineup.tsx`** : même traitement (terrain, pièces du pitch restent colorées, mais les panneaux blancs deviennent `bg-card`).

4. **Composants partagés** repérés (`EventWizard`, `match-result-card`, `score-stepper`, `wizard-primitives`, `pitch-pieces`, `insights-section`, `upcoming-absences-widget`) : remplacer les fonds blancs et bordures slate en dur quand ils sont utilisés dans le flux événement.

5. **Vérification** : Playwright dark + light, screenshots avant/après sur :
   - page événement (haut, milieu présences, joueurs convoqués, ma réponse, lineup)
   - wizard création événement
   - cards home (régression).

## Hors scope

- Page tournois (déjà corrigée).
- Marketing / landing pages.
- Page admin (déjà OK).

## Risque

Le seul vrai risque c'est de casser le rendu clair sur des badges colorés. Je garde les classes claires existantes et n'ajoute que des variantes `dark:` quand nécessaire — pas de remplacement aveugle.

## Estimation

Environ 150-200 remplacements ciblés dans 3 gros fichiers + 4-5 petits composants. Travail mécanique mais long, ~2 passes avec vérif visuelle entre.
