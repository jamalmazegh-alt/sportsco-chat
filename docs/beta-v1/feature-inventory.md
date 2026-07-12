# Clubero — Inventaire des features livrées (V1 beta)

> Généré par audit croisé code ↔ `docs/beta-v1/feature-matrix.md` ↔ `src/locales/fr/marketing.json` ↔ prompts IA.
> À valider avant mise à jour du site vitrine et des assistants IA.

## Corrections connues (par rapport à l'audit brut)

- **Covoiturage** : bien présent (`carpools`, `carpool_needs`, `carpool_passengers` en DB, E2E `tests/e2e/17-carpool.e2e.ts`, memory `prompt_covoiturage_v1.md`). L'audit initial l'avait manqué.
- **Défis/Challenges** : présent (`challenges` table + policies + `src/locales/*/challenges.json` + E2E). Probablement rendu dans une page /défis ou intégré à la fiche joueur/équipe — à confirmer côté route.
- **Facebook wall ingestion** : listé matrice, réellement branché via `club_social_connections` + `settings.social.tsx`.

## 1. Modules & features (livrées)

### Coordination & événements
| Feature | Valeur | Statut | Evidence |
|---|---|---|---|
| Calendrier événements (match/entraînement/tournoi/réunion) | Planifie la vie de l'équipe | shipped | `_authenticated/events.tsx`, `events/$eventId.tsx` |
| Convocations présent/absent/incertain + motif | Fin des allers-retours WhatsApp | shipped | `lib/convocation-notify.functions.ts`, table `convocations` |
| Relances de convocation | Réduit les non-réponses | shipped | `lib/convocation-reminder.functions.ts` |
| Déclaration d'absence parent → notif coach | Évite l'oubli d'un joueur | shipped | `lib/absence-notify.functions.ts` |
| Disponibilités joueur par équipe | Facilite les compos | shipped | `teams/$teamId.availability.tsx`, table `player_availabilities` |
| Chat temps réel par événement + inbox globale | Communication centralisée | shipped | `inbox.tsx`, table `event_messages` |
| Feuille de match / compositions | Prépare le jour J | shipped | `lib/match-sheet/`, table `event_lineups` |
| Feedback / suivi joueur (coach) | Historique de progression | shipped | `lib/player-feedback.functions.ts`, table `player_feedback` |
| Discipline club (cartons, suspensions) | Suivi sportif & réglementaire | shipped | `club.discipline.tsx`, tables `player_suspensions`, `permission_changes_log` |
| Défis & tests physiques | Gamification, suivi condition | shipped | table `challenges`, `challenge_results`, `challenge_passages` |
| Statistiques (présence, résultats) | Pilotage saison | shipped | `stats.tsx`, `teams/$teamId.stats.tsx` |
| Covoiturage événement | Logistique parents | shipped | tables `carpools`, `carpool_needs`, `carpool_passengers` |

### Effectif & joueurs
| Feature | Valeur | Statut | Evidence |
|---|---|---|---|
| Fiche joueur (avatar, historique, feedback, sanctions) | Carnet de vie sportif | shipped | `players/$playerId.tsx` |
| Player_parents & guardians | Autorité parentale, notif famille | shipped | tables `player_parents`, `player_guardians` |
| Achievements & timeline joueur | Journal sportif | shipped | `player_achievements`, `player_timeline_events` |
| Import CSV joueurs (superadmin + club) | Onboarding en masse | shipped | `lib/superadmin-import/` |
| Profils publics `/p/:slug`, `/coach/:slug`, `/players` | Vitrine joueur | **partial (V2 gated)** | `config/features.ts` `public_player_profiles=false` |
| Follows inter-clubs | Réseau sportif ouvert | **partial (V2 gated)** | `follow-ups.tsx`, `following.tsx`, flag `social_network_v2` |

