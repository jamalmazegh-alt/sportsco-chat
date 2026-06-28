-- =====================================================================
-- Legal documents refresh — Clubero OÜ post-incorporation
-- =====================================================================
-- Materialises the consent_versions content previously applied directly
-- to production on 2026-06-28. Idempotent: ON CONFLICT (kind, version,
-- locale) DO UPDATE refreshes content if rerun.
--
-- ROLLBACK
-- --------
-- DELETE FROM public.consent_versions WHERE
--   (kind='legal_notice' AND version=2) OR
--   (kind='terms'        AND version=3) OR
--   (kind='privacy'      AND version=3);
-- (v1 legal_notice rewrite is intentionally not rolled back — its
--  original text contained legally invalid placeholders.)
-- =====================================================================

-- 1) legal_notice v2 EN
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('legal_notice', 2, 'en', false, 'Legal Notice',
$body$# Clubero — Legal Notice

_Last updated: 28 June 2026_

## Publisher

**Clubero OÜ** — Estonian private limited company (Osaühing / OÜ).

- Legal name: Clubero OÜ
- Registration number (registrikood): **17538695**
- Registered office: Sepapaja tn 6, 15551 Tallinn, Estonia
- Incorporation date: 25 June 2026
- VAT: **VAT not applicable**
- Activity: Software Publishing (NACE 58.29)
- Contact: **hello@clubero.app**
- Website: <https://clubero.app>

All correspondence (legal, privacy, security, abuse) is handled via **hello@clubero.app**.

## Publication director

The publication director is the legal representative of Clubero OÜ.

## Hosting and infrastructure

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, USA — application hosting (Workers / edge runtime).
- **Supabase** (Supabase Inc.) — EU region — database, authentication and storage backend.
- **Lovable** (Lovable AB) — `lovable.cloud` build/preview platform and **Lovable AI Gateway** used to route AI features.

## Intellectual property

The Service, its source code, design and brand identity (including the name and logo "Clubero") are the exclusive property of Clubero OÜ. Any reproduction, representation or reuse without prior written authorisation is prohibited.

## Reporting abuse and content takedown

Reports of illegal or abusive content can be sent to **hello@clubero.app**. Please include a description of the content, URL and reason for the report.

## Mediation

For consumer disputes, the European Commission's Online Dispute Resolution platform is available at <https://ec.europa.eu/consumers/odr>.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, published_at=now(), required=EXCLUDED.required;

-- 2) legal_notice v2 FR
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('legal_notice', 2, 'fr', false, 'Mentions Légales',
$body$# Clubero — Mentions Légales

_Dernière mise à jour : 28 juin 2026_

## Éditeur

**Clubero OÜ** — société à responsabilité limitée de droit estonien (Osaühing / OÜ).

- Dénomination : Clubero OÜ
- Numéro d'immatriculation (registrikood) : **17538695**
- Siège social : Sepapaja tn 6, 15551 Tallinn, Estonie
- Date d'immatriculation : 25 juin 2026
- TVA : **TVA non applicable**
- Activité : Édition de logiciels (NACE 58.29)
- Contact : **hello@clubero.app**
- Site : <https://clubero.app>

Toutes les correspondances (légal, vie privée, sécurité, abus) sont traitées via **hello@clubero.app**.

## Directeur de la publication

Le directeur de la publication est le représentant légal de Clubero OÜ.

## Hébergement et infrastructure

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, USA — hébergement applicatif (Workers / edge runtime).
- **Supabase** (Supabase Inc.) — région UE — base de données, authentification et stockage.
- **Lovable** (Lovable AB) — plateforme de build/preview `lovable.cloud` et **Lovable AI Gateway** pour le routage des fonctionnalités d'IA.

## Propriété intellectuelle

Le Service, son code source, son design et son identité de marque (notamment le nom et le logo « Clubero ») sont la propriété exclusive de Clubero OÜ. Toute reproduction, représentation ou réutilisation sans autorisation écrite préalable est interdite.

## Signalement d'abus et retrait de contenu

Les signalements de contenus illicites ou abusifs peuvent être adressés à **hello@clubero.app**. Merci d'indiquer la description du contenu, l'URL et le motif du signalement.

## Médiation

Pour les litiges de consommation, la plateforme européenne de résolution des litiges en ligne est disponible à l'adresse <https://ec.europa.eu/consumers/odr>.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, published_at=now(), required=EXCLUDED.required;

-- 3) terms v3 EN
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('terms', 3, 'en', true, 'Terms of Service',
$body$# Clubero — Terms of Service

_Last updated: 28 June 2026_

Welcome to **Clubero** ("Clubero", "we", "our", "us"), a SaaS platform operated by **Clubero OÜ**, an Estonian private limited company (registrikood **17538695**), registered office Sepapaja tn 6, 15551 Tallinn, Estonia. VAT not applicable. These Terms of Service ("Terms") govern your access to and use of the Clubero web and mobile applications, websites and related services (collectively, the "Service").

By creating an account or using the Service, you agree to these Terms.

## 1. Platform overview

Clubero helps sports clubs, coaches, parents and players to manage teams, communicate, organise events, handle registrations and payments, share documents and receive notifications.

## 2. Account creation

- You must provide accurate information when creating an account.
- You are responsible for keeping your login credentials confidential.
- You must be at least **16 years old** to create an account on your own (or the lower digital-consent age set by your country — see Privacy Policy §4). Younger minors may only use Clubero through an account created and supervised by a holder of parental authority (see §4 and the Parental Consent page).

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

Some features (registrations, event payments, fundraising) may involve payments processed by **Stripe**. Stripe is the payment processor; Clubero never stores your full card data. Refunds, chargebacks and tax handling are governed by the relevant club's policy and applicable law. Service fees, when charged, are displayed before payment. Clubero OÜ is currently not registered for VAT; invoices are issued without VAT ("VAT not applicable").

## 7. Service availability

We aim for high availability but do not guarantee that the Service will be uninterrupted or error-free. We may perform maintenance, deploy updates or change features at any time.

## 8. Suspension and termination

We may suspend or terminate access to the Service if you breach these Terms, if required by law, or to protect users. You may delete your account at any time from **Profile → Privacy** (see also §10 of the Privacy Policy).

## 9. Limitation of liability

To the fullest extent permitted by law, Clubero is not liable for indirect, incidental or consequential damages, loss of data, loss of profit or loss of opportunity. Our total liability for any claim is limited to the amounts you paid us for the Service in the 12 months preceding the claim.

## 10. Intellectual property

Clubero, its logos and software are protected by intellectual property law. You retain ownership of content you upload, and grant Clubero a limited licence to host and display it as needed to operate the Service.

## 11. Governing law

These Terms are governed by the laws of **Estonia**. Disputes are subject to the exclusive jurisdiction of the competent courts of Estonia (**Harju Maakohus**, Tallinn), without prejudice to mandatory consumer protection rules in your country of residence.

## 12. Modifications

We may update these Terms. Material changes will be notified in-app and by email at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.

## 13. Contact

Questions about these Terms: **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallinn, Estonia.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, published_at=now(), required=EXCLUDED.required;

-- 4) terms v3 FR
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('terms', 3, 'fr', true, 'Conditions Générales d''Utilisation',
$body$# Clubero — Conditions Générales d'Utilisation

_Dernière mise à jour : 28 juin 2026_

Bienvenue sur **Clubero** (« Clubero », « nous »), plateforme SaaS éditée par **Clubero OÜ**, société à responsabilité limitée de droit estonien (registrikood **17538695**), siège social Sepapaja tn 6, 15551 Tallinn, Estonie. TVA non applicable. Les présentes Conditions Générales d'Utilisation (« CGU ») régissent votre accès et votre utilisation des applications web et mobiles Clubero, des sites web et des services associés (le « Service »).

En créant un compte ou en utilisant le Service, vous acceptez les présentes CGU.

## 1. Présentation de la plateforme

Clubero permet aux clubs sportifs, entraîneurs, parents et joueurs de gérer leurs équipes, de communiquer, d'organiser des événements, de gérer les inscriptions et les paiements, de partager des documents et de recevoir des notifications.

## 2. Création de compte

- Vous devez fournir des informations exactes lors de la création de votre compte.
- Vous êtes responsable de la confidentialité de vos identifiants.
- Vous devez avoir au moins **16 ans** pour créer un compte par vous-même (ou l'âge de consentement numérique inférieur fixé par votre pays — voir Politique de Confidentialité §4). Les mineurs plus jeunes ne peuvent utiliser Clubero que via un compte créé et supervisé par un titulaire de l'autorité parentale (voir §4 et la page Consentement Parental).

## 3. Rôles utilisateurs

Le Service prévoit plusieurs rôles : **administrateur de club**, **entraîneur / staff**, **parent / représentant légal**, **joueur** et **administrateur de la plateforme**. Chaque rôle dispose de permissions définies dans le Service. Vous vous engagez à utiliser le Service uniquement dans le cadre du rôle qui vous est attribué.

## 4. Mineurs

Un joueur mineur ne peut être ajouté que par un titulaire de l'autorité parentale, qui fournit les consentements parentaux requis (voir la page Consentement Parental). Le parent est le destinataire principal des notifications relatives à l'enfant. Un enfant n'obtient son propre identifiant que si le parent l'a expressément autorisé.

## 5. Utilisation acceptable

Vous vous engagez à ne pas :

- publier de contenu illégal, haineux, harcelant, diffamatoire ou sexuellement explicite ;
- collecter ou partager des données personnelles d'autres utilisateurs sans leur consentement ;
- tenter de perturber, rétro-ingénierer, extraire ou attaquer le Service ;
- usurper l'identité d'une personne ou d'un club ;
- utiliser le Service pour envoyer des messages commerciaux non sollicités.

Nous pouvons retirer les contenus ou suspendre les comptes qui ne respectent pas ces règles.

## 6. Paiements

Certaines fonctionnalités (inscriptions, paiements d'événements, collectes) peuvent impliquer des paiements traités par **Stripe**. Stripe est le prestataire de services de paiement ; Clubero ne stocke jamais vos données complètes de carte. Les remboursements, rétrofacturations et la fiscalité sont régis par la politique du club concerné et le droit applicable. Les frais de service, lorsqu'ils s'appliquent, sont affichés avant paiement. Clubero OÜ n'est actuellement pas assujetti à la TVA ; les factures sont émises sans TVA (« TVA non applicable »).

## 7. Disponibilité du Service

Nous visons une haute disponibilité mais ne garantissons pas que le Service sera ininterrompu ou exempt d'erreurs. Nous pouvons effectuer des opérations de maintenance, déployer des mises à jour ou modifier des fonctionnalités à tout moment.

## 8. Suspension et résiliation

Nous pouvons suspendre ou résilier l'accès au Service en cas de manquement aux présentes CGU, si la loi l'exige, ou pour protéger les utilisateurs. Vous pouvez supprimer votre compte à tout moment depuis **Profil → Vie privée** (voir également §10 de la Politique de Confidentialité).

## 9. Limitation de responsabilité

Dans la mesure permise par la loi, Clubero ne saurait être tenu responsable des dommages indirects, accessoires ou consécutifs, des pertes de données, de profits ou d'opportunités. Notre responsabilité totale pour toute réclamation est limitée aux sommes que vous nous avez versées pour le Service au cours des 12 mois précédant la réclamation.

## 10. Propriété intellectuelle

Clubero, ses logos et son logiciel sont protégés par le droit de la propriété intellectuelle. Vous conservez la propriété du contenu que vous publiez et accordez à Clubero une licence limitée pour l'héberger et l'afficher dans la mesure nécessaire à l'exploitation du Service.

## 11. Droit applicable

Les présentes CGU sont régies par le droit **estonien**. Les litiges relèvent de la compétence exclusive des juridictions estoniennes (**Harju Maakohus**, Tallinn), sans préjudice des règles impératives de protection du consommateur de votre pays de résidence.

## 12. Modifications

Nous pouvons mettre à jour les présentes CGU. Les modifications substantielles sont notifiées dans l'application et par e-mail au moins 14 jours avant leur entrée en vigueur. Une utilisation continue après la date d'entrée en vigueur vaut acceptation.

## 13. Contact

Questions relatives aux CGU : **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallinn, Estonie.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, published_at=now(), required=EXCLUDED.required;

-- 5) privacy v3 EN
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 3, 'en', true, 'Privacy Policy',
$body$# Clubero — Privacy Policy

_Last updated: 28 June 2026_

Clubero is operated by **Clubero OÜ**, an Estonian private limited company (registrikood **17538695**), registered office Sepapaja tn 6, 15551 Tallinn, Estonia. VAT not applicable. Clubero OÜ is the **data controller** for personal data processed through the Service. This Privacy Policy describes the data we collect, why, and your rights under the **EU General Data Protection Regulation (GDPR)**.

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

## 4. Minors and digital consent age (Art. 8 GDPR)

GDPR Article 8 leaves Member States free to set the minimum age for valid digital consent between 13 and 16. Clubero applies the rule of the user's country of residence:

| Country | Digital consent age |
|---|---|
| Estonia (EE) | **13** |
| France (FR) | **15** |
| Luxembourg (LU) | **16** |
| Other EU / EEA (default) | **16** |

Under that age, a holder of parental authority must create and supervise the account and provide parental consent. Parents can withdraw consent at any time from **Profile → Privacy** or from the player's profile. See the dedicated **Parental Consent** page.

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
- **Rectification** (Art. 16) – edit your profile or your child's profile.
- **Erasure** (Art. 17) – request account deletion (30-day grace period, then anonymisation).
- **Restriction / objection** (Art. 18 / 21) – withdraw consents.
- **Portability** (Art. 20) – exports are JSON.
- **Complaint** – contact your national data protection authority. As Clubero OÜ is established in Estonia, the lead supervisory authority is the **Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon)** — <https://www.aki.ee>. EU/EEA users may also lodge a complaint with their local authority (e.g. **CNIL** in France, **CNPD** in Luxembourg).

## 7. Data deletion and export

- **Export**: a JSON archive of your data and your minor children's data is generated on demand.
- **Deletion**: requests are scheduled with a 30-day grace period, then your personal identifiers are replaced with anonymous markers and content unlinked from your identity. Aggregated club statistics may be retained.

## 8. Cookies and analytics

We use a minimal set of cookies and local storage strictly necessary for authentication, security and remembering your preferences. We do **not** use advertising trackers or third-party advertising cookies. Any future analytics will be privacy-preserving and disclosed here.

## 9. Sub-processors

We rely on a limited number of trusted sub-processors to operate the Service:

- **Supabase** (Supabase Inc., EU region) — database, authentication and storage.
- **Cloudflare, Inc.** — application edge hosting (Workers runtime).
- **Lovable** (Lovable AB) — `lovable.cloud` build & preview platform, and **Lovable AI Gateway** routing AI features (chat, embeddings, transcription). Prompts and minimal request metadata transit through Lovable when AI features are used.
- **Stripe** — payment processing.
- **Transactional email / SMS / push providers** — notifications.

The current list is available on request at **hello@clubero.app**.

## 10. International transfers

Data is stored in the **European Union**. Where a sub-processor processes data outside the EU, transfers are protected by Standard Contractual Clauses or equivalent safeguards.

## 11. Security

Encryption in transit (TLS), encryption at rest, role-based access control, audit logging and least-privilege keys. Despite our best efforts, no service is 100% secure; report any vulnerability to **hello@clubero.app**.

## 12. Reporting abuse

To report abusive content, harassment or a security concern: **hello@clubero.app**. We respond within 5 business days.

## 13. Contact

Data controller: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonia. Privacy and all other requests: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, published_at=now(), required=EXCLUDED.required;

-- 6) privacy v3 FR
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 3, 'fr', true, 'Politique de Confidentialité',
$body$# Clubero — Politique de Confidentialité

