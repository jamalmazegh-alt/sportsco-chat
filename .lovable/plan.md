
# Compléments moteur tournoi — Plan PR5 → PR9

Suite des PR1-PR4 déjà livrées (règles, validation matchs, événements, PDF règlement). Voici ce qui reste à couvrir.

## État actuel — déjà en place
- ✅ Saisie score organisateur (`MatchesList`)
- ✅ Validation match + statut Provisoire/Validé/Litige (PR3)
- ✅ Auto-scheduling basique (terrains, durée match, pause déjeuner, plages horaires)
- ✅ Page publique `/t/$slug` (équipes, calendrier, classement, bracket)
- ✅ PDF règlement (PR4)
- ✅ Mode "tournoi uniquement" + QR / partage via `ShareDialog`

## Manquant — à livrer

### **PR5 — Statuts spéciaux des matchs**
- Étendre `tournament_matches.status` : ajouter `forfeit_a`, `forfeit_b`, `abandoned`, `cancelled`, `no_show_a`, `no_show_b`
- DB : valeur `forfeit_score` configurable dans `settings.rules` (ex. 3-0 défaut)
- UI dans `MatchesList` : menu "État du match" → boutons rapides Forfait A/B, Abandon, Annulé, Équipe absente
- Standings (`standings.ts`) : prendre en compte ces statuts (équipe absente = défaite forfait, match annulé = ignoré, abandon = score figé au moment de l'abandon ou forfait selon settings)
- Badge visuel dans page publique + admin

### **PR6 — Repos minimum entre 2 matchs d'une même équipe**
- Settings : `minRestMinutes` (défaut 30)
- `scheduling.ts` : lors de la génération auto, garantir l'écart min entre 2 matchs d'une même équipe (pousser au créneau suivant si conflit)
- UI : champ "Repos minimum (min)" dans `GroupsAndFixtures`
- Warning affiché si planning violé manuellement après édition

### **PR7 — Gestion des terrains (UI dédiée)**
- Onglet "Terrains" dans tournament detail (déjà `fields: string[]` en DB)
- CRUD terrains (nom, dispo plages horaires)
- Vue calendrier par terrain (timeline horaire jour par jour) → visualiser occupation
- Drag pour réassigner un match à un autre terrain/horaire (optionnel V1 → édition simple via dropdown sur chaque match)
- Bouton "Recalculer planning" qui réutilise scheduling avec contraintes terrains + repos

### **PR8 — Roster joueurs par équipe + import CSV/XLSX**
- Nouvelle table `tournament_team_players` : `id, team_id, first_name, last_name, jersey_number, position?, birth_date?, license_number?`
- RLS : lecture publique via `can_view_tournament`, écriture via `can_manage_tournament`
- UI dans `TeamsManager` :
  - Bouton "Joueurs" sur chaque équipe → drawer/sheet avec liste + ajout manuel
  - Bouton "Importer CSV" : template téléchargeable (`team,first_name,last_name,jersey_number,position`)
  - Parsing client avec `papaparse` (déjà compatible Worker)
  - Upload XLSX via `xlsx` lib (vérifier compat Worker, sinon CSV only)
- Export feuille de match PDF par équipe (réutilise `pdf-lib`)
- Affichage roster public sur page tournoi (toggle dans settings)

### **PR9 — Process inscription + validation organisateur**
- Nouvelle table `tournament_registrations` : `id, tournament_id, team_name, contact_name, contact_email, contact_phone, category?, status ('pending'|'approved'|'rejected'|'waitlist'), notes, submitted_at, reviewed_at, reviewed_by, rejection_reason?`
- Settings : `registration.enabled`, `registration.opens_at`, `registration.closes_at`, `registration.max_teams`, `registration.requires_approval` (défaut true), `registration.fields_required` (contact, catégorie, etc.)
- Page publique `/t/$slug/register` : formulaire d'inscription (anon ou connecté)
- Server route `/api/public/tournaments/$slug/register` (POST) avec validation Zod + rate-limit basique
- Email de confirmation à l'organisateur via `send.server` (template `tournament-registration.tsx`)
- Onglet "Inscriptions" dans admin : liste, filtres par statut, actions Approuver/Refuser/Liste d'attente
- À l'approbation : création automatique de l'équipe dans `tournament_teams`
- Compteur sur page publique : "X / Y places — inscriptions ouvertes jusqu'au …"

## Découpage techniques transverses

**i18n** : ajouter clés dans `tournament-rules` (ou nouveau namespace `tournament-special`) pour tous les nouveaux états et libellés.

**Migration unique par PR** (préférable à une mega-migration), avec :
- enum étendu pour `match_status`
- nouvelles tables `tournament_team_players` + `tournament_registrations`
- index sur `(tournament_id, status)` pour registrations

**Page publique enrichie** (touchée par PR5/PR8/PR9) :
- Badge "Inscription ouverte" + lien
- Section "Roster" déplible par équipe
- Bouton "Règlement PDF" déjà existant via `tournament_documents`
- QR code généré côté admin (déjà via `ShareDialog`)

**Paiements** : explicitement HORS SCOPE (confirmé par l'utilisateur).

## Ordre de livraison proposé

1. **PR5** (statuts spéciaux) — base la plus impactante pour la cohérence des standings
2. **PR6** (repos min) — petite étoffe, dépend de scheduling existant
3. **PR7** (UI terrains) — autonome
4. **PR8** (roster + CSV) — autonome, gros volet UI
5. **PR9** (inscriptions) — le plus gros, nouvelle table + page publique + emails

Confirme l'ordre, ou indique si tu veux fusionner / réordonner. On part directement sur **PR5** si OK.