### Tournois
| Feature | Valeur | Statut | Evidence |
|---|---|---|---|
| Multi-formats (poules+finales, élim, double élim, Suisse, flights) | Toutes les compétitions amateurs | shipped | `modules/tournaments/lib/{formats,flights,double-elim,swiss}.ts` |
| Inscriptions publiques + roster CSV | Self-service orga | shipped | `api/public/tournament-registration.ts`, `tournament-roster.ts` |
| Centre de contrôle Jour J (scores live, bracket, TV) | Pilotage terrain temps réel | shipped | `modules/tournaments/lib/control-center.ts`, `t.$slug.tv.tsx` |
| Règlement PDF, page publique partageable | Communication tournoi | shipped | `modules/tournaments/lib/rules-pdf.ts`, `t.$slug.tsx` |
| Co-organisateurs & arbitres invités | Délégation | shipped | table `tournament_collaborators`, `tournament_members` |
| Multi-clubs / orga libre (club "personnel") | Un particulier peut créer un tournoi | shipped | memory core, RPC `convert_personal_club_to_real` |
| Paiement d'inscription tournoi & packs | Monétisation orga | **shipped V2** | `t.$slug.pay.$registrationId.tsx`, `tournament-payments.server.ts`, `tournaments.pass-success.tsx` |
| Assistant IA tournoi (reco format, Q&A) | Aide à la config | shipped | `lib/llm/tournament-assistant.functions.ts` |

### Stages (camps)
| Feature | Valeur | Statut | Evidence |
|---|---|---|---|
| Création/gestion stages | Organisation de stages club | shipped | `admin/camps.*.tsx` |
| Inscriptions publiques + upload justificatifs | Self-service familles | shipped | `api/public/submit-camp-registration.ts`, `camp-track-upload.ts` |
| Suivi dossier par famille (token) | Aucun compte requis | shipped | `stages.$clubSlug.$campSlug.suivi.$token.tsx` |
| Export CSV inscriptions | Import compta / listing | shipped | `lib/camp-registrations-csv.ts` |
| Documents requis + purge auto | RGPD des justificatifs | shipped | tables `club_camp_required_documents`, `club_camp_document_purge_log` |

### Paiements
| Feature | Valeur | Statut | Evidence |
|---|---|---|---|
| Cotisations, obligations, reçus, relances | Gestion cotisation saison | **partial (V2 gated)** | `payments.tsx`, `payments.family.tsx`, flag `payments_v2` |
| Stripe Connect club | Encaissement direct au club | **partial (V2 gated)** | `lib/stripe-connect.functions.ts` |
| Webhooks Stripe + cron relance | Serveur prêt | shipped (backend) | `api/webhooks/stripe.ts`, `payment_reminder_log` |
| Cagnottes / collectes | Financement projet équipe | **partial (V2 gated)** | tables `fundraising_campaigns`, `fundraising_contributions`, flag `fundraising_v2` |
| Exemptions de facturation | Cas particuliers | shipped | `lib/billing-exemption.functions.ts` |
| Billing abonnement club (SaaS) | Facturation Clubero → club | shipped | `admin/billing.tsx`, `lib/billing.functions.ts` |

### Communication
| Feature | Valeur | Statut | Evidence |
|---|---|---|---|
| Mur du club (posts, épinglés, @mentions, lu/non-lu, PJ) | Fil d'infos club | shipped | tables `wall_posts`, `wall_comments`, `wall_post_reads` |
| Ingestion réseaux sociaux (Facebook) | Reprend les publications du club | shipped | `admin/settings.social.tsx`, `club_social_connections` |
| Notifications push web (PWA) par type | Notifs natives sans app store | shipped | `lib/push-*.server.ts`, tables `push_subscriptions`, `push_dispatch_log` |
| Emails transactionnels (allowlist + rate limit) | Convocations, invites, tournois | shipped | `routes/lovable/email/*`, `email_send_log`, memory core |
| WhatsApp partage convocation (mode hybride) | Coexiste avec WhatsApp | shipped | `lib/whatsapp.ts` |
| Sponsors club (logos + stats) | Valorisation partenaires | shipped | `admin/settings.sponsors.tsx`, tables `sponsors`, `sponsor_stats_daily` |

