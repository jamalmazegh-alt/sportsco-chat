
-- =========================================================================
-- CLUBERO — Bilingual legal content v2 (and v1 for new kinds)
-- =========================================================================

INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md) VALUES

-- ============================ TERMS — EN ============================
('terms', 2, 'en', true, 'Terms of Service',
$md$# Clubero — Terms of Service

_Last updated: 14 May 2026_

Welcome to **Clubero** ("Clubero", "we", "our", "us"), a SaaS platform operated by **CLUBERO OÜ** (under incorporation in Estonia). These Terms of Service ("Terms") govern your access to and use of the Clubero web and mobile applications, websites and related services (collectively, the "Service").

By creating an account or using the Service, you agree to these Terms.

## 1. Platform overview

Clubero helps sports clubs, coaches, parents and players to manage teams, communicate, organise events, handle registrations and payments, share documents and receive notifications.

## 2. Account creation

- You must provide accurate information when creating an account.
- You are responsible for keeping your login credentials confidential.
- You must be at least **16 years old** to create an account on your own. Minors under 16 may only use Clubero through an account created and supervised by a holder of parental authority (see §4 and the Parental Consent page).

## 3. User roles

The Service supports several roles: **club administrator**, **coach / staff**, **parent / legal guardian**, **player** and **platform administrator**. Each role has distinct permissions defined inside the Service. You agree to use the Service only within the scope of the role granted to you.

## 4. Minors

A minor player can only be added by a holder of parental authority who provides the required parental consents (see the Parental Consent page). The parent is the primary recipient of notifications concerning the child. A child only obtains their own login if the parent explicitly opts in.

## 5. Acceptable use

You agree not to:

- upload illegal, hateful, harassing, defamatory or sexually explicit content;
- collect or share personal data of other users without their consent;
- attempt to disrupt, reverse-engineer, scrape or attack the Service;
- impersonate another person or club;
- use the Service to send unsolicited commercial messages.

We may remove content or suspend accounts that violate these rules.

## 6. Payments

Some features (registrations, event payments, fundraising) may involve payments processed by **Stripe**. Stripe is the payment processor; Clubero never stores your full card data. Refunds, chargebacks and tax handling are governed by the relevant club's policy and applicable law. Service fees, when charged, are displayed before payment.

## 7. Service availability

We aim for high availability but do not guarantee that the Service will be uninterrupted or error-free. We may perform maintenance, deploy updates or change features at any time.

## 8. Suspension and termination

We may suspend or terminate access to the Service if you breach these Terms, if required by law, or to protect users. You may delete your account at any time from **Profile → Privacy** (see also §10 of the Privacy Policy).

## 9. Limitation of liability

To the fullest extent permitted by law, Clubero is not liable for indirect, incidental or consequential damages, loss of data, loss of profit or loss of opportunity. Our total liability for any claim is limited to the amounts you paid us for the Service in the 12 months preceding the claim.

## 10. Intellectual property

Clubero, its logos and software are protected by intellectual property law. You retain ownership of content you upload, and grant Clubero a limited licence to host and display it as needed to operate the Service.

## 11. Governing law

These Terms are governed by the laws of **Estonia**. Disputes are subject to the exclusive jurisdiction of the competent courts of Estonia, without prejudice to mandatory consumer protection rules in your country of residence.

## 12. Modifications

We may update these Terms. Material changes will be notified in-app and by email at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.

## 13. Contact

Questions about these Terms: **legal@clubero.app**.
$md$),