_Dernière mise à jour : 28 juin 2026_

Clubero est édité par **Clubero OÜ**, société à responsabilité limitée de droit estonien (registrikood **17538695**), siège social Sepapaja tn 6, 15551 Tallinn, Estonie. TVA non applicable. Clubero OÜ est le **responsable de traitement** des données personnelles traitées via le Service. La présente Politique de Confidentialité décrit les données que nous collectons, pourquoi, et vos droits au titre du **Règlement Général sur la Protection des Données (RGPD)**.

## 1. Données collectées

- **Données de compte** : nom, e-mail, téléphone, mot de passe (haché), avatar, langue, rôle.
- **Données joueur** : prénom/nom, date de naissance, numéro de maillot, poste, photo (avec consentement), équipe(s).
- **Liens parent–enfant** : relation entre le parent et le joueur mineur.
- **Données club et équipe** : adhésion, rôle au sein d'un club, affectation aux équipes.
- **Données opérationnelles** : événements, présences, inscriptions, compositions, messages, pièces jointes.
- **Métadonnées de paiement** : montants, statut, références — les données complètes de carte sont gérées par **Stripe**, jamais stockées chez nous.
- **Données techniques** : adresse IP, user-agent, informations sur l'appareil, journaux (sécurité et débogage).

Nous **ne collectons pas** de données biométriques, médicales ou de scoring comportemental, et nous **ne profilons pas** les mineurs au moyen d'IA.

