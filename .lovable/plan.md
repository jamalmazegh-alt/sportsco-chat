## Problèmes identifiés

1. **10 onglets en scroll horizontal** — surcharge visuelle, on ne sait plus où trouver quoi.
2. **Doublons** Équipes / Inscriptions / Staff / Membres — frontières floues.
3. **Bouton "S'inscrire" invisible** sur la page publique : l'admin doit aller dans l'onglet **Règles** (caché en fin de scroll) pour cocher `registration.enabled = true`. Personne ne le trouve.

## Nouvelle structure : 3 sections principales

Remplace la barre de 10 onglets par **3 méga-onglets** (Configurer / Gérer / Jouer). À l'intérieur de chaque section, sous-onglets clairs sans doublons.

```
┌─ Configurer ─┬─ Gérer ─┬─ Jouer ─┐
│ (avant)      │ (qui)   │ (jour J)│
└──────────────┴─────────┴─────────┘
```

### Configurer — *one-time setup avant ouverture*
- **Format** (groupes, bracket, poules) — actuel `fixtures`
- **Règles** (durée, points, tiebreakers) — actuel `rules`
- **Terrains** — actuel `fields`
- **Paiements** (frais, mode online/offline) — actuel `payments`
- **Inscriptions — paramètres** *(nouveau)* : extrait du panneau `rules` → toggle `enabled`, dates ouverture/fermeture, max équipes, requiresApproval, collectPlayers, publicMessage. C'est ici (pas dans "Règles") qu'on active l'inscription publique.

### Gérer — *les personnes*
- **Inscriptions** (candidates, validation, paiements) — actuel `registrations`. Si inscription désactivée → CTA direct "Activer les inscriptions" qui ouvre le sous-onglet Configurer › Inscriptions.
- **Équipes** (roster confirmé, logos, groupes) — actuel `teams`
- **Staff & arbitres** *(fusion)* — fusionne `team_staff` (CollaboratorsManager) + `members` (MembersManager) dans un seul écran à 2 sous-tabs internes : "Équipe d'organisation" (admins tournoi) + "Arbitres / bénévoles"

### Jouer — *jour J*
- **Matchs** — actuel `matches`
- **Classement** — actuel `standings`
- **Bracket** — actuel `bracket`
- **Vue Live / TV** *(nouveau lien)* : raccourci vers `/tournament/$slug/tv`

## Correctif "bouton inscription invisible"

Sur la page admin tournoi :
- Si `payment_mode` configuré OU admin sur l'onglet Inscriptions sans `registration.enabled` → bannière jaune **"Les inscriptions sont désactivées. Activer maintenant →"** qui pousse vers Configurer › Inscriptions.
- Sur la page publique : si admin connecté visite la page et registration off → bannière discrète "Inscriptions désactivées — visible uniquement par toi".

Aucun changement au flux RegistrationsManager / API publique : juste rendre l'activation découvrable.

## Implémentation technique

### Fichiers à créer
- `src/modules/tournaments/components/RegistrationSettingsPanel.tsx` — extrait propre du bloc registration de `TournamentRulesEditor.tsx` (lignes ~425-560).
- `src/modules/tournaments/components/StaffAndOfficialsPanel.tsx` — wrapper avec 2 sous-tabs internes regroupant `CollaboratorsManager` + `MembersManager`.

### Fichiers à modifier
- `src/routes/_authenticated/tournaments.$tournamentId.tsx` :
  - Remplacer le `tabs` plat (10 entrées) par une structure groupée `{section: "configure"|"manage"|"play", sub: …}`.
  - Nouveau composant `SectionTabs` (3 boutons larges) + `SubTabs` (pills sous-jacents) au lieu du scroll-horizontal actuel.
  - Garder le composant `TabsNav` existant pour les sous-onglets (déjà bien fait).
  - Routing par `?section=…&sub=…` en query params pour deep-link.
  - Bannière "Inscriptions désactivées" si l'admin est sur sub=registrations et `rules.registration.enabled === false`.
- `src/modules/tournaments/components/TournamentRulesEditor.tsx` : retirer le bloc registration (déplacé), garder règles sportives uniquement.
- `src/locales/{fr,en}/tournaments.json` : nouvelles clés `sections.configure/manage/play` + `tabs.registrationSettings` + `registrations.disabledBanner`.

### Non touché
- API publique `/api/public/tournament-registration` : OK.
- Page publique `/tournament/$slug` : le CTA Register est déjà conditionné correctement sur `registration.enabled` — pas de bug, juste pas activé par défaut.
- Flux paiement, RegistrationsManager, TeamsManager : aucun changement de logique.

## Ce qui reste hors scope
- Pas de refonte visuelle des panneaux internes.
- Pas de changement DB / RLS.
- "Tirage au sort / seeding" mentionné dans la section Gérer existe déjà dans `GroupsAndFixtures` (DrawDialog) — reste sous Configurer › Format pour ne rien casser.