-- ============================ TERMS — FR ============================
('terms', 2, 'fr', true, 'Conditions Générales d''Utilisation',
$md$# Clubero — Conditions Générales d''Utilisation

_Dernière mise à jour : 14 mai 2026_

Bienvenue sur **Clubero** (« Clubero », « nous »), plateforme SaaS éditée par **CLUBERO OÜ** (en cours d''immatriculation en Estonie). Les présentes Conditions Générales d''Utilisation (« CGU ») régissent l''accès et l''utilisation des applications web et mobiles Clubero, des sites associés et des services liés (le « Service »).

En créant un compte ou en utilisant le Service, vous acceptez les présentes CGU.

## 1. Présentation de la plateforme

Clubero aide les clubs sportifs, entraîneurs, parents et joueurs à gérer leurs équipes, communiquer, organiser des événements, gérer les inscriptions et paiements, partager des documents et recevoir des notifications.

## 2. Création de compte

- Vous devez fournir des informations exactes lors de la création de votre compte.
- Vous êtes responsable de la confidentialité de vos identifiants.
- Vous devez avoir au moins **16 ans** pour créer un compte vous-même. Les mineurs de moins de 16 ans ne peuvent utiliser Clubero que via un compte créé et supervisé par un titulaire de l''autorité parentale (voir §4 et la page Consentement parental).

## 3. Rôles utilisateurs

Le Service propose plusieurs rôles : **administrateur de club**, **entraîneur / staff**, **parent / représentant légal**, **joueur** et **administrateur de la plateforme**. Chaque rôle dispose de permissions définies dans le Service. Vous vous engagez à utiliser le Service dans la limite des droits accordés à votre rôle.

## 4. Mineurs

Un joueur mineur ne peut être ajouté que par un titulaire de l''autorité parentale qui fournit les consentements parentaux requis (voir la page Consentement parental). Le parent est le destinataire prioritaire des notifications concernant l''enfant. L''enfant n''obtient un accès personnel que si le parent y consent expressément.

## 5. Usage acceptable

Vous vous engagez à ne pas :

- publier de contenu illégal, haineux, harcelant, diffamatoire ou à caractère sexuel ;
- collecter ou diffuser les données personnelles d''autres utilisateurs sans leur consentement ;
- perturber, désassembler, scraper ou attaquer le Service ;
- usurper l''identité d''une personne ou d''un club ;
- utiliser le Service pour envoyer des messages commerciaux non sollicités.

Tout contenu ou compte contrevenant à ces règles peut être retiré ou suspendu.

## 6. Paiements

Certaines fonctionnalités (inscriptions, paiements d''événements, collectes) peuvent impliquer des paiements traités par **Stripe**. Stripe est le prestataire de paiement ; Clubero ne stocke jamais vos données bancaires complètes. Les remboursements, contestations et obligations fiscales relèvent de la politique du club concerné et du droit applicable. Les frais de service, le cas échéant, sont affichés avant paiement.

## 7. Disponibilité du Service

Nous visons une haute disponibilité mais ne garantissons pas un Service ininterrompu ou exempt d''erreurs. Nous pouvons effectuer des opérations de maintenance, déployer des mises à jour ou modifier des fonctionnalités à tout moment.

## 8. Suspension et résiliation

Nous pouvons suspendre ou résilier l''accès au Service en cas de manquement aux CGU, d''obligation légale ou pour protéger les utilisateurs. Vous pouvez supprimer votre compte à tout moment depuis **Profil → Confidentialité** (voir aussi §10 de la Politique de Confidentialité).

## 9. Limitation de responsabilité

Dans la mesure permise par la loi, Clubero ne saurait être tenu responsable des dommages indirects, accessoires ou consécutifs, ni des pertes de données, de profit ou d''opportunité. Notre responsabilité totale pour toute réclamation est limitée aux sommes que vous nous avez versées au titre du Service au cours des 12 mois précédents.

## 10. Propriété intellectuelle

Clubero, ses logos et son logiciel sont protégés par le droit de la propriété intellectuelle. Vous restez propriétaire des contenus que vous publiez et accordez à Clubero une licence limitée pour les héberger et les afficher dans le cadre du Service.

## 11. Droit applicable

Les présentes CGU sont régies par le droit **estonien**. Tout litige relève de la compétence exclusive des tribunaux compétents d''Estonie, sans préjudice des règles impératives de protection du consommateur de votre pays de résidence.

## 12. Modifications

Nous pouvons modifier les CGU. Les changements substantiels sont notifiés dans l''application et par e-mail au moins 14 jours avant leur entrée en vigueur. La poursuite de l''utilisation après cette date vaut acceptation.

## 13. Contact

Questions relatives aux CGU : **legal@clubero.app**.
$md$),