## 2. Finalités du traitement

| Finalité | Base légale |
|---|---|
| Fournir et exploiter le Service | Contrat (Art. 6.1.b) |
| Gérer les comptes mineurs | Consentement parental (Art. 6.1.a + Art. 8) |
| Envoyer e-mails transactionnels / notifications push | Contrat / consentement (Art. 6.1.b / 6.1.a) |
| Traiter les paiements via Stripe | Contrat |
| Sécurité, prévention de la fraude, audit | Obligation légale, intérêt légitime |
| Répondre à nos obligations légales | Obligation légale (Art. 6.1.c) |

## 3. Principes RGPD appliqués

Licéité, loyauté et transparence · limitation des finalités · minimisation des données · exactitude · limitation de la conservation · intégrité et confidentialité · responsabilité.

## 4. Mineurs et âge du consentement numérique (Art. 8 RGPD)

L'article 8 du RGPD laisse aux États membres la faculté de fixer entre 13 et 16 ans l'âge auquel un mineur peut valablement consentir seul à un service en ligne. Clubero applique la règle du pays de résidence de l'utilisateur :

| Pays | Âge de consentement numérique |
|---|---|
| Estonie (EE) | **13 ans** |
| France (FR) | **15 ans** |
| Luxembourg (LU) | **16 ans** |
| Autre UE / EEE (défaut) | **16 ans** |

