# Phase B — Communications & sondages (Frontend)

Livraison front adossée au backend Phase A v2 (polymorphique). Aucun changement DB / RLS / RPC. Réutilisation stricte : `audience-picker`, `RoleChip`, `PersonRow`, infra e-mail existante.

## Périmètre

### 1. Wizard « Nouvelle publication » (2 étapes)
- Route : `/publications/new` (staff club).
- Étape 1 — Contenu :
  - Type (message | sondage), titre, contenu (markdown léger).
  - Sondage : options (≥2), visibilité (nominatif | anonyme), clôture optionnelle.
  - Pièces jointes (documents club) + médias (upload bucket privé `publication-media`).
  - Événement associé (facultatif) — enclenche audiences `joueurs_convoques` / `parents_convoques`.
- Étape 2 — Audience & diffusion :
  - Réutiliser `audience-picker` avec les 10 types côté Phase A v2 (staff → sujets `user`, joueurs/parents → `player`).
  - Aperçu chiffré via `resolve_publication_audience` (server fn dédiée `previewPublicationAudience`).
  - Mode diffusion : **Mur + push** ou **E-mail uniquement** (radio). Case optionnelle « Envoyer aussi un e-mail » si mur+push.
  - Corps e-mail facultatif.
- Publication → `createPublication` → toast + redirect `/publications/$id`.

### 2. Fil du mur (`/wall`)
- Carte publication (message) : titre, auteur, badges audience résumés, contenu markdown, pièces jointes, médias (grid + lightbox).
- Carte sondage : options cliquables (radio), état « Vous avez voté … », résultats après vote OU si staff, barre + `%` + `n votes`, mention seuil « Pas assez de réponses » si anonyme < 3.
- Actions staff dans menu ⋯ : `Voir destinataires`, `Notifier nouveaux membres` (delta), `Renvoyer à tous` (manual_resend), `Fermer le sondage`, `Modifier`, `Supprimer`.
- Réactions/commentaires : hors scope Phase B (les tables `wall_comments` existent mais on ne les branche pas ici sauf mention).

### 3. Détail publication `/publications/$id`
- Vue plein écran : mêmes composants que la carte + panneau staff « Résultats » (via `getPollResults`) et « Destinataires » (via `listPublicationRecipients`, groupés par sujet_kind).
- Journal minimal des dispatchs (dates + compteurs) pour le staff.

### 4. Diffusion e-mail
- Template React Email `publication-message.tsx` + `publication-poll.tsx` sous `src/lib/email-templates/`.
- E-mail sondage : boutons par option → deep link `/publications/$id?vote=<optionId>` (le vote se fait après login via `castPollVote`, jamais depuis un lien signé).
- Enqueue via l'infra existante (`enqueueTransactionalEmailServer`) dans `publish_publication_atomic` — vérifier que le dispatch snapshot déclenche déjà la queue ; sinon petit worker `publications-dispatch` réutilisant `email_dispatches`.

### 5. Point d'entrée
- Bouton « Nouvelle publication » dans `/wall` (staff) et dans le menu admin.
- Carte « Nouveaux messages / sondages en attente » sur `/home` (compact) : lien vers `/wall`.

### 6. i18n
- FR + EN complets, DE/ES/IT/NL/PT = clones EN + entrées dans `TODO-i18n-pending.md`.
- `bun run check:i18n` doit passer.

### 7. Tests
- Unit : rendu carte sondage seuillé, mapping delta/full, garde ≥2 options côté form.
- Pas de nouvelle suite RLS (couverte Phase A v2).

## Ordre d'exécution
1. Server fns manquantes : `previewPublicationAudience`, `listPublications` (mur), `getPublication` (détail).
2. Wizard + composants partagés (options poll, upload média).
3. Cartes mur (message + sondage) + résultats seuillés.
4. Route détail + actions staff.
5. Templates e-mail + branchement dispatch.
6. Home entry + wall entry point.
7. i18n × 7 + `check:i18n`.
8. Unit tests + `bun run test`.

## Hors scope
- Réactions/commentaires enrichis, notifications push riches (image), stats analytics avancées.
- Modification post-publication : uniquement titre/contenu/pièces jointes (pas l'audience — se fait via `Notifier nouveaux membres`).

Livraison en un seul lot avec compteurs de tests et récap à la fin.