-- ============================ PRIVACY — EN ============================
('privacy', 2, 'en', true, 'Privacy Policy',
$md$# Clubero — Privacy Policy

_Last updated: 14 May 2026_

Clubero is operated by **CLUBERO OÜ** (under incorporation in Estonia), the data controller for personal data processed through the Service. This Privacy Policy describes the data we collect, why, and your rights under the **EU General Data Protection Regulation (GDPR)**.

## 1. Data we collect

- **Account data**: name, email, phone, password (hashed), avatar, locale, role.
- **Player data**: first/last name, birth date, jersey number, position, photo (with consent), team(s).
- **Parent–child links**: relationship between parent and minor player.
- **Club & team data**: membership, role inside a club, team assignments.
- **Operational data**: events, attendance, registrations, lineups, messages, attachments.
- **Payment metadata**: amounts, status, references — full card data is handled by **Stripe**, never stored by us.
- **Technical data**: IP address, user-agent, device info, log entries (security and debugging).

We do **not** collect biometrics, medical data or behavioural scoring, and we do **not** profile minors using AI.

## 2. Purposes of processing

| Purpose | Lawful basis |
|---|---|
| Provide and operate the Service | Contract (Art. 6.1.b) |
| Manage minors' accounts | Parental consent (Art. 6.1.a + Art. 8) |
| Send transactional emails / push | Contract / consent (Art. 6.1.b / Art. 6.1.a) |
| Process payments via Stripe | Contract |
| Security, fraud prevention, audit | Legal obligation, legitimate interest |
| Meet legal obligations | Legal obligation (Art. 6.1.c) |

## 3. GDPR principles we follow

Lawfulness, fairness and transparency · purpose limitation · data minimisation · accuracy · storage limitation · integrity and confidentiality · accountability.

## 4. Minors and parental consent

A user is treated as a **minor** when their birth date resolves to age **< 16** (configurable per locale; FR = 15). Minor accounts require parental consent recorded in our system. Parents can withdraw consent at any time from **Profile → Privacy** or from the player''s profile. See the dedicated **Parental Consent** page.

## 5. Data retention

| Data | Retention |
|---|---|
| Active account data | Lifetime of account + 30 days after deletion request |
| Player roster (after departure) | 1 sport season for stats |
| Messages and attachments | 24 months |
| Audit logs | 12 months |
| Consent records | 5 years after withdrawal |
| Payment records | As required by tax / accounting law |

## 6. Your rights

Under GDPR you can exercise:

- **Access** (Art. 15) – download your data from **Profile → Privacy → Download my data**.
- **Rectification** (Art. 16) – edit your profile or your child''s profile.
- **Erasure** (Art. 17) – request account deletion (30-day grace period, then anonymisation).
- **Restriction / objection** (Art. 18 / 21) – withdraw consents.
- **Portability** (Art. 20) – exports are JSON.
- **Complaint** – contact your national data protection authority (CNIL in France).

## 7. Data deletion and export

- **Export**: a JSON archive of your data and your minor children''s data is generated on demand.
- **Deletion**: requests are scheduled with a 30-day grace period, then your personal identifiers are replaced with anonymous markers and content unlinked from your identity. Aggregated club statistics may be retained.

## 8. Cookies and analytics

We use a minimal set of cookies and local storage strictly necessary for authentication, security and remembering your preferences. We do **not** use advertising trackers or third-party advertising cookies. Any future analytics will be privacy-preserving and disclosed here.

## 9. Sub-processors

We rely on a limited number of trusted sub-processors to operate the Service: **Supabase / database & auth hosting** (EU region), **Stripe** (payments), **email and SMS providers** (notifications), **cloud hosting** (Cloudflare). The current list is available on request at **privacy@clubero.app**.

## 10. International transfers

Data is stored in the **European Union**. Where a sub-processor processes data outside the EU, transfers are protected by Standard Contractual Clauses or equivalent safeguards.

## 11. Security

Encryption in transit (TLS), encryption at rest, role-based access control, audit logging and least-privilege keys. Despite our best efforts, no service is 100% secure; report any vulnerability to **security@clubero.app**.

## 12. Reporting abuse

To report abusive content, harassment or a security concern: **abuse@clubero.app**. We respond within 5 business days.

## 13. Contact

Privacy requests: **privacy@clubero.app**.
$md$),