En deçà de cet âge, un titulaire de l'autorité parentale doit créer et superviser le compte et fournir le consentement parental. Les parents peuvent retirer leur consentement à tout moment depuis **Profil → Vie privée** ou depuis le profil du joueur. Voir la page dédiée **Consentement Parental**.

## 5. Durées de conservation

| Données | Conservation |
|---|---|
| Compte actif | Durée de vie du compte + 30 jours après la demande de suppression |
| Effectif joueurs (après départ) | 1 saison sportive pour les statistiques |
| Messages et pièces jointes | 24 mois |
| Journaux d'audit | 12 mois |
| Preuves de consentement | 5 ans après retrait |
| Données de paiement | Durée requise par la législation comptable / fiscale |

## 6. Vos droits

Au titre du RGPD, vous pouvez exercer :

- **Accès** (Art. 15) — téléchargez vos données depuis **Profil → Vie privée → Télécharger mes données**.
- **Rectification** (Art. 16) — modifiez votre profil ou celui de votre enfant.
- **Effacement** (Art. 17) — demandez la suppression de votre compte (délai de grâce de 30 jours, puis anonymisation).
- **Limitation / opposition** (Art. 18 / 21) — retirez vos consentements.
- **Portabilité** (Art. 20) — les exports sont au format JSON.
- **Réclamation** — auprès de votre autorité nationale de protection des données. Clubero OÜ étant établi en Estonie, l'autorité de contrôle chef de file est l'**Inspection estonienne de la protection des données (Andmekaitse Inspektsioon)** — <https://www.aki.ee>. Les utilisateurs UE/EEE peuvent également saisir leur autorité locale (ex. **CNIL** en France, **CNPD** au Luxembourg).

