/**
 * Single source of truth for Clubero feature knowledge, injected into every
 * AI system prompt (marketing chat, member chat, tournament assistant,
 * build-clubero wizard). Keeps gated V2 features ("bientôt disponible")
 * from ever being promised as active by an assistant.
 *
 * Canonical feature list: `docs/beta-v1/feature-inventory.md` (sections 1 & 5).
 *
 * Pure module — no Supabase / server imports — safe to import anywhere.
 */

export type FeatureAudience = "member" | "visitor" | "tournament" | "wizard";

export interface FeatureFlags {
  payments_v2?: boolean;
  fundraising_v2?: boolean;
  social_network_v2?: boolean;
  public_player_profiles?: boolean;
}

export interface BuildFeatureContextOptions {
  lang?: "fr" | "en";
  audience: FeatureAudience;
  flags?: FeatureFlags;
}

export const FEATURE_CONTEXT_FR = `## Connaissance produit Clubero (source unique)

### Coordination & événements
- Calendrier d'événements (match, entraînement, tournoi, réunion) : planifie la vie de l'équipe.
- Convocations avec réponse présent/absent/incertain + motif : fin des allers-retours WhatsApp.
- Partage de convocation sur WhatsApp (mode hybride) : coexiste avec le groupe WhatsApp habituel.
- Relances de convocation automatiques : réduit les non-réponses.
- Déclaration d'absence par un parent → notif automatique du coach : évite l'oubli d'un joueur.
- Disponibilités des joueurs par équipe : facilite la préparation des compositions.
- Chat temps réel par événement + inbox globale : communication centralisée.
- Feuille de match / compositions : prépare le jour J.
- Feedback / suivi joueur par le coach : historique de progression.
- Discipline club (cartons, suspensions) : suivi sportif et réglementaire.
- Défis et tests physiques : gamification et suivi de la condition physique.
- Statistiques (présence, résultats) : pilotage de la saison.
- Covoiturage par événement : un conducteur propose des places (départ, heure, nombre de places), les parents inscrivent leur enfant ou eux-mêmes en un clic, compteur de places restantes, besoins de covoiturage signalés et notifications aux participants.
- Ajout au calendrier (Google Agenda / iCal) depuis la fiche événement : l'événement part dans l'agenda perso.
- Filtres d'événements (équipe, type, statut, convocations envoyées ou non) + badge discret « Convoc envoyée » sur les cartes d'événement et l'accueil.
- Coups de main (besoins bénévoles par événement) : le coach publie un besoin (transport, goûter, arbitrage, matériel...) ciblé sur une audience (équipe, parents, groupe), les membres se portent volontaires en un clic, suivi des candidatures et des places restantes, réouverture possible d'un besoin clôturé.
- Disponibilités & encadrement du staff : les coachs et adjoints déclarent leurs indisponibilités (période + motif optionnel masqué aux non-gestionnaires) ; vue équipe des dispos ; assignation d'un coach à un événement (staff équipe ou renfort du club) avec badge de couverture (🟢 encadrement OK / 🔴 aucun coach dispo), alertes automatiques en cas de conflit et remontée dans le centre d'urgences.
- Sondages du club : publiez un sondage sur le mur (option email en parallèle) ciblé sur une équipe, un groupe, tout le club ou le staff d'une équipe, un seul vote par utilisateur, résultats en direct.
- Réunions (équipe ou interne au club) : créez une réunion rattachée à une équipe réelle OU une "réunion interne" (staff/bureau, sans joueurs). Le sélecteur de convoqués mixe groupes, équipes et ajouts manuels, avec traçabilité de la provenance (groupe / équipe / manuel / organisateur). Les convoqués reçoivent in-app + push + e-mail avec 3 boutons **Présent / Incertain / Absent** en 1 tap depuis l'e-mail (sans connexion). Le retrait d'un participant déclenche une notification dédiée ; retirer un groupe ne retire que ceux qui n'ont plus d'autre source. Les réunions internes ne sont visibles que par les admins/dirigeants du club et les invités.

### Effectif & joueurs
- Fiche joueur (avatar, historique, feedback, sanctions) : carnet de vie sportif.
- Parents et tuteurs légaux liés au joueur : autorité parentale, notifications famille.
- Achievements et timeline joueur : journal sportif.
- Import CSV de joueurs (club et superadmin) : onboarding en masse, dates fiabilisées et catégorie d'âge FFF calculée automatiquement.
- Inscription par QR code / lien d'équipe : le staff génère un QR rattaché à une équipe ; le joueur majeur s'inscrit lui-même, le parent inscrit son enfant (nom, date de naissance, licence, téléphones parent et enfant optionnels). Pour une catégorie adulte (Senior, Vétérans), l'option « J'inscris mon enfant » n'est pas proposée. Le staff de l'équipe est notifié à chaque arrivée pour vérifier la fiche.
- Invitations d'accès plateforme (joueur/parent) envoyées manuellement par le staff, avec statut visible (« Invitation envoyée », « Compte actif », « E-mail non confirmé ») et relance possible.
- Profils publics joueur/coach et listing /players : vitrine publique du joueur/coach.
- Follows inter-clubs (réseau sportif ouvert) : réseau sportif interclubs ouvert.

### Tournois
- Formats multiples : poules + finales, élimination directe, double élimination, système
  Suisse, flights (plusieurs niveaux/trophées) — couvre toutes les compétitions amateurs.
- Inscriptions publiques en ligne + import roster CSV : self-service pour l'organisateur.
- Centre de contrôle Jour J (scores live, bracket, mode TV) : pilotage terrain en temps réel.
- Règlement PDF + page publique partageable : communication du tournoi.
- Co-organisateurs et arbitres invités : délégation de la gestion.
- Organisation libre sans club (club "personnel") : un particulier peut créer un tournoi.
- Paiement d'inscription tournoi et packs payants : disponible (fonctionnalité V2 débloquée).
- Assistant IA tournoi (recommandation de format + questions/réponses) : aide à la config.

### Stages (camps)
- Création et gestion de stages club : organisation simplifiée.
- Inscriptions publiques + upload de justificatifs : self-service pour les familles.
- Suivi de dossier par famille via token (sans compte requis) : accès simple et sécurisé.
- Export CSV des inscriptions : facilite comptabilité et listings.
- Documents requis + purge automatique : conformité RGPD des justificatifs.

### Paiements
- Cotisations, obligations, reçus, relances de paiement : gestion des cotisations de saison.
- Encaissement direct du club (Stripe Connect) : encaissement des paiements directement au club.
- Collectes et cagnottes (fundraising) : financement de projets d'équipe.
- Exemptions de facturation pour cas particuliers : disponible côté administration.
- Facturation de l'abonnement club (SaaS Clubero → club) : disponible.
- Paiement d'inscription tournoi : disponible (voir section Tournois, débloqué en V2).

### Communication
- Mur du club (posts épinglés, @mentions, pièces jointes) : fil d'infos du club.
- Accusés de lecture sur le mur (« Lu par X/Y », détail des lecteurs) et réactions emoji façon WhatsApp sur les posts et les commentaires, en temps réel, avec notification à l'auteur.
- Mur staff d'équipe : espace privé réservé aux éducateurs d'une ou plusieurs équipes (posts et sondages ciblés « staff d'équipe »).
- Docuthèque du club : tous les documents partagés sur le mur regroupés, aperçu intégré (images et PDF), téléchargement, renommage, masquage et suppression par l'auteur ou le staff.
- Groupes du club (bureau, arbitres, bénévoles...) : audiences réutilisables pour le mur, les sondages, les réunions et les besoins.
- Ingestion des réseaux sociaux du club (Facebook) : reprend automatiquement les publications.
- Notifications push web (PWA) par type d'événement : notifications natives sans app store, y compris les messages du chat d'événement (regroupés, fenêtre anti-spam de 5 min, activables par le club).
- Emails transactionnels (allowlist + rate limit) : convocations, invitations, tournois. Expéditeur « Club via Clubero », suivi des envois, motifs d'échec explicites (e-mail en suppression, rebond, non confirmé) et relance possible.
- Partage WhatsApp des convocations : coexiste avec les habitudes existantes des familles.
- Sponsors du club (logos + statistiques d'affichage) : valorisation des partenaires.

### Modération & sécurité des membres
- Signalement de contenu du mur : n'importe quel membre peut signaler un post ou un commentaire (motifs : contenu inapproprié, harcèlement, spam, désinformation, vie privée, autre). Les admins et dirigeants du club sont notifiés immédiatement.
- Signalement des messages du chat d'événement : même parcours, traitement par les modérateurs du club.
- Signalement d'un utilisateur et blocage/masquage (mute) : un membre peut signaler une personne ou masquer ses contenus pour lui-même.
- Onglet Modération dans l'administration du club : file des signalements (en attente, en cours, rejeté, traité), historique des décisions et actions (masquer le contenu, avertir, clore).
- Protection des mineurs : consentement parental (droit à l'image), visibilité restreinte des données des mineurs, consentement « sécurité des enfants » documenté, et contacts des parents visibles pour les joueurs mineurs concernés.


### Administration & branding
- Branding par club (couleur de thème, appliqué aux pages publiques) : identité visuelle.
- Réglages granulaires : notifications, convocations, venues, sponsors, réseaux, rappels.
- Gestion des utilisateurs et des rôles (rôles séparés par table dédiée) : sécurité fine.
- Support intégré (tickets club, échange coach ↔ Clubero) : assistance suivie.
- RGPD complet : export JSON, anonymisation, suppression de compte sur demande.
- Multi-équipes et multi-catégories : gestion de plusieurs groupes en parallèle.
- Gestion des lieux (venues) du club : terrains et salles centralisés.

### Public (non authentifié)
- Pages publiques de tournoi et mode TV (grand écran) : partage facile avec le public.
- Pages publiques de stage, inscription et suivi de dossier par token : accès sans compte.
- Profils publics joueur/coach : vitrine publique consultable sans compte.
- Recovery link joueur et inscription joueur autonome : onboarding simplifié.
- Invitation à un tournoi par lien dédié : intégration rapide des équipes invitées.

### IA
- Assistant chat membre in-app, connecté aux données du club selon les rôles : disponible.
- Assistant chat marketing pour les visiteurs du site : disponible (c'est potentiellement moi).
- Assistant tournoi (recommandation de format + questions/réponses) : disponible.
- Assistant règles de tournoi (extraction depuis un document) : disponible.
- Wizard IA « Construisons Clubero » (feedback conversationnel produit) : disponible.
- Assistant de création de tournoi guidé (wizard IA) : disponible.

### Superadmin & RGPD
- Dashboard superadmin (clubs, utilisateurs, facturation, logs, support, imports) : interne.
- Import de données club en masse : outil réservé au superadmin.
- Flags de fonctionnalités V2 (source unique de vérité) : pilotage des mises en production.
- Serveur MCP (Model Context Protocol) pour les tournois publics : expérimental, limité.
- Vue Support à distance pour l'assistance : outil interne superadmin.
`;