-- ============================ PRIVACY — FR ============================
('privacy', 2, 'fr', true, 'Politique de Confidentialité',
$md$# Clubero — Politique de Confidentialité

_Dernière mise à jour : 14 mai 2026_

Clubero est édité par **CLUBERO OÜ** (en cours d''immatriculation en Estonie), responsable de traitement des données personnelles traitées via le Service. La présente Politique de Confidentialité décrit les données collectées, leur finalité et vos droits au titre du **Règlement Général sur la Protection des Données (RGPD)**.

## 1. Données collectées

- **Données de compte** : nom, e-mail, téléphone, mot de passe (haché), avatar, langue, rôle.
- **Données joueur** : prénom, nom, date de naissance, numéro de maillot, poste, photo (avec consentement), équipe(s).
- **Liens parent–enfant** : relation entre parent et joueur mineur.
- **Données club et équipe** : affiliation, rôle dans le club, affectations d''équipe.
- **Données opérationnelles** : événements, présences, inscriptions, compositions, messages, pièces jointes.
- **Métadonnées de paiement** : montants, statut, références — les données bancaires complètes sont gérées par **Stripe**, jamais stockées par nous.
- **Données techniques** : adresse IP, user-agent, informations d''appareil, logs (sécurité et débogage).

Nous **ne collectons pas** de biométrie, de données médicales ou de scores comportementaux, et nous **ne profilons pas** les mineurs par IA.

## 2. Finalités du traitement

| Finalité | Base légale |
|---|---|
| Fournir et exploiter le Service | Contrat (art. 6.1.b) |
| Gérer les comptes mineurs | Consentement parental (art. 6.1.a + art. 8) |
| Envoyer e-mails et notifications | Contrat / consentement |
| Traiter les paiements via Stripe | Contrat |
| Sécurité, prévention de la fraude, audit | Obligation légale, intérêt légitime |
| Respecter les obligations légales | Obligation légale (art. 6.1.c) |

## 3. Principes RGPD respectés

Licéité, loyauté et transparence · limitation des finalités · minimisation · exactitude · limitation de la conservation · intégrité et confidentialité · responsabilité.

## 4. Mineurs et consentement parental

Un utilisateur est considéré comme **mineur** lorsque sa date de naissance correspond à un âge **< 16 ans** (configurable selon la langue ; FR = 15). Les comptes mineurs nécessitent un consentement parental enregistré dans notre système. Les parents peuvent retirer leur consentement à tout moment depuis **Profil → Confidentialité** ou depuis la fiche du joueur. Voir la page dédiée **Consentement parental**.

## 5. Durées de conservation

| Donnée | Durée |
|---|---|
| Compte actif | Durée du compte + 30 jours après demande de suppression |
| Joueurs partis | 1 saison sportive pour les statistiques |
| Messages et pièces jointes | 24 mois |
| Journaux d''audit | 12 mois |
| Preuves de consentement | 5 ans après retrait |
| Données de paiement | Selon obligations fiscales et comptables |

## 6. Vos droits

Au titre du RGPD vous disposez des droits :

- **D''accès** (art. 15) — téléchargez vos données depuis **Profil → Confidentialité → Télécharger mes données**.
- **De rectification** (art. 16) — modifiez votre profil ou celui de votre enfant.
- **D''effacement** (art. 17) — demandez la suppression de votre compte (délai de grâce de 30 jours puis anonymisation).
- **De limitation / d''opposition** (art. 18 / 21) — retirez vos consentements.
- **À la portabilité** (art. 20) — export au format JSON.
- **De réclamation** — auprès de votre autorité de protection des données (CNIL en France).

## 7. Suppression et export des données

- **Export** : une archive JSON de vos données et de celles de vos enfants mineurs est générée à la demande.
- **Suppression** : les demandes sont programmées avec un délai de grâce de 30 jours, puis vos identifiants personnels sont remplacés par des marqueurs anonymes et les contenus dissociés de votre identité. Des statistiques de club agrégées peuvent être conservées.

## 8. Cookies et analytique

Nous utilisons un nombre minimal de cookies et de stockage local strictement nécessaires à l''authentification, à la sécurité et à la mémorisation de vos préférences. Nous **n''utilisons pas** de traceurs publicitaires ni de cookies tiers publicitaires. Toute future mesure d''audience sera respectueuse de la vie privée et documentée ici.

## 9. Sous-traitants

Nous nous appuyons sur un nombre limité de sous-traitants de confiance : **Supabase / hébergement base de données et authentification** (région UE), **Stripe** (paiements), **fournisseurs e-mail et SMS** (notifications), **hébergement cloud** (Cloudflare). La liste à jour est disponible sur demande à **privacy@clubero.app**.

## 10. Transferts internationaux

Les données sont stockées dans l''**Union européenne**. Lorsqu''un sous-traitant traite des données hors UE, les transferts sont encadrés par des Clauses Contractuelles Types ou des garanties équivalentes.

## 11. Sécurité

Chiffrement en transit (TLS), chiffrement au repos, contrôle d''accès basé sur les rôles, journalisation d''audit et clés à privilèges minimaux. Malgré nos efforts, aucun service n''est 100 % sûr ; signalez toute vulnérabilité à **security@clubero.app**.

## 12. Signaler un abus

Pour signaler un contenu abusif, du harcèlement ou un problème de sécurité : **abuse@clubero.app**. Nous répondons sous 5 jours ouvrés.

## 13. Contact

Demandes relatives à la confidentialité : **privacy@clubero.app**.
$md$),