## 7. Suppression et export des données

- **Export** : une archive JSON de vos données et de celles de vos enfants mineurs est générée à la demande.
- **Suppression** : les demandes sont planifiées avec un délai de grâce de 30 jours ; vos identifiants personnels sont ensuite remplacés par des marqueurs anonymes et le contenu désindexé de votre identité. Des statistiques agrégées du club peuvent être conservées.

## 8. Cookies et analytics

Nous utilisons un ensemble minimal de cookies et de stockage local strictement nécessaires à l'authentification, à la sécurité et à la mémorisation de vos préférences. Nous **n'utilisons pas** de traceurs publicitaires ni de cookies publicitaires tiers. Toute future solution d'analytics respectera la vie privée et sera annoncée ici.

## 9. Sous-traitants ultérieurs

Nous nous appuyons sur un nombre limité de sous-traitants de confiance pour exploiter le Service :

- **Supabase** (Supabase Inc., région UE) — base de données, authentification et stockage.
- **Cloudflare, Inc.** — hébergement applicatif edge (Workers).
- **Lovable** (Lovable AB) — plateforme de build & preview `lovable.cloud`, et **Lovable AI Gateway** pour le routage des fonctionnalités d'IA (chat, embeddings, transcription). Les prompts et les métadonnées minimales de requête transitent par Lovable lorsque ces fonctionnalités sont utilisées.
- **Stripe** — traitement des paiements.
- **Fournisseurs d'e-mails transactionnels / SMS / push** — notifications.