export const FEATURE_CONTEXT_EN = `## Clubero product knowledge (single source of truth)

### Coordination & events
- Event calendar (match, training, tournament, meeting): plans the whole team's life.
- Attendance requests with present/absent/uncertain + reason: ends WhatsApp back-and-forth.
- Share attendance requests on WhatsApp (hybrid mode): coexists with the usual group.
- Automatic reminders for pending responses: reduces no-replies.
- Parent-declared absence → automatic coach notification: prevents a missed player.
- Player availabilities per team: makes lineup preparation easier.
- Real-time chat per event + global inbox: centralised communication.
- Match sheet / lineups: prepares match day.
- Coach feedback / player follow-up: progression history.
- Club discipline (cards, suspensions): sporting and regulatory tracking.
- Physical challenges and tests: gamification and fitness tracking.
- Statistics (attendance, results): season steering.
- Event carpooling: a driver offers seats (pickup, time, seat count), parents sign up their child or themselves in one click, remaining-seat counter, carpool needs flagged and participants notified.
- Add to calendar (Google Calendar / iCal) from the event page: the event lands in the personal calendar.
- Event filters (team, type, status, attendance requests sent or not) + a discreet "Attendance sent" badge on event cards and the home feed.
- Team helpers (volunteer needs per event): the coach publishes a need (transport, snack, refereeing, equipment...) targeted to an audience (team, parents, group), members sign up in one click, applications and remaining slots are tracked, and a closed need can be reopened.
- Staff availabilities & event coverage: coaches and assistant coaches declare unavailabilities (period + optional reason hidden from non-managers); team availability view; assign a coach to an event (team staff or club reinforcement) with a coverage badge (🟢 staff OK / 🔴 no coach available), automatic conflict alerts and surfacing in the urgency centre.
- Club polls: publish a poll on the wall (optional parallel email) targeted at a team, a group, the whole club or a team's staff, one vote per user, live results.
- Meetings (team or club-internal): create a meeting attached to a real team OR an "internal meeting" (staff/board, no players). The attendee picker combines groups, teams and manual additions, with provenance tracking (group / team / manual / organiser). Attendees get in-app + push + email with 3 one-tap **Present / Uncertain / Absent** buttons from the email (no login needed). Removing an attendee triggers a dedicated notification; removing a group only removes people who have no other remaining source. Internal meetings are only visible to club admins/managers and invited attendees.

### Roster & players
- Player profile (avatar, history, feedback, sanctions): a sporting life record.
- Linked parents and legal guardians: parental authority, family notifications.
- Player achievements and timeline: sporting journal.
- CSV player import (club and superadmin): bulk onboarding.
- Public player/coach profiles and /players listing: public showcase for players/coaches.
- Cross-club follows (open sports network): open cross-club sporting network.

### Tournaments
- Multiple formats: pools + finals, single elimination, double elimination, Swiss system,
  flights (multiple divisions/trophies) — covers every amateur competition.
- Public online registration + CSV roster import: self-service for organisers.
- Match-day control centre (live scores, bracket, TV mode): real-time on-field control.
- PDF rulebook + shareable public page: tournament communication.
- Co-organisers and guest referees: delegated management.
- Club-free organisation ("personal" club): anyone can create a tournament.
- Tournament registration payments and paid packs: available (V2 feature unlocked).
- Tournament AI assistant (format recommendation + Q&A): configuration help.

### Camps
- Camp creation and management: simplified club-run camps.
- Public registration + supporting document upload: self-service for families.
- Family follow-up via token (no account needed): simple, secure access.
- CSV export of registrations: eases accounting and listings.
- Required documents + automatic purge: GDPR compliance for documents.

### Payments
- Membership fees, dues, receipts, reminders: season membership fee management.
- Direct club payouts (Stripe Connect): direct payouts to the club's bank account.
- Fundraising campaigns and collections: funding for team projects.
- Billing exemptions for special cases: available in administration.
- Club subscription billing (Clubero → club): available.
- Tournament registration payments: available (see Tournaments, unlocked in V2).

### Communication
- Club wall (pinned posts, @mentions, read receipts, attachments): club news feed.
- Social media ingestion (Facebook): automatically pulls in club posts.
- Web push notifications (PWA) per type: native notifications, no app store.
- Transactional emails (allowlist + rate limit): attendance requests, invites, tournaments.
- WhatsApp sharing of attendance requests: coexists with existing family habits.
- Club sponsors (logos + display stats): partner visibility.

### Administration & branding
- Per-club branding (theme colour, applied to public pages): visual identity.
- Granular settings: notifications, attendance, venues, sponsors, networks, reminders.
- User and role management (roles in a dedicated table): fine-grained security.
- Built-in support (club tickets, coach ↔ Clubero thread): tracked assistance.
- Full GDPR: JSON export, anonymisation, account deletion on request.
- Multi-team and multi-category management: several groups handled in parallel.
- Club venue management: fields and rooms centralised.

### Public (unauthenticated)
- Public tournament pages and TV mode (big screen): easy sharing with the public.
- Public camp pages, registration and token-based follow-up: no account needed.
- Public player/coach profiles: public showcase accessible without an account.
- Player recovery link and self-service player registration: simplified onboarding.
- Tournament invite links: fast onboarding for invited teams.

### AI
- In-app member chat assistant, connected to club data per role: available.
- Marketing chat assistant for site visitors: available (possibly me).
- Tournament assistant (format recommendation + Q&A): available.
- Tournament rules assistant (document extraction): available.
- "Build Clubero" AI wizard (conversational product feedback): available.
- Guided tournament creation wizard (AI): available.

### Superadmin & compliance
- Superadmin dashboard (clubs, users, billing, logs, support, imports): internal.
- Bulk club data import: superadmin-only tool.
- V2 feature flags (single source of truth): controls staged rollouts.
- MCP server (Model Context Protocol) for public tournaments: experimental, limited.
- Remote support view: internal superadmin tool.
`;

