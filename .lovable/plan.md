## Objectif

Finir la localisation du corps de `players/$playerId.tsx`, `teams.tsx` et `teams/$teamId.tsx`. Tous trois ont déjà leur `head()` + `useTranslation()` — il reste 5 strings FR hardcodés et 6 `defaultValue:` inline à migrer proprement dans `common.json`.

## Changements

### 1. `src/locales/fr/common.json` + `src/locales/en/common.json`

Ajouter les clés sémantiques (FR + EN), en parité :

- `teams.emptyHintAdmin` — "Crée ta première équipe pour commencer à programmer entraînements et matchs."
- `teams.emptyHintMember` — "Tu n'es membre d'aucune équipe pour le moment. Demande à un admin de t'ajouter."
- `teams.whatsappGroupLink` — "WhatsApp — lien du groupe d'équipe"
- `teams.communicationMode` — "Mode de communication"
- `teams.commMode.app` — "Clubero uniquement (suivi des présences dans l'app)"
- `teams.commMode.hybrid` — "Hybride (WhatsApp + suivi des présences dans Clubero)"
- `teams.commMode.whatsapp` — "WhatsApp uniquement (pas de suivi de présence)"
- `teams.coachDetachConfirm` — "Retirer ce coach de l'équipe ?"
- `players.removed` — "Joueur retiré de l'équipe"
- `players.childAccessNeedsEmail` — "Ajoutez d'abord un email à l'enfant pour activer l'accès."
- `players.minorMediaConsentRequired` — "Joueur mineur : le consentement parental à l'image est requis avant tout upload. Statut actuel : "

### 2. `src/routes/_authenticated/teams/$teamId.tsx`

- L.506 → `<Label>{t("teams.whatsappGroupLink")}</Label>`
- L.518 → `<Label>{t("teams.communicationMode")}</Label>`
- L.522-524 → `{t("teams.commMode.app|hybrid|whatsapp")}`
- L.331 / L.1039 → retirer `defaultValue:`, garder juste `t("players.removed")` / `t("teams.coachDetachConfirm")`

### 3. `src/routes/_authenticated/teams.tsx`

- L.201-202 → retirer les `defaultValue:` inline (les valeurs sont désormais dans le JSON)

### 4. `src/routes/_authenticated/players/$playerId.tsx`

- L.279 → retirer `defaultValue:` inline (`players.childAccessNeedsEmail`)
- L.465 → retirer `defaultValue:` inline (`players.minorMediaConsentRequired`)

### 5. Validation

- `node scripts/check-i18n-parity.mjs` doit passer
- Pas d'autre changement (UI / business logic intacts)

## Hors périmètre

- Placeholders exemples (`"U13"`, `"FFF-2025-12345"`, `"GK / DF / MF / FW"`) — restent codés, ce sont des formats illustratifs
- Composants externes (`event-form-sheet`, etc.) — autre lot