-- ===================== DATA PROCESSING — EN =====================
('data_processing', 2, 'en', true, 'Data Processing Agreement',
$md$# Clubero — Data Processing

_Last updated: 14 May 2026_

This document supplements the Privacy Policy and describes how Clubero processes personal data on behalf of clubs and users.

## 1. Roles

- **CLUBERO OÜ** is **data controller** for account, authentication, billing and platform-level data.
- For club-specific operational data (rosters, events, messages), Clubero acts as **data processor** for the club, which is the controller of that data.

## 2. Categories of data

Identification, contact, role, attendance, communications, attachments, payment metadata. No biometrics, no medical data, no minor profiling.

## 3. Sub-processors

See §9 of the Privacy Policy. Clubs are notified of new sub-processors and may object on legitimate grounds.

## 4. Security measures

Encryption in transit and at rest, role-based access control, audit logs, least-privilege service keys, separation of test and production environments, regular dependency updates.

## 5. Data subject requests

Clubero assists clubs in answering data subject requests (access, rectification, erasure, portability) within the legal timeframes.

## 6. Breach notification

Clubero notifies affected clubs and users without undue delay and within 72 hours of becoming aware of a personal data breach, in accordance with Art. 33 GDPR.

## 7. End of processing

Upon termination, club data is deleted or returned within 30 days, except where retention is required by law.
$md$),

-- ===================== DATA PROCESSING — FR =====================
('data_processing', 2, 'fr', true, 'Traitement des Données',
$md$# Clubero — Traitement des Données

_Dernière mise à jour : 14 mai 2026_

Le présent document complète la Politique de Confidentialité et décrit la manière dont Clubero traite les données personnelles pour le compte des clubs et des utilisateurs.

## 1. Rôles

- **CLUBERO OÜ** est **responsable de traitement** pour les données de compte, d''authentification, de facturation et de plateforme.
- Pour les données opérationnelles propres à un club (effectifs, événements, messages), Clubero agit en qualité de **sous-traitant** pour le club, qui est le responsable de ces données.

## 2. Catégories de données

Identification, contact, rôle, présence, communications, pièces jointes, métadonnées de paiement. Aucune donnée biométrique, aucune donnée médicale, aucun profilage de mineur.

## 3. Sous-traitants ultérieurs

Voir §9 de la Politique de Confidentialité. Les clubs sont informés de tout nouveau sous-traitant et peuvent s''y opposer pour motif légitime.

## 4. Mesures de sécurité

Chiffrement en transit et au repos, contrôle d''accès basé sur les rôles, journaux d''audit, clés de service à privilèges minimaux, séparation des environnements de test et de production, mises à jour régulières des dépendances.

## 5. Demandes des personnes concernées

Clubero assiste les clubs pour répondre aux demandes des personnes concernées (accès, rectification, effacement, portabilité) dans les délais légaux.

## 6. Notification de violation

Clubero notifie les clubs et utilisateurs concernés sans délai indu et dans les 72 heures de la prise de connaissance d''une violation de données personnelles, conformément à l''art. 33 du RGPD.

## 7. Fin du traitement

À la résiliation, les données du club sont supprimées ou restituées sous 30 jours, sauf obligation légale de conservation.
$md$),