// One regex per gated flag, matching every bullet line describing that
// feature in both the FR and EN base texts (multiline, global).
const GATED_LINE_PATTERNS: Record<keyof FeatureFlags, RegExp> = {
  payments_v2:
    /^- (Cotisations, obligations.*|Encaissement direct.*|Membership fees.*|Direct club payouts.*)$/gm,
  fundraising_v2: /^- (Collectes et cagnottes.*|Fundraising campaigns.*)$/gm,
  social_network_v2: /^- (Follows inter-clubs.*|Cross-club follows.*)$/gm,
  public_player_profiles: /^- (Profils publics.*|Public player\/coach profiles.*)$/gm,
};

const RULES_VISITOR_FR = `### Règles transverses (visiteur)
- N'invente jamais de tarif au-delà de ce qui figure sur le site vitrine (/pricing).
- Oriente toujours vers /demo pour démarrer l'onboarding.
- Le canal de retour produit est le wizard "Construisons Clubero" (donnez votre avis).
- Ne présente jamais une fonctionnalité "bientôt disponible" comme active aujourd'hui.`;

const RULES_MEMBER_FR = `### Règles transverses (membre)
- Confirme toujours explicitement avant une action d'écriture (brouillon, relance, etc.).
- Respecte les limites de débit (rate limit) : si atteinte, invite à réessayer plus tard.
- Ne présente jamais une fonctionnalité "bientôt disponible" comme active aujourd'hui.`;