### Administration club
| Feature | Statut | Evidence |
|---|---|---|
| Branding (thème couleur par club, applique aux pages publiques) | shipped | memory core "Branding par club", `admin/settings.branding.tsx` |
| Réglages : notifications, convocations, venues, sponsors, paiements, réseaux, rappels, communications | shipped | `admin/settings.*.tsx` |
| Gestion utilisateurs & rôles (user_roles séparé) | shipped | memory core, `admin/users.*.tsx` |
| Support (tickets club, thread coach ↔ Clubero) | shipped | `support.tsx`, `support.$ticketId.tsx` |
| RGPD : export JSON, anonymisation, suppression compte | shipped | `lib/privacy.functions.ts`, `privacy-worker.server.ts`, `account_deletion_requests` |
| Multi-équipes / multi-catégories | shipped | tables `teams`, `team_members`, `team_championships` |
| Venues club | shipped | `admin/settings.venues.tsx`, table `club_venues` |

### Public (non authentifié)
| Feature | Statut | Evidence |
|---|---|---|
| Pages publiques tournoi (`/t/:slug`), TV (`/t/:slug/tv`) | shipped | routes |
| Pages publiques stage + inscription + suivi par token | shipped | routes `stages.*` |
| Profils publics (joueur, coach) | **partial (V2 gated)** | flag |
| Marketing site (7 langues) | shipped | `src/routes/features.tsx`, `pricing.tsx`, `faq.tsx`, `contact.tsx`, `demo.tsx` |
| Waitlist V2 | shipped | `api/public/waitlist.ts`, `waitlist_interest` |
| Recovery link joueur (`/r/:token`) | shipped | `r.$token.tsx` |
| Inscription joueur autonome (`/register/player`) | shipped | `register_.player.tsx` |
| Tournament invite (`/tournament-invite/:token`) | shipped | routes |

### IA
| Feature | Statut | Evidence |
|---|---|---|
| Chat assistant membre (in-app, tools Supabase) | shipped | `api/chat.ts` |
| Chat marketing visiteur | shipped | `api/public/marketing-chat.ts` |
| Assistant tournoi (reco format + Q&A) | shipped | `lib/llm/tournament-assistant.functions.ts` |
| Assistant règles de tournoi (rules extraction) | shipped | `lib/llm/tournament-rules.functions.ts` |
| Wizard IA build-clubero (feedback conversationnel produit) | shipped | `api/public/build-clubero/*`, `src/locales/*/buildClubero.json` |
| Assistant création tournoi (wizard IA) | shipped | `tournaments.start.tsx`, `modules/tournaments/lib/assistant-config.ts` |

### Superadmin & conformité
| Feature | Statut | Evidence |
|---|---|---|
| Dashboard superadmin (clubs, users, billing, logs, support, imports) | shipped | `routes/superadmin/*` |
| Import de données club en masse | shipped | `lib/superadmin-import/` |
| Flags V2 (source unique TS + table SQL `app_flags`) | shipped | `config/features.ts`, memory |
| MCP server (Model Context Protocol, tournois publics) | experimental (2 tools) | `lib/mcp/`, `routes/[.mcp]/*` |
| Vue Support view (assistance à distance) | shipped | `support-view.$sessionId.tsx`, table `support_view_sessions` |

## 2. Écarts vs `docs/beta-v1/feature-matrix.md`

**Volontairement gated V2 (cohérent) :** paiements, cagnottes, réseau social ouvert, profils publics, follows.

**Absent de la matrice, mais bien livré (à documenter) :**
- build-clubero (wizard feedback conversationnel)
- Sponsors club + stats
- Discipline club (suspensions)
- Défis / tests physiques
- Feedback coach → joueur
- Support tickets (club + superadmin)
- RGPD complet (export, anonymisation, purge camps)
- Disponibilités joueur par équipe
- Branding par club
- Ingestion Facebook au mur
- MCP server (surface API externe)
- Support view (assistance à distance)