-- ============================ MEDIA — EN ============================
('media', 2, 'en', false, 'Photo & Media Consent',
$md$# Clubero — Photo & Media Consent

_Last updated: 14 May 2026_

Clubero may display photos and short videos of players inside the Service (team rosters, event galleries, club wall).

## 1. Default behaviour

By default, photos of **minor** players are **not displayed** until parental media consent is granted. Adult players control their own media consent.

## 2. What you consent to

- displaying the player''s photo on club, team and event pages visible to authenticated members of the player''s club;
- displaying the player''s photo or short video clip in event recaps and the club wall.

## 3. What you do **not** consent to

- public publication outside Clubero (social networks, websites) without a separate consent;
- commercial use, advertising or sale of images;
- facial recognition, biometric processing or AI training.

## 4. Withdrawing consent

You can withdraw media consent at any time from **Profile → Privacy** (for yourself) or from the **player''s profile** (for your child). Existing photos will be hidden within 24 hours.

## 5. Group photos

Group photos may incidentally include other players who have not granted consent. Clubs are responsible for handling these cases (cropping, blurring or removal on request).
$md$),

-- ============================ MEDIA — FR ============================
('media', 2, 'fr', false, 'Consentement Photos et Médias',
$md$# Clubero — Consentement Photos et Médias

_Dernière mise à jour : 14 mai 2026_

Clubero peut afficher des photos et de courtes vidéos des joueurs dans le Service (effectifs d''équipe, galeries d''événements, mur du club).

## 1. Comportement par défaut

Par défaut, les photos des joueurs **mineurs** **ne sont pas affichées** tant que le consentement parental aux médias n''a pas été accordé. Les joueurs majeurs contrôlent leur propre consentement.

## 2. Ce à quoi vous consentez

- afficher la photo du joueur sur les pages de club, d''équipe et d''événement visibles par les membres authentifiés du club ;
- afficher la photo ou un court extrait vidéo du joueur dans les comptes rendus d''événement et le mur du club.

## 3. Ce à quoi vous **ne consentez pas**

- la publication publique en dehors de Clubero (réseaux sociaux, sites web) sans un consentement distinct ;
- toute utilisation commerciale, publicitaire ou la vente d''images ;
- la reconnaissance faciale, le traitement biométrique ou l''entraînement d''IA.

## 4. Retrait du consentement

Vous pouvez retirer ce consentement à tout moment depuis **Profil → Confidentialité** (pour vous-même) ou depuis la **fiche du joueur** (pour votre enfant). Les photos existantes seront masquées dans les 24 heures.

## 5. Photos de groupe

Les photos de groupe peuvent inclure incidemment d''autres joueurs n''ayant pas donné leur consentement. Les clubs sont responsables du traitement de ces situations (recadrage, floutage ou retrait sur demande).
$md$),

-- ===================== NOTIFICATIONS — EN =====================
('notifications', 2, 'en', false, 'Notifications Consent',
$md$# Clubero — Notifications

_Last updated: 14 May 2026_

We send three categories of messages.

## 1. Transactional (always sent)

Account creation, password reset, invitations, security alerts, payment receipts. These are necessary to operate the Service and cannot be opted out of without closing your account.

## 2. Operational (consent recommended)

Convocations, training updates, event reminders, attendance requests, club announcements. You can disable these per channel (email, push, SMS) from **Profile → Notifications**.

## 3. Optional (opt-in)

Newsletters, product updates from Clubero. Off by default.

## 4. Channels

Email, in-app, push, SMS. SMS is used sparingly (e.g. last-minute changes) and respects local quiet hours.

## 5. Children

A minor child does not receive notifications by default. Parents can opt in to forward notifications to the child if they hold a personal account.
$md$),