const RULES_VISITOR_EN = `### Cross-cutting rules (visitor)
- Never invent pricing beyond what the marketing site states (/pricing).
- Always route users to /demo to start onboarding.
- The feedback channel is the "Build Clubero" wizard (share your feedback).
- Never present a "coming soon" feature as active today.`;

const RULES_MEMBER_EN = `### Cross-cutting rules (member)
- Always confirm explicitly before any write action (draft, reminder, etc.).
- Respect rate limits: if hit, tell the user to try again later.
- Never present a "coming soon" feature as active today.`;

function applyGating(context: string, flags: Required<FeatureFlags>, lang: "fr" | "en"): string {
  let out = context;
  (Object.keys(flags) as Array<keyof FeatureFlags>).forEach((flag) => {
    if (flags[flag]) return; // ON: leave the full section content as-is.
    const pattern = GATED_LINE_PATTERNS[flag];
    const soon = lang === "en" ? "Coming soon." : "Bientôt disponible.";
    out = out.replace(pattern, (line) => {
      const label = line.replace(/^- /, "").split(/[:：]/)[0];
      return `- ${label}: ${soon}`;
    });
  });
  return out;
}

export function buildFeatureContext(opts: BuildFeatureContextOptions): string {
  const lang = opts.lang ?? "fr";
  const flags: Required<FeatureFlags> = {
    payments_v2: opts.flags?.payments_v2 ?? false,
    fundraising_v2: opts.flags?.fundraising_v2 ?? false,
    social_network_v2: opts.flags?.social_network_v2 ?? false,
    public_player_profiles: opts.flags?.public_player_profiles ?? false,
  };

  const base = lang === "en" ? FEATURE_CONTEXT_EN : FEATURE_CONTEXT_FR;
  let context = applyGating(base, flags, lang);

  if (opts.audience === "visitor") {
    context += `\n${lang === "en" ? RULES_VISITOR_EN : RULES_VISITOR_FR}\n`;
  } else if (opts.audience === "member") {
    context += `\n${lang === "en" ? RULES_MEMBER_EN : RULES_MEMBER_FR}\n`;
  }

  return context;
}