## 3. Écarts vs site vitrine (à corriger)

**Fuites de features gated V2 sur le site public :**
- Prompt `marketing-chat.ts` : vante Stripe Connect, HelloAsso, cagnottes — **inaccessibles en V2**. À conditionner par `isV2Server()`.
- Home / features : la tuile "network" existe en i18n (`marketing.json.home.tile_network_*`). À vérifier qu'elle est bien masquée en V2.

**Features livrées non mises en avant côté vitrine :**
- Disponibilités joueur, discipline, défis physiques, sponsors, covoiturage, ingestion Facebook, feedback coach, RGPD (export + anonymisation), branding par club, multi-équipes/catégories, tournois payants (V2 débloqué), pages publiques stage, wizard IA de création de tournoi.

## 4. Assistants IA — état & manques

| Prompt | Fichier | Manques identifiés |
|---|---|---|
| Marketing visiteur | `api/public/marketing-chat.ts` | Doit retirer/gate les mentions Paiements/HelloAsso/Cagnottes en V2. Manque : sponsors, discipline, MCP, build-clubero, disponibilités par équipe, covoiturage, défis, RGPD complet. |
| Assistant membre in-app | `api/chat.ts` | Manque : sponsors, discipline, dispos par équipe, covoiturage, défis, support, RGPD, branding. |
| Assistant tournoi (reco + Q&A) | `lib/llm/tournament-assistant.functions.ts` | Manque : mention flights, double élim, Swiss, options fair-play, terrains multiples, pass payants. |
| Wizard IA création tournoi | `modules/tournaments/lib/assistant-config.ts` + i18n `tournaments.json` | Vérifier alignement avec les derniers formats & paiements. |
| Wizard feedback build-clubero | `api/public/build-clubero/*` + i18n `buildClubero.json` | À ajuster pour que les questions posées reflètent les modules réellement livrés. |
| Rules extractor | `lib/llm/tournament-rules.functions.ts` | Bornée à son domaine, pas de changement nécessaire. |

## 5. Squelette proposé pour `src/lib/llm/feature-context.ts`

Une seule string exportée `FEATURE_CONTEXT` (~120 lignes markdown), injectée en fin de tous les system prompts, plus un helper `buildFeatureContext(flags)` qui filtre dynamiquement les sections gated (`payments_v2`, `fundraising_v2`, `social_network_v2`, `public_player_profiles`).

Sections :
1. Coordination & événements
2. Effectif & joueurs
3. Tournois (avec sous-liste formats)
4. Stages
5. Paiements & billing (conditionnel V2)
6. Communication (mur, push, email, WhatsApp, sponsors, Facebook)
7. Administration & branding
8. Public / partage
9. IA embarquée
10. Conformité & RGPD
11. Rôles & permissions
12. Règles transverses assistant (jamais promettre une feature gated, toujours confirmer avant écriture, respecter rate limit)

## Points à arbitrer (avant Phase 2)

1. **Paiements V2** : le flag `payments_v2` est-il toujours OFF pour tous les clubs beta ? Dois-je :
   - (a) retirer complètement Paiements/HelloAsso/Cagnottes du site vitrine et des prompts, ou
   - (b) les garder avec mention "bientôt", ou
   - (c) les injecter conditionnellement selon `isV2Server()` côté chat marketing ?
2. **Tournois payants** : à confirmer, c'est débloqué et vendable côté marketing ?
3. **build-clubero** : on le met en avant sur le site vitrine (CTA "Donne ton avis") ou on le garde interne / accès footer ?
4. **Profils publics + follows** : on annonce "bientôt V2" ou on n'en parle pas du tout ?
5. **MCP** : on le mentionne (audience développeur / intégrateurs) ou on l'ignore côté vitrine ?