-- ===================== NOTIFICATIONS — FR =====================
('notifications', 2, 'fr', false, 'Consentement aux Notifications',
$md$# Clubero — Notifications

_Dernière mise à jour : 14 mai 2026_

Nous envoyons trois catégories de messages.

## 1. Transactionnels (toujours envoyés)

Création de compte, réinitialisation de mot de passe, invitations, alertes de sécurité, reçus de paiement. Ces messages sont nécessaires au fonctionnement du Service et ne peuvent être désactivés sans clôturer le compte.

## 2. Opérationnels (consentement recommandé)

Convocations, mises à jour d''entraînement, rappels d''événement, demandes de présence, annonces du club. Vous pouvez les désactiver par canal (e-mail, push, SMS) depuis **Profil → Notifications**.

## 3. Optionnels (opt-in)

Newsletters, actualités produit Clubero. Désactivés par défaut.

## 4. Canaux

E-mail, in-app, push, SMS. Le SMS est utilisé avec parcimonie (par ex. changements de dernière minute) et respecte les plages horaires locales de tranquillité.

## 5. Enfants

Un enfant mineur ne reçoit aucune notification par défaut. Les parents peuvent choisir de transférer les notifications vers l''enfant si celui-ci dispose d''un compte personnel.
$md$),

-- ===================== PARENTAL CONSENT — EN =====================
('parental_consent', 1, 'en', false, 'Parental Consent',
$md$# Clubero — Parental Consent

_Last updated: 14 May 2026_

This page explains the consents a holder of parental authority gives when adding a minor child to Clubero. It complements the Privacy Policy and the Media Consent page.

## 1. Who can give parental consent

Only a holder of **parental authority** (parent or legal guardian) may consent on behalf of a minor. By providing consent, you confirm you have the legal capacity to do so for the child concerned.

## 2. What you authorise

- Creating a player profile for your child (first/last name, birth date, jersey number, position, team).
- Sharing this profile with the staff of the child''s club (administrator, coach) and other parents/players of the same team, strictly for sport organisation purposes.
- Receiving operational notifications (convocations, schedule changes, registrations, payments) on behalf of the child.

## 3. Photo and media consent

Displaying the child''s photo and short videos on club, team and event pages requires a **separate, optional** consent. You can grant or refuse it at any time from the player''s profile. See the **Photo & Media Consent** page.

## 4. Account access for the child

The child does **not** receive a personal login by default. You may, at your discretion, authorise the creation of an account in the child''s name. In that case the child receives a sign-in email and the parent remains the primary recipient of important communications.

## 5. Withdrawing consent

You can withdraw your consent at any time from **Profile → Privacy** or from the player''s profile. Withdrawal stops further processing for the relevant purpose and may lead to the removal of the child from team activities organised through Clubero.

## 6. Role of legal guardians

Where parental authority is shared, both parents may manage the child''s profile. In case of disagreement, Clubero will rely on the registered parent who created the account, without prejudice to court decisions you may provide.

## 7. Contact

For any question concerning a minor''s data: **privacy@clubero.app**.
$md$),