La liste à jour est disponible sur demande à **hello@clubero.app**.

## 10. Transferts internationaux

Les données sont stockées dans l'**Union européenne**. Lorsqu'un sous-traitant traite des données hors UE, les transferts sont encadrés par les Clauses Contractuelles Types ou des garanties équivalentes.

## 11. Sécurité

Chiffrement en transit (TLS), chiffrement au repos, contrôle d'accès basé sur les rôles, journalisation d'audit et clés à privilèges minimaux. Malgré nos efforts, aucun service n'est 100 % sûr ; signalez toute vulnérabilité à **hello@clubero.app**.

## 12. Signalement d'abus

Pour signaler un contenu abusif, du harcèlement ou un problème de sécurité : **hello@clubero.app**. Nous répondons sous 5 jours ouvrés.

## 13. Contact

Responsable de traitement : **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonie. Demandes relatives à la vie privée et toutes autres demandes : **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, published_at=now(), required=EXCLUDED.required;

-- 7) Neutralise pre-incorporation placeholders in v1 legal_notice (0 consents).
UPDATE public.consent_versions
   SET content_md = $body$# Clubero — Legal Notice (superseded)

This version of the Legal Notice has been **superseded** by version 2
(28 June 2026), which reflects the official incorporation of
**Clubero OÜ** (registrikood 17538695, Sepapaja tn 6, 15551 Tallinn,
Estonia). Please refer to the current Legal Notice.
$body$
 WHERE kind = 'legal_notice' AND version = 1 AND locale = 'en';

UPDATE public.consent_versions
   SET content_md = $body$# Clubero — Mentions Légales (obsolètes)

Cette version des Mentions Légales est **remplacée** par la version 2
(28 juin 2026), qui reflète l'immatriculation officielle de
**Clubero OÜ** (registrikood 17538695, Sepapaja tn 6, 15551 Tallinn,
Estonie). Veuillez vous référer aux Mentions Légales en vigueur.
$body$
 WHERE kind = 'legal_notice' AND version = 1 AND locale = 'fr';