-- ===================== PARENTAL CONSENT — FR =====================
('parental_consent', 1, 'fr', false, 'Consentement Parental',
$md$# Clubero — Consentement Parental

_Dernière mise à jour : 14 mai 2026_

Cette page décrit les consentements donnés par un titulaire de l''autorité parentale lors de l''ajout d''un enfant mineur sur Clubero. Elle complète la Politique de Confidentialité et la page Consentement Photos et Médias.

## 1. Qui peut donner le consentement parental

Seul un titulaire de l''**autorité parentale** (parent ou représentant légal) peut consentir au nom d''un mineur. En donnant votre consentement, vous confirmez disposer de la capacité juridique de le faire pour l''enfant concerné.

## 2. Ce que vous autorisez

- La création d''une fiche joueur pour votre enfant (prénom, nom, date de naissance, numéro de maillot, poste, équipe).
- Le partage de cette fiche avec le staff du club de l''enfant (administrateur, entraîneur) et les autres parents/joueurs de la même équipe, à des fins strictes d''organisation sportive.
- La réception des notifications opérationnelles (convocations, changements de planning, inscriptions, paiements) au nom de l''enfant.

## 3. Consentement photos et médias

L''affichage de la photo et de courtes vidéos de l''enfant sur les pages de club, d''équipe et d''événement requiert un consentement **distinct et optionnel**. Vous pouvez l''accorder ou le refuser à tout moment depuis la fiche du joueur. Voir la page **Consentement Photos et Médias**.

## 4. Accès du compte pour l''enfant

L''enfant ne reçoit **pas** d''identifiants personnels par défaut. Vous pouvez, à votre discrétion, autoriser la création d''un compte au nom de l''enfant. Dans ce cas l''enfant reçoit un e-mail de connexion et le parent reste destinataire prioritaire des communications importantes.

## 5. Retrait du consentement

Vous pouvez retirer votre consentement à tout moment depuis **Profil → Confidentialité** ou depuis la fiche du joueur. Le retrait met fin au traitement correspondant et peut conduire au retrait de l''enfant des activités d''équipe organisées via Clubero.

## 6. Rôle des représentants légaux

Lorsque l''autorité parentale est partagée, les deux parents peuvent gérer la fiche de l''enfant. En cas de désaccord, Clubero s''en tient au parent inscrit ayant créé le compte, sans préjudice de toute décision de justice que vous pourriez fournir.

## 7. Contact

Pour toute question concernant les données d''un mineur : **privacy@clubero.app**.
$md$),

-- ===================== LEGAL NOTICE — EN =====================
('legal_notice', 1, 'en', false, 'Legal Notice',
$md$# Clubero — Legal Notice

_Last updated: 14 May 2026_

## Publisher

**CLUBERO OÜ** — currently under incorporation in Estonia.

- Company name: CLUBERO OÜ
- Registration number: _to be completed once issued by the Estonian Business Register_
- Registered office: _to be completed_
- Contact: **hello@clubero.app**
- Legal contact: **legal@clubero.app**
- Privacy contact: **privacy@clubero.app**

## Publication director

The publication director is the legal representative of CLUBERO OÜ.

## Hosting provider

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, USA — application hosting (Workers / edge runtime).
- **Supabase** (Supabase Inc.) — EU region — database, authentication and storage backend.

## Intellectual property

The Service, its source code, design and brand identity (including the name and logo "Clubero") are the exclusive property of CLUBERO OÜ. Any reproduction, representation or reuse without prior written authorisation is prohibited.

## Reporting abuse and content takedown

Reports of illegal or abusive content can be sent to **abuse@clubero.app**. Please include a description of the content, URL and reason for the report.

## Mediation

For consumer disputes, the European Commission''s Online Dispute Resolution platform is available at <https://ec.europa.eu/consumers/odr>.
$md$),

-- ===================== LEGAL NOTICE — FR =====================
('legal_notice', 1, 'fr', false, 'Mentions Légales',
$md$# Clubero — Mentions Légales

_Dernière mise à jour : 14 mai 2026_

## Éditeur

**CLUBERO OÜ** — société en cours d''immatriculation en Estonie.

- Dénomination : CLUBERO OÜ
- Numéro d''immatriculation : _à compléter dès délivrance par le Registre estonien des entreprises_
- Siège social : _à compléter_
- Contact : **hello@clubero.app**
- Contact légal : **legal@clubero.app**
- Contact protection des données : **privacy@clubero.app**

## Directeur de la publication

Le directeur de la publication est le représentant légal de CLUBERO OÜ.

## Hébergement

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, USA — hébergement applicatif (Workers / edge runtime).
- **Supabase** (Supabase Inc.) — région UE — base de données, authentification et stockage.

## Propriété intellectuelle

Le Service, son code source, son design et son identité de marque (notamment le nom et le logo « Clubero ») sont la propriété exclusive de CLUBERO OÜ. Toute reproduction, représentation ou réutilisation sans autorisation écrite préalable est interdite.

## Signalement d''abus et retrait de contenu

Les signalements de contenus illicites ou abusifs peuvent être adressés à **abuse@clubero.app**. Merci d''indiquer la description du contenu, l''URL et le motif du signalement.

## Médiation

Pour les litiges de consommation, la plateforme européenne de résolution des litiges en ligne est disponible à l''adresse <https://ec.europa.eu/consumers/odr>.
$md$);
