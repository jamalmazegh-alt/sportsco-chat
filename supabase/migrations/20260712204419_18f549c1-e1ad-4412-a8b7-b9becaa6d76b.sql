-- =====================================================================
-- Legal documents — privacy v5: add Facebook / Meta integration section
-- =====================================================================

-- privacy v5 fr
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'fr', true, 'Politique de Confidentialité',
$body$# Clubero — Politique de Confidentialité

_Dernière mise à jour : 12 juillet 2026_

Clubero est édité par **Clubero OÜ**, société à responsabilité limitée de droit estonien (registrikood **17538695**), siège social Sepapaja tn 6, 15551 Tallinn, Estonie. TVA non applicable. Clubero OÜ est le **responsable de traitement** des données personnelles traitées via le Service. La présente Politique de Confidentialité décrit les données que nous collectons, pourquoi, et vos droits au titre du **Règlement Général sur la Protection des Données (RGPD)**.

## 1. Données collectées

- **Données de compte** : nom, e-mail, téléphone, mot de passe (haché), avatar, langue, rôle.
- **Données joueur** : prénom/nom, date de naissance, numéro de maillot, poste, photo (avec consentement), équipe(s).
- **Liens parent–enfant** : relation entre le parent et le joueur mineur.
- **Données club et équipe** : adhésion, rôle au sein d''un club, affectation aux équipes.
- **Données opérationnelles** : événements, présences, inscriptions, compositions, messages, pièces jointes.
- **Métadonnées de paiement** : montants, statut, références — les données complètes de carte sont gérées par **Stripe**, jamais stockées chez nous.
- **Données techniques** : adresse IP, user-agent, informations sur l''appareil, journaux (sécurité et débogage).

Nous **ne collectons pas** de données biométriques, médicales ou de scoring comportemental, et nous **ne profilons pas** les mineurs au moyen d''IA.

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

## 4. Mineurs et autorité parentale

L''article 8 du RGPD autorise les États membres à fixer l''âge du consentement numérique entre 13 et 16 ans (à titre indicatif : 13 ans en Estonie, 13 au Portugal, 14 en Espagne, 14 en Italie, 15 en France, 16 en Allemagne, 16 au Luxembourg, 16 aux Pays-Bas). Clubero applique volontairement une règle unique et plus protectrice dans tous les pays : **tout utilisateur de moins de 18 ans est considéré comme mineur** et ne peut utiliser Clubero que via un compte créé et supervisé par un titulaire de l''autorité parentale, qui fournit le consentement parental et peut le retirer à tout moment depuis **Profil → Vie privée** ou depuis le profil du joueur. Clubero ne s''appuie pas sur l''auto-consentement des mineurs aux âges nationaux inférieurs. Voir la page dédiée **Consentement Parental**.

## 5. Durées de conservation

| Données | Conservation |
|---|---|
| Compte actif | Durée de vie du compte + 30 jours après la demande de suppression |
| Effectif joueurs (après départ) | 1 saison sportive pour les statistiques |
| Messages et pièces jointes | 24 mois |
| Journaux d''audit | 12 mois |
| Preuves de consentement | 5 ans après retrait |
| Données de paiement | Durée requise par la législation comptable / fiscale |

## 6. Vos droits

Au titre du RGPD, vous pouvez exercer :

- **Accès** (Art. 15) — téléchargez vos données depuis **Profil → Vie privée → Télécharger mes données**.
- **Rectification** (Art. 16) — modifiez votre profil ou celui de votre enfant.
- **Effacement** (Art. 17) — demandez la suppression de votre compte (délai de grâce de 30 jours, puis anonymisation).
- **Limitation / opposition** (Art. 18 / 21) — retirez vos consentements.
- **Portabilité** (Art. 20) — les exports sont au format JSON.
- **Réclamation** — auprès de votre autorité nationale de protection des données. Clubero OÜ étant établi en Estonie, l''autorité de contrôle chef de file est l''**Inspection estonienne de la protection des données (Andmekaitse Inspektsioon)** — <https://www.aki.ee>. Les utilisateurs UE/EEE peuvent également saisir leur autorité locale (ex. **CNIL** en France, **CNPD** au Luxembourg).

## 7. Suppression et export des données

- **Export** : une archive JSON de vos données et de celles de vos enfants mineurs est générée à la demande.
- **Suppression** : les demandes sont planifiées avec un délai de grâce de 30 jours ; vos identifiants personnels sont ensuite remplacés par des marqueurs anonymes et le contenu désindexé de votre identité. Des statistiques agrégées du club peuvent être conservées.

## 8. Cookies et analytics

Nous utilisons un ensemble minimal de cookies et de stockage local strictement nécessaires à l''authentification, à la sécurité et à la mémorisation de vos préférences. Nous **n''utilisons pas** de traceurs publicitaires ni de cookies publicitaires tiers. Toute future solution d''analytics respectera la vie privée et sera annoncée ici.

## 9. Sous-traitants ultérieurs

Nous nous appuyons sur un nombre limité de sous-traitants de confiance pour exploiter le Service :

- **Supabase** (Supabase Inc., région UE) — base de données, authentification et stockage.
- **Cloudflare, Inc.** — hébergement applicatif edge (Workers).
- **Lovable** (Lovable AB) — plateforme de build & preview `lovable.cloud`, et **Lovable AI Gateway** pour le routage des fonctionnalités d''IA (chat, embeddings, transcription). Les prompts et les métadonnées minimales de requête transitent par Lovable lorsque ces fonctionnalités sont utilisées.
- **Stripe** — traitement des paiements.
- **Fournisseurs d''e-mails transactionnels / SMS / push** — notifications.

La liste à jour est disponible sur demande à **hello@clubero.app**.

## 10. Transferts internationaux

Les données sont stockées dans l''**Union européenne**. Lorsqu''un sous-traitant traite des données hors UE, les transferts sont encadrés par les Clauses Contractuelles Types ou des garanties équivalentes.

## 11. Sécurité

Chiffrement en transit (TLS), chiffrement au repos, contrôle d''accès basé sur les rôles, journalisation d''audit et clés à privilèges minimaux. Malgré nos efforts, aucun service n''est 100 % sûr ; signalez toute vulnérabilité à **hello@clubero.app**.

## 12. Signalement d''abus

Pour signaler un contenu abusif, du harcèlement ou un problème de sécurité : **hello@clubero.app**. Nous répondons sous 5 jours ouvrés.

## 13. Intégration Facebook / Meta

Clubero permet à un club de connecter sa page Facebook afin d''afficher ses publications dans le Mur du club au sein de l''application.

**Données concernées.** Lorsqu''un administrateur du club autorise la connexion, nous accédons, via l''API Graph de Meta, aux informations suivantes : les publications de la page (texte, images, liens et date de publication), le nom et l''identifiant de la page, ainsi qu''un jeton d''accès à la page. Nous accédons uniquement aux données strictement nécessaires à l''affichage des publications Facebook dans l''application. Clubero ne publie aucun contenu sur la page Facebook et n''effectue aucune action au nom du club sans autorisation explicite.

**Finalité.** Ces données servent uniquement à récupérer et afficher les publications de la page du club dans le Mur de l''application. Nous n''accédons pas aux données personnelles des visiteurs de la page, ni à leurs commentaires ou messages.

**Conservation et sécurité.** Le jeton d''accès à la page est stocké de manière chiffrée dans notre base de données. Les publications récupérées sont conservées tant que la connexion Facebook reste active et sont supprimées dans un délai maximal de 30 jours après la déconnexion de la page.

**Retrait et suppression.** L''administrateur du club peut à tout moment déconnecter la page Facebook depuis les réglages de l''application. La déconnexion supprime le jeton d''accès et les publications importées. Toute demande de suppression des données liées à Facebook peut également être adressée à legal@clubero.app. Nous traiterons la demande dans les meilleurs délais, conformément à la réglementation applicable.

**Conformité.** Notre utilisation des données issues de Facebook est conforme aux Conditions de la plateforme Meta (Meta Platform Terms) et aux Politiques Développeur de Meta.

## 14. Contact

Responsable de traitement : **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonie. Demandes relatives à la vie privée et toutes autres demandes : **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- privacy v5 en
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'en', true, 'Privacy Policy',
$body$# Clubero — Privacy Policy

_Last updated: 12 July 2026_

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

## 4. Minors and parental authority

GDPR Article 8 allows Member States to set the minimum digital-consent age between 13 and 16 (for reference: 13 in Estonia, 13 in Portugal, 14 in Spain, 14 in Italy, 15 in France, 16 in Germany, 16 in Luxembourg, 16 in the Netherlands). Clubero deliberately applies a single, stricter standard across all countries: **any user under 18 is treated as a minor** and may only use Clubero through an account created and supervised by a holder of parental authority, who provides parental consent and may withdraw it at any time from **Profile → Privacy** or from the player's profile. We do not rely on minors self-consenting at the lower national ages. See the dedicated **Parental Consent** page.

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

## 13. Facebook / Meta integration

Clubero lets a club connect its Facebook Page in order to display its posts in the club wall inside the app.

**Data involved.** When a club administrator authorizes the connection, we access the following information through Meta's Graph API: the Page's posts (text, images, links and publication date), the Page name and ID, and a Page access token. We access only the data strictly necessary to display Facebook posts in the application. Clubero does not publish any content on the Facebook Page and performs no action on behalf of the club without explicit authorization.

**Purpose.** This data is used solely to retrieve and display the club Page's posts in the app's wall. We do not access the personal data of Page visitors, nor their comments or messages.

**Retention and security.** The Page access token is stored in encrypted form in our database. Retrieved posts are kept for as long as the Facebook connection remains active and are deleted within a maximum of 30 days after the Page is disconnected.

**Withdrawal and deletion.** A club administrator can disconnect the Facebook Page at any time from the app settings. Disconnecting deletes the access token and the imported posts. Any request to delete Facebook-related data can also be sent to legal@clubero.app. We will process the request as soon as possible, in accordance with applicable regulations.

**Compliance.** Our use of data obtained from Facebook complies with the Meta Platform Terms and the Meta Developer Policies.

## 14. Contact

Data controller: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonia. Privacy and all other requests: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- privacy v5 de
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'de', true, 'Datenschutzerklärung',
$body$# Clubero — Datenschutzerklärung

_Zuletzt aktualisiert: 12. Juli 2026_

Clubero wird von der **Clubero OÜ** betrieben (registrikood **17538695**, Sepapaja tn 6, 15551 Tallinn, Estland), dem Verantwortlichen für die über den Plattform verarbeiteten personenbezogenen Daten. Diese Datenschutzerklärung beschreibt, welche Daten wir erheben, zu welchem Zweck und welche Rechte Ihnen nach der **Datenschutz-Grundverordnung (DSGVO)** zustehen.

## 1. Erhobene Daten

- **Kontodaten**: Name, E-Mail, Telefon, Passwort (gehasht), Avatar, Sprache, Rolle.
- **Spielerdaten**: Vor-/Nachname, Geburtsdatum, Trikotnummer, Position, Foto (mit Einwilligung), Mannschaft(en).
- **Eltern-Kind-Verknüpfungen**: Beziehung zwischen Elternteil und minderjährigem Spieler.
- **Vereins- und Mannschaftsdaten**: Mitgliedschaft, Rolle im Verein, Mannschaftszuordnungen.
- **Nutzungsdaten**: Veranstaltungen, Anwesenheiten, Anmeldungen, Aufstellungen, Nachrichten, Anhänge.
- **Zahlungsmetadaten**: Beträge, Status, Referenzen — vollständige Kartendaten werden von **Stripe** verarbeitet und niemals von uns gespeichert.
- **Technische Daten**: IP-Adresse, User-Agent, Geräteinformationen, Protokolle (Sicherheit und Fehlersuche).

Wir erheben **keine** biometrischen Daten, keine Gesundheitsdaten und kein Verhaltens-Scoring, und wir erstellen **kein** KI-Profiling von Minderjährigen.

## 2. Zwecke der Verarbeitung

| Zweck | Rechtsgrundlage |
|---|---|
| Bereitstellung und Betrieb des Plattform | Vertrag (Art. 6 Abs. 1 lit. b) |
| Verwaltung der Konten Minderjähriger | Elterliche Einwilligung (Art. 6 Abs. 1 lit. a + Art. 8) |
| Versand von E-Mails und Benachrichtigungen | Vertrag / Einwilligung |
| Zahlungsabwicklung über Stripe | Vertrag |
| Sicherheit, Betrugsprävention, Audit | Rechtliche Verpflichtung, berechtigtes Interesse |
| Erfüllung gesetzlicher Pflichten | Rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c) |

## 3. Beachtete DSGVO-Grundsätze

Rechtmäßigkeit, Treu und Glauben, Transparenz · Zweckbindung · Datenminimierung · Richtigkeit · Speicherbegrenzung · Integrität und Vertraulichkeit · Rechenschaftspflicht.

## 4. Minderjährige und elterliche Sorge

Artikel 8 DSGVO erlaubt es den Mitgliedstaaten, das Mindestalter für eine wirksame Einwilligung in Plattforme der Informationsgesellschaft zwischen 13 und 16 Jahren festzulegen (zur Orientierung: 13 in Estland, 13 in Portugal, 14 in Spanien, 14 in Italien, 15 in Frankreich, 16 in Deutschland, 16 in Luxemburg, 16 in den Niederlanden). Clubero wendet bewusst einen einheitlichen, strengeren Maßstab in allen Ländern an: **jeder Nutzer unter 18 Jahren gilt als minderjährig** und darf Clubero nur über ein Konto nutzen, das von einem Inhaber der elterlichen Sorge erstellt und beaufsichtigt wird; dieser erteilt die elterliche Einwilligung und kann sie jederzeit unter **Profil → Datenschutz** oder über das Profil des Spielers widerrufen. Clubero stützt sich nicht auf eine eigenständige Einwilligung Minderjähriger zu den niedrigeren nationalen Altersgrenzen. Siehe die gesonderte Seite zur **elterlichen Einwilligung**.

## 5. Speicherdauer

| Daten | Dauer |
|---|---|
| Aktives Konto | Dauer des Kontos + 30 Tage nach dem Löschantrag |
| Ausgeschiedene Spieler | 1 Sportsaison für Statistiken |
| Nachrichten und Anhänge | 24 Monate |
| Audit-Protokolle | 12 Monate |
| Einwilligungsnachweise | 5 Jahre nach Widerruf |
| Zahlungsdaten | Gemäß steuer- und handelsrechtlichen Pflichten |

## 6. Ihre Rechte

Nach der DSGVO stehen Ihnen folgende Rechte zu:

- **Auskunft** (Art. 15) — laden Sie Ihre Daten unter **Profil → Datenschutz → Meine Daten herunterladen** herunter.
- **Berichtigung** (Art. 16) — bearbeiten Sie Ihr Profil oder das Ihres Kindes.
- **Löschung** (Art. 17) — beantragen Sie die Löschung Ihres Kontos (30-tägige Schonfrist, dann Anonymisierung).
- **Einschränkung / Widerspruch** (Art. 18 / 21) — widerrufen Sie Ihre Einwilligungen.
- **Datenübertragbarkeit** (Art. 20) — Exporte erfolgen im JSON-Format.
- **Beschwerde** — bei der zuständigen Aufsichtsbehörde. Federführende Behörde von Clubero ist die estnische Datenschutzaufsicht (**Andmekaitse Inspektsioon**); Sie können sich auch an Ihre nationale Behörde wenden (z. B. CNIL in Frankreich, CNPD in Luxemburg, die zuständige Landesbehörde in Deutschland).

## 7. Löschung und Export von Daten

- **Export**: ein JSON-Archiv Ihrer Daten und der Daten Ihrer minderjährigen Kinder wird auf Anfrage erstellt.
- **Löschung**: Anträge werden mit einer 30-tägigen Schonfrist geplant; anschließend werden Ihre personenbezogenen Identifikatoren durch anonyme Marker ersetzt und Inhalte von Ihrer Identität getrennt. Aggregierte Vereinsstatistiken können beibehalten werden.

## 8. Cookies und Analyse

Wir verwenden eine minimale Anzahl von Cookies und lokalem Speicher, die für Authentifizierung, Sicherheit und das Speichern Ihrer Einstellungen unbedingt erforderlich sind. Wir verwenden **keine** Werbe-Tracker oder Drittanbieter-Werbe-Cookies. Jede zukünftige Reichweitenmessung wird datenschutzfreundlich sein und hier dokumentiert werden.

## 9. Auftragsverarbeiter

Wir stützen uns auf eine begrenzte Anzahl vertrauenswürdiger Auftragsverarbeiter: **Supabase / Datenbank- und Authentifizierungs-Hosting** (EU-Region), **Stripe** (Zahlungen), **E-Mail- und SMS-Anbieter** (Benachrichtigungen), **Cloud-Hosting** (Cloudflare) sowie **Lovable** (Lovable AB) als Entwicklungs- und Hostingplattform sowie KI-Gateway zur Weiterleitung von KI-Funktionen (Transit von Prompts und Metadaten). Die aktuelle Liste ist auf Anfrage unter **hello@clubero.app** erhältlich.

## 10. Internationale Datenübermittlungen

Die Daten werden in der **Europäischen Union** gespeichert. Wenn ein Auftragsverarbeiter Daten außerhalb der EU verarbeitet, sind die Übermittlungen durch Standardvertragsklauseln oder gleichwertige Garantien abgedeckt.

## 11. Sicherheit

Verschlüsselung während der Übertragung (TLS), Verschlüsselung im Ruhezustand, rollenbasierte Zugriffssteuerung, Audit-Protokolle und Service-Keys mit geringsten Rechten. Trotz unserer Bemühungen ist kein Dienst zu 100 % sicher; melden Sie Sicherheitslücken an **hello@clubero.app**.

## 12. Missbrauch melden

Melden Sie missbräuchliche Inhalte, Belästigungen oder Sicherheitsbedenken an **hello@clubero.app**. Wir antworten innerhalb von 5 Werktagen.

## 13. Facebook-/Meta-Integration

Mit Clubero kann ein Verein seine Facebook-Seite verbinden, um deren Beiträge in der Vereinspinnwand innerhalb der App anzuzeigen.

**Betroffene Daten.** Wenn ein Vereinsadministrator die Verbindung autorisiert, greifen wir über die Graph-API von Meta auf folgende Informationen zu: die Beiträge der Seite (Text, Bilder, Links und Veröffentlichungsdatum), den Namen und die ID der Seite sowie ein Zugriffstoken für die Seite. Wir greifen ausschließlich auf die Daten zu, die für die Anzeige der Facebook-Beiträge in der App unbedingt erforderlich sind. Clubero veröffentlicht keine Inhalte auf der Facebook-Seite und führt ohne ausdrückliche Genehmigung keine Aktionen im Namen des Vereins aus.

**Zweck.** Diese Daten dienen ausschließlich dazu, die Beiträge der Vereinsseite abzurufen und in der Pinnwand der App anzuzeigen. Wir greifen weder auf personenbezogene Daten von Seitenbesuchern noch auf deren Kommentare oder Nachrichten zu.

**Speicherung und Sicherheit.** Das Zugriffstoken der Seite wird verschlüsselt in unserer Datenbank gespeichert. Die abgerufenen Beiträge werden so lange gespeichert, wie die Facebook-Verbindung aktiv bleibt, und werden innerhalb von höchstens 30 Tagen nach dem Trennen der Seite gelöscht.

**Widerruf und Löschung.** Ein Vereinsadministrator kann die Facebook-Seite jederzeit in den App-Einstellungen trennen. Beim Trennen werden das Zugriffstoken und die importierten Beiträge gelöscht. Jede Anfrage zur Löschung von Facebook-bezogenen Daten kann außerdem an legal@clubero.app gerichtet werden. Wir bearbeiten die Anfrage so schnell wie möglich im Einklang mit den geltenden Vorschriften.

**Konformität.** Unsere Nutzung der von Facebook stammenden Daten entspricht den Meta-Plattformbedingungen (Meta Platform Terms) und den Meta-Entwicklerrichtlinien.

## 14. Kontakt

Verantwortlicher für die Verarbeitung: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estland. Datenschutzrechtliche und sonstige Anfragen: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- privacy v5 es
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'es', true, 'Política de Privacidad',
$body$# Clubero — Política de Privacidad

_Última actualización: 12 de julio de 2026_

Clubero es operada por **Clubero OÜ**, sociedad de responsabilidad limitada de derecho estonio (registrikood **17538695**), con domicilio social en Sepapaja tn 6, 15551 Tallinn, Estonia. IVA no aplicable. Clubero OÜ es el **responsable del tratamiento** de los datos personales tratados a través del Servicio. La presente Política de Privacidad describe los datos que recogemos, por qué y cuáles son tus derechos en virtud del **Reglamento General de Protección de Datos (RGPD)**.

## 1. Datos recogidos

- **Datos de cuenta**: nombre, correo electrónico, teléfono, contraseña (hash), avatar, idioma, rol.
- **Datos de jugador**: nombre/apellidos, fecha de nacimiento, dorsal, posición, foto (con consentimiento), equipo(s).
- **Vínculos padre/madre–hijo/a**: relación entre el progenitor y el jugador menor.
- **Datos de club y equipo**: membresía, rol dentro del club, asignaciones de equipo.
- **Datos operativos**: eventos, asistencias, inscripciones, alineaciones, mensajes, adjuntos.
- **Metadatos de pago**: importes, estado, referencias — los datos completos de la tarjeta son tratados por **Stripe** y nunca almacenados por nosotros.
- **Datos técnicos**: dirección IP, user-agent, información del dispositivo, registros (seguridad y depuración).

**No** recogemos datos biométricos, datos de salud ni puntuaciones comportamentales, y **no** perfilamos a menores mediante IA.

## 2. Finalidades del tratamiento

| Finalidad | Base jurídica |
|---|---|
| Prestación y funcionamiento del Servicio | Contrato (Art. 6.1.b) |
| Gestión de cuentas de menores | Consentimiento parental (Art. 6.1.a + Art. 8) |
| Envío de e-mails y notificaciones | Contrato / Consentimiento |
| Procesamiento de pagos mediante Stripe | Contrato |
| Seguridad, prevención del fraude, auditoría | Obligación legal, interés legítimo |
| Cumplimiento de obligaciones legales | Obligación legal (Art. 6.1.c) |

## 3. Principios RGPD que respetamos

Licitud, lealtad y transparencia · limitación de la finalidad · minimización de datos · exactitud · limitación de la conservación · integridad y confidencialidad · responsabilidad.

## 4. Menores y responsabilidades parentales

El artículo 8 del RGPD permite a los Estados miembros fijar la edad mínima de consentimiento digital entre 13 y 16 años (a título informativo: 13 en Estonia, 13 en Portugal, 14 en España, 14 en Italia, 15 en Francia, 16 en Alemania, 16 en Luxemburgo, 16 en Países Bajos). Clubero aplica deliberadamente un umbral único y más estricto en todos los países: **cualquier usuario menor de 18 años se considera menor** y solo puede usar Clubero a través de una cuenta creada y supervisada por un titular de la patria potestad, que presta el consentimiento parental y puede retirarlo en cualquier momento desde **Perfil → Privacidad** o desde el perfil del jugador. Clubero no se basa en el auto-consentimiento de los menores en las edades nacionales más bajas. Consulta la página dedicada de **consentimiento parental**.

## 5. Plazos de conservación

| Datos | Conservación |
|---|---|
| Cuenta activa | Duración de la cuenta + 30 días después de la solicitud de eliminación |
| Plantilla de jugadores (tras la marcha) | 1 temporada deportiva para estadísticas |
| Mensajes y adjuntos | 24 meses |
| Registros de auditoría | 12 meses |
| Pruebas de consentimiento | 5 años después de la retirada |
| Datos de pago | Según lo requerido por la legislación fiscal/contable |

## 6. Tus derechos

En virtud del RGPD puedes ejercer:

- **Acceso** (Art. 15) — descarga tus datos desde **Perfil → Privacidad → Descargar mis datos**.
- **Rectificación** (Art. 16) — edita tu perfil o el de tu hijo/a.
- **Supresión** (Art. 17) — solicita la eliminación de tu cuenta (periodo de gracia de 30 días, luego anonimización).
- **Limitación / oposición** (Art. 18 / 21) — retira tus consentimientos.
- **Portabilidad** (Art. 20) — las exportaciones son JSON.
- **Reclamación** — ante la autoridad de protección de datos nacional competente. Al estar Clubero OÜ establecida en Estonia, la autoridad supervisora principal es la **Inspectoría de Protección de Datos de Estonia (Andmekaitse Inspektsioon)**; los usuarios de la UE/EEE también pueden dirigirse a su autoridad local (p. ej., **CNIL** en Francia, **CNPD** en Luxemburgo).

## 7. Eliminación y exportación de datos

- **Exportación**: se genera bajo demanda un archivo JSON con tus datos y los de tus hijos menores.
- **Eliminación**: las solicitudes se programan con un periodo de gracia de 30 días; después, tus identificadores personales se sustituyen por marcadores anónimos y el contenido se desvincula de tu identidad. Las estadísticas agregadas del club pueden conservarse.

## 8. Cookies y análisis

Utilizamos un conjunto mínimo de cookies y almacenamiento local estrictamente necesarios para la autenticación, la seguridad y el recuerdo de tus preferencias. **No** utilizamos rastreadores publicitarios ni cookies publicitarias de terceros. Cualquier futura medición de audiencia respetará la privacidad y se documentará aquí.

## 9. Encargados del tratamiento

Recogemos a un número limitado de encargados del tratamiento de confianza para operar el Servicio:

- **Supabase** (Supabase Inc., región UE) — base de datos, autenticación y almacenamiento.
- **Cloudflare, Inc.** — alojamiento edge de la aplicación (runtime Workers).
- **Lovable** (Lovable AB) — plataforma de build & preview `lovable.cloud`, y **Lovable AI Gateway** para el enrutamiento de funciones de IA (chat, embeddings, transcripción). Los prompts y los metadatos mínimos de solicitud transitan por Lovable cuando se usan estas funciones.
- **Stripe** — procesamiento de pagos.
- **Proveedores de e-mail / SMS / push transaccionales** — notificaciones.

La lista actual está disponible bajo solicitud en **hello@clubero.app**.

## 10. Transferencias internacionales de datos

Los datos se almacenan en la **Unión Europea**. Cuando un encargado del tratamiento procesa datos fuera de la UE, las transferencias están protegidas por Cláusulas Contractuales Tipo o garantías equivalentes.

## 11. Seguridad

Cifrado en tránsito (TLS), cifrado en reposo, control de acceso basado en roles, registros de auditoría y claves de privilegio mínimo. A pesar de nuestros esfuerzos, ningún servicio es 100 % seguro; reporta cualquier vulnerabilidad a **hello@clubero.app**.

## 12. Comunicar un abuso

Para comunicar contenidos abusivos, acoso o una preocupación de seguridad: **hello@clubero.app**. Respondemos en un plazo de 5 días hábiles.

## 13. Integración con Facebook / Meta

Clubero permite a un club conectar su página de Facebook para mostrar sus publicaciones en el muro del club dentro de la aplicación.

**Datos afectados.** Cuando un administrador del club autoriza la conexión, accedemos, a través de la API Graph de Meta, a la siguiente información: las publicaciones de la página (texto, imágenes, enlaces y fecha de publicación), el nombre y el identificador de la página, así como un token de acceso a la página. Accedemos únicamente a los datos estrictamente necesarios para mostrar las publicaciones de Facebook en la aplicación. Clubero no publica ningún contenido en la página de Facebook ni realiza ninguna acción en nombre del club sin autorización explícita.

**Finalidad.** Estos datos se utilizan únicamente para obtener y mostrar las publicaciones de la página del club en el muro de la aplicación. No accedemos a los datos personales de los visitantes de la página ni a sus comentarios o mensajes.

**Conservación y seguridad.** El token de acceso a la página se almacena de forma cifrada en nuestra base de datos. Las publicaciones obtenidas se conservan mientras la conexión con Facebook permanezca activa y se eliminan en un plazo máximo de 30 días tras la desconexión de la página.

**Retirada y eliminación.** Un administrador del club puede desconectar la página de Facebook en cualquier momento desde los ajustes de la aplicación. La desconnexión elimina el token de acceso y las publicaciones importadas. Cualquier solicitud de eliminación de los datos relacionados con Facebook también puede enviarse a legal@clubero.app. Trataremos la solicitud lo antes posible, de conformidad con la normativa aplicable.

**Cumplimiento.** Nuestro uso de los datos obtenidos de Facebook cumple con las Condiciones de la Plataforma de Meta (Meta Platform Terms) y las Políticas para Desarrolladores de Meta.

## 14. Contacto

Responsable del tratamiento: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonia. Solicitudes de privacidad y cualquier otra consulta: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- privacy v5 it
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'it', true, 'Informativa sulla Privacy',
$body$# Clubero — Informativa sulla Privacy

_Ultimo aggiornamento: 12 luglio 2026_

Clubero è gestita da **Clubero OÜ**, società a responsabilità limitata di diritto estone (registrikood **17538695**), con sede legale in Sepapaja tn 6, 15551 Tallinn, Estonia. IVA non applicabile. Clubero OÜ è il **titolare del trattamento** dei dati personali trattati tramite il Servizio. La presente Informativa sulla Privacy descrive quali dati raccogliamo, perché e quali diritti ti spettano ai sensi del **Regolamento Generale sulla Protezione dei Dati (GDPR)**.

## 1. Dati raccolti

- **Dati dell''account**: nome, e-mail, telefono, password (hash), avatar, lingua, ruolo.
- **Dati del giocatore**: nome/cognome, data di nascita, numero di maglia, posizione, foto (con consenso), squadra/e.
- **Collegamenti genitore-figlio**: relazione tra genitore e giocatore minorenne.
- **Dati di club e squadra**: appartenenza, ruolo all''interno del club, assegnazioni di squadra.
- **Dati operativi**: eventi, presenze, iscrizioni, formazioni, messaggi, allegati.
- **Metadati di pagamento**: importi, stato, riferimenti — i dati completi della carta sono trattati da **Stripe** e mai memorizzati da noi.
- **Dati tecnici**: indirizzo IP, user-agent, informazioni sul dispositivo, log (sicurezza e debug).

**Non** raccogliamo dati biometrici, dati sanitari o punteggi comportamentali, e **non** profiliamo i minori tramite IA.

## 2. Finalità del trattamento

| Finalità | Base giuridica |
|---|---|
| Fornitura e funzionamento del Servizio | Contratto (Art. 6.1.b) |
| Gestione degli account dei minori | Consenso parentale (Art. 6.1.a + Art. 8) |
| Invio di e-mail e notifiche | Contratto / Consenso |
| Elaborazione dei pagamenti tramite Stripe | Contratto |
| Sicurezza, prevenzione frodi, audit | Obbligo legale, interesse legittimo |
| Adempimento di obblighi di legge | Obbligo legale (Art. 6.1.c) |

## 3. Principi GDPR che rispettiamo

Licitudine, correttezza e trasparenza · limitazione delle finalità · minimizzazione dei dati · esattezza · limitazione della conservazione · integrità e riservatezza · responsabilità.

## 4. Minorenni e responsabilità genitoriali

L''articolo 8 del GDPR consente agli Stati membri di fissare l''età minima di consenso digitale tra 13 e 16 anni (a titolo informativo: 13 in Estonia, 13 in Portogallo, 14 in Spagna, 14 in Italia, 15 in Francia, 16 in Germania, 16 in Lussemburgo, 16 nei Paesi Bassi). Clubero applica deliberatamente una soglia unica e più protettiva in tutti i paesi: **ogni utente di età inferiore ai 18 anni è considerato minorenne** e può usare Clubero solo tramite un account creato e supervisionato da un titolare della responsabilità genitoriale, che fornisce il consenso parentale e può revocarlo in qualsiasi momento da **Profilo → Privacy** o dal profilo del giocatore. Clubero non si basa sull''auto-consenso dei minori alle età nazionali più basse. Vedi la pagina dedicata al **consenso parentale**.

## 5. Periodi di conservazione

| Dati | Conservazione |
|---|---|
| Account attivo | Durata dell''account + 30 giorni dopo la richiesta di eliminazione |
| Rosa dei giocatori (dopo l''uscita) | 1 stagione sportiva per le statistiche |
| Messaggi e allegati | 24 mesi |
| Log di audit | 12 mesi |
| Prove di consenso | 5 anni dopo la revoca |
| Dati di pagamento | Come richiesto dalla legge fiscale/contabile |

## 6. I tuoi diritti

Ai sensi del GDPR puoi esercitare:

- **Accesso** (Art. 15) — scarica i tuoi dati da **Profilo → Privacy → Scarica i miei dati**.
- **Rettifica** (Art. 16) — modifica il tuo profilo o quello di tuo figlio.
- **Cancellazione** (Art. 17) — richiedi l''eliminazione del tuo account (periodo di tolleranza di 30 giorni, poi anonimizzazione).
- **Limitazione / opposizione** (Art. 18 / 21) — revoca i tuoi consensi.
- **Portabilità** (Art. 20) — gli export sono in formato JSON.
- **Reclamo** — presso l''autorità nazionale di protezione dei dati competente. Essendo Clubero OÜ stabilita in Estonia, l''autorità di controllo principale è l''**Ispettorato per la Protezione dei Dati Estone (Andmekaitse Inspektsioon)**; gli utenti UE/SEE possono rivolgersi anche all''autorità locale (es. **CNIL** in Francia, **CNPD** in Lussemburgo).

## 7. Eliminazione ed exportazione dei dati

- **Export**: un archivio JSON dei tuoi dati e di quelli dei tuoi figli minori viene generato su richiesta.
- **Eliminazione**: le richieste sono pianificate con un periodo di tolleranza di 30 giorni; poi i tuoi identificatori personali vengono sostituiti con marcatori anonimi e i contenuti dissociati dalla tua identità. Le statistiche aggregate del club possono essere conservate.

## 8. Cookie e analytics

Utilizziamo un numero minimo di cookie e di archiviazione locale strettamente necessari per l''autenticazione, la sicurezza e il ricordo delle tue preferenze. **Non** utilizziamo tracker pubblicitari né cookie pubblicitari di terze parti. Qualsiasi futura misurazione del pubblico rispetterà la privacy e sarà documentata in questa pagina.

## 9. Responsabili del trattamento

Ci affidiamo a un numero limitato di responsabili del trattamento affidabili per gestire il Servizio:

- **Supabase** (Supabase Inc., regione UE) — database, autenticazione e archiviazione.
- **Cloudflare, Inc.** — hosting edge dell''applicazione (runtime Workers).
- **Lovable** (Lovable AB) — piattaforma di build & preview `lovable.cloud`, e **Lovable AI Gateway** per l''instradamento delle funzionalità di IA (chat, embeddings, trascrizione). I prompt e i metadati minimi della richiesta transitano attraverso Lovable quando vengono utilizzate queste funzionalità.
- **Stripe** — elaborazione dei pagamenti.
- **Fornitori di e-mail / SMS / push transazionali** — notifiche.

L''elenco aggiornato è disponibile su richiesta a **hello@clubero.app**.

## 10. Trasferimenti internazionali di dati

I dati sono archiviati nell''**Unione Europea**. Quando un responsabile del trattamento elabora dati al di fuori dell''UE, i trasferimenti sono protetti da Clausole Contrattuali Standard o garanzie equivalenti.

## 11. Sicurezza

Crittografia in transito (TLS), crittografia a riposo, controllo degli accessi basato sui ruoli, registri di audit e chiavi con privilegi minimi. Nonostante i nostri sforzi, nessun servizio è sicuro al 100%; segnala eventuali vulnerabilità a **hello@clubero.app**.

## 12. Segnalare un abuso

Per segnalare contenuti abusivi, molestie o problemi di sicurezza: **hello@clubero.app**. Rispondiamo entro 5 giorni lavorativi.

## 13. Integrazione Facebook / Meta

Clubero consente a un club di collegare la propria pagina Facebook per mostrarne i post nella bacheca del club all''interno dell''app.

**Dati interessati.** Quando un amministratore del club autorizza il collegamento, accediamo, tramite l''API Graph di Meta, alle seguenti informazioni: i post della pagina (testo, immagini, link e data di pubblicazione), il nome e l''identificativo della pagina, nonché un token di accesso alla pagina. Accediamo esclusivamente ai dati strettamente necessari per mostrare i post di Facebook nell''app. Clubero non pubblica alcun contenuto sulla pagina Facebook e non compie alcuna azione per conto del club senza autorizzazione esplicita.

**Finalità.** Questi dati sono utilizzati esclusivamente per recuperare e mostrare i post della pagina del club nella bacheca dell''app. Non accediamo ai dati personali dei visitatori della pagina, né ai loro commenti o messaggi.

**Conservazione e sicurezza.** Il token di accesso alla pagina è archiviato in forma cifrata nel nostro database. I post recuperati vengono conservati finché la connessione a Facebook rimane attiva e vengono eliminati entro un massimo di 30 giorni dalla disconnessione della pagina.

**Revoca ed eliminazione.** Un amministratore del club può scollegare la pagina Facebook in qualsiasi momento dalle impostazioni dell''app. Lo scollegamento elimina il token di accesso e i post importati. Qualsiasi richiesta di eliminazione dei dati relativi a Facebook può inoltre essere inviata a legal@clubero.app. Tratteremo la richiesta il prima possibile, in conformità con la normativa applicabile.

**Conformità.** Il nostro utilizzo dei dati ottenuti da Facebook è conforme ai Termini della Piattaforma Meta (Meta Platform Terms) e alle Politiche per gli Sviluppatori di Meta.

## 14. Contatti

Titolare del trattamento: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonia. Richieste privacy e qualsiasi altra richiesta: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- privacy v5 nl
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'nl', true, 'Privacyverklaring',
$body$# Clubero — Privacyverklaring

_Laatst bijgewerkt: 12 juli 2026_

Clubero wordt beheerd door **Clubero OÜ**, een Estse besloten vennootschap (registrikood **17538695**), met geregistreerd kantoor aan Sepapaja tn 6, 15551 Tallinn, Estland. BTW niet van toepassing. Clubero OÜ is de **verwerkingsverantwoordelijke** voor persoonsgegevens die via de Dienst worden verwerkt. Deze Privacyverklaring beschrijft welke gegevens we verzamelen, waarom en welke rechten je hebt onder de **Algemene Verordening Gegevensbescherming (AVG)**.

## 1. Gegevens die we verzamelen

- **Accountgegevens**: naam, e-mail, telefoon, wachtwoord (gehasht), avatar, taal, rol.
- **Spelergegevens**: voor-/achternaam, geboortedatum, rugnummer, positie, foto (met toestemming), team(s).
- **Ouder-kindkoppelingen**: relatie tussen ouder en minderjarige speler.
- **Club- & teamgegevens**: lidmaatschap, rol binnen een club, teamtoewijzingen.
- **Operationele gegevens**: evenementen, aanwezigheid, inschrijvingen, opstellingen, berichten, bijlagen.
- **Betalingsmetadata**: bedragen, status, referenties — volledige kaartgegevens worden door **Stripe** verwerkt en nooit door ons opgeslagen.
- **Technische gegevens**: IP-adres, user-agent, apparaatinformatie, logboeken (veiligheid en debugging).

We verzamelen **geen** biometrische gegevens, gezondheidsgegevens of gedragsscores, en we **profilen geen minderjarigen met AI**.

## 2. Doeleinden van verwerking

| Doel | Rechtsgrond |
|---|---|
| Leveren en exploiteren van de Dienst | Contract (Art. 6.1.b) |
| Beheren van accounts van minderjarigen | Ouderlijke toestemming (Art. 6.1.a + Art. 8) |
| Verzenden van e-mails en meldingen | Contract / toestemming |
| Verwerken van betalingen via Stripe | Contract |
| Beveiliging, fraudepreventie, audit | Wettelijke verplichting, gerechtvaardigd belang |
| Naleving van wettelijke verplichtingen | Wettelijke verplichting (Art. 6.1.c) |

## 3. AVG-principes die we volgen

Rechtmatigheid, billijkheid en transparantie · doelbinding · gegevensminimalisatie · juistheid · opslagbeperking · integriteit en vertrouwelijkheid · verantwoordingsplicht.

## 4. Minderjarigen en ouderlijk gezag

AVG-artikel 8 staat lidstaten toe de minimumleeftijd voor digitale toestemming tussen 13 en 16 jaar vast te stellen (ter informatie: 13 in Estland, 13 in Portugal, 14 in Spanje, 14 in Italië, 15 in Frankrijk, 16 in Duitsland, 16 in Luxemburg, 16 in Nederland). Clubero past bewust een uniforme, strengere drempel toe in alle landen: **elke gebruiker onder de 18 jaar wordt als minderjarige beschouwd** en mag Clubero alleen gebruiken via een account dat is gemaakt en beheerd door een ouder met ouderlijk gezag, die de ouderlijke toestemming geeft en deze op elk moment kan intrekken via **Profiel → Privacy** of vanuit het spelersprofiel. Clubero vertrouwt niet op zelftoestemming van minderjarigen op lagere nationale leeftijden. Zie de speciale pagina over **ouderlijke toestemming**.

## 5. Bewaartermijnen

| Gegevens | Bewaartermijn |
|---|---|
| Actief account | Levensduur account + 30 dagen na verzoek tot verwijdering |
| Spelersrooster (na vertrek) | 1 sportseizoen voor statistieken |
| Berichten en bijlagen | 24 maanden |
| Auditlogs | 12 maanden |
| Toestemmingsbewijzen | 5 jaar na intrekking |
| Betalingsgegevens | Zoals vereist door belasting-/boekhoudwetgeving |

## 6. Jouw rechten

Onder de AVG kun je het volgende uitoefenen:

- **Toegang** (Art. 15) — download je gegevens via **Profiel → Privacy → Download mijn gegevens**.
- **Rectificatie** (Art. 16) — bewerk je profiel of dat van je kind.
- **Wissing** (Art. 17) — vraag verwijdering van je account aan (30 dagen uitstel, dan anonimisering).
- **Beperking / verzet** (Art. 18 / 21) — trek je toestemmingen in.
- **Portabiliteit** (Art. 20) — exports zijn JSON.
- **Klacht** — bij je nationale gegevensbeschermingsautoriteit. Aangezien Clubero OÜ in Estland is gevestigd, is de toezichthoudende autoriteit met voortouw de **Estse Autoriteit Persoonsgegevens (Andmekaitse Inspektsioon)**; gebruikers in de EU/EER kunnen ook contact opnemen met hun lokale autoriteit (bijv. **CNIL** in Frankrijk, **CNPD** in Luxemburg).

## 7. Gegevens verwijderen en exporteren

- **Export**: een JSON-archief van je gegevens en die van je minderjarige kinderen wordt op verzoek gegenereerd.
- **Verwijdering**: verzoeken worden gepland met een uitstelperiode van 30 dagen; daarna worden je persoonlijke identificatoren vervangen door anonieme markeringen en inhoud losgekoppeld van je identiteit. Geaggregeerde clubstatistieken kunnen bewaard blijven.

## 8. Cookies en analyse

We gebruiken een minimum aan cookies en lokale opslag die strikt noodzakelijk zijn voor authenticatie, beveiliging en het onthouden van je voorkeuren. We gebruiken **geen** advertentietrackers of advertentiecookies van derden. Toekomstige analytics zullen privacyvriendelijk zijn en hier worden gedocumenteerd.

## 9. Verwerkers

We vertrouwen op een beperkt aantal vertrouwde verwerkers om de Dienst te exploiteren:

- **Supabase** (Supabase Inc., EU-regio) — database, authenticatie en opslag.
- **Cloudflare, Inc.** — edge hosting van de applicatie (Workers runtime).
- **Lovable** (Lovable AB) — `lovable.cloud` build & preview platform, en **Lovable AI Gateway** voor het routeren van AI-functies (chat, embeddings, transcriptie). Prompts en minimale aanvraagmetadata lopen via Lovable wanneer deze functies worden gebruikt.
- **Stripe** — betalingsverwerking.
- **Transactionele e-mail / SMS / push-providers** — meldingen.

De actuele lijst is op aanvraag beschikbaar via **hello@clubero.app**.

## 10. Internationale doorgiften

Gegevens worden opgeslagen in de **Europese Unie**. Wanneer een verwerker gegevens buiten de EU verwerkt, zijn doorgiften beschermd door Standaardcontractbepalingen of gelijkwaardige waarborgen.

## 11. Beveiliging

Versleuteling in transit (TLS), versleuteling at rest, op rollen gebaseerde toegangscontrole, auditlogging en least-privilege keys. Ondanks onze inspanningen is geen enkele dienst 100% veilig; rapporteer kwetsbaarheden aan **hello@clubero.app**.

## 12. Misbruik melden

Om misbruik, pesterijen of beveiligingsproblemen te melden: **hello@clubero.app**. We reageren binnen 5 werkdagen.

## 13. Facebook-/Meta-integratie

Met Clubero kan een club zijn Facebook-pagina koppelen om de berichten ervan weer te geven op de clubmuur binnen de app.

**Betrokken gegevens.** Wanneer een clubbeheerder de koppeling autoriseert, hebben wij via de Graph-API van Meta toegang tot de volgende informatie: de berichten van de pagina (tekst, afbeeldingen, links en publicatiedatum), de naam en de ID van de pagina, en een toegangstoken voor de pagina. Wij hebben uitsluitend toegang tot de gegevens die strikt noodzakelijk zijn om de Facebook-berichten in de app weer te geven. Clubero publiceert geen inhoud op de Facebook-pagina en voert geen enkele actie namens de club uit zonder uitdrukkelijke toestemming.

**Doel.** Deze gegevens worden uitsluitend gebruikt om de berichten van de clubpagina op te halen en weer te geven op de muur van de app. Wij hebben geen toegang tot de persoonsgegevens van paginabezoekers, noch tot hun reacties of berichten.

**Bewaring en beveiliging.** Het toegangstoken van de pagina wordt versleuteld opgeslagen in onze database. De opgehaalde berichten worden bewaard zolang de Facebook-koppeling actief blijft en worden binnen maximaal 30 dagen na het loskoppelen van de pagina verwijderd.

**Intrekking en verwijdering.** Een clubbeheerder kan de Facebook-pagina op elk moment loskoppelen via de app-instellingen. Bij het loskoppelen worden het toegangstoken en de geïmporteerde berichten verwijderd. Elk verzoek tot verwijdering van Facebook-gerelateerde gegevens kan bovendien worden gestuurd naar legal@clubero.app. Wij behandelen het verzoek zo snel mogelijk, in overeenstemming met de toepasselijke regelgeving.

**Naleving.** Ons gebruik van gegevens verkregen van Facebook voldoet aan de Meta Platform Terms en het ontwikkelaarsbeleid van Meta.

## 14. Contact

Verwerkingsverantwoordelijke: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estland. Privacyverzoeken en alle andere verzoeken: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- privacy v5 pt
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 5, 'pt', true, 'Política de Privacidade',
$body$# Clubero — Política de Privacidade

_Última atualização: 12 de julho de 2026_

A Clubero é operada pela **Clubero OÜ** (registrikood **17538695**, Sepapaja tn 6, 15551 Tallinn, Estónia), responsável pelo tratamento dos dados pessoais tratados através do Serviço. A presente Política de Privacidade descreve que dados recolhemos, com que finalidade e quais os direitos que assistem ao utilizador ao abrigo do **Regulamento Geral sobre a Proteção de Dados (RGPD)**.

## 1. Dados recolhidos

- **Dados da conta**: nome, e-mail, telefone, palavra-passe (com hash), avatar, idioma, função.
- **Dados do jogador**: nome próprio e apelido, data de nascimento, número de camisola, posição, fotografia (com consentimento), equipa(s).
- **Ligações encarregado de educação/criança**: relação entre o encarregado de educação e o jogador menor.
- **Dados do clube e da equipa**: pertença, função no clube, atribuições de equipa.
- **Dados operacionais**: eventos, presenças, inscrições, onzes iniciais, mensagens, anexos.
- **Metadados de pagamento**: montantes, estado, referências — os dados completos do cartão são tratados pela **Stripe** e nunca são por nós conservados.
- **Dados técnicos**: endereço IP, user agent, informações do dispositivo, registos (segurança e depuração).

**Não** recolhemos dados biométricos, dados de saúde nem pontuações comportamentais, e **não** efetuamos qualquer definição de perfis por IA de menores.

## 2. Finalidades do tratamento

| Finalidade | Fundamento jurídico |
|---|---|
| Prestação e funcionamento do Serviço | Contrato (Art. 6.º, n.º 1, b)) |
| Gestão de contas de menores | Consentimento parental (Art. 6.º, n.º 1, a) + Art. 8.º) |
| Envio de e-mails e notificações | Contrato / Consentimento |
| Processamento de pagamentos via Stripe | Contrato |
| Segurança, prevenção de fraude, auditoria | Obrigação legal, interesse legítimo |
| Cumprimento de obrigações legais | Obrigação legal (Art. 6.º, n.º 1, c)) |

## 3. Princípios do RGPD respeitados

Licitude, lealdade e transparência · Limitação das finalidades · Minimização dos dados · Exatidão · Limitação da conservação · Integridade e confidencialidade · Responsabilidade.

## 4. Menores e responsabilidades parentais

O artigo 8.º do RGPD permite aos Estados-Membros fixar entre os 13 e os 16 anos a idade mínima a partir da qual um menor pode consentir por si próprio o tratamento no contexto dos serviços da sociedade da informação (a título informativo: 13 na Estónia, 13 em Portugal, 14 em Espanha, 14 em Itália, 15 em França, 16 na Alemanha, 16 no Luxemburgo, 16 nos Países Baixos). A Clubero aplica deliberadamente um limiar único e mais rigoroso em todos os países: **qualquer pessoa com idade inferior a 18 anos é considerada menor** e só pode utilizar a Clubero através de uma conta criada e supervisionada por um titular das responsabilidades parentais, que presta o consentimento parental e o pode retirar a qualquer momento em **Perfil → Privacidade** ou a partir do perfil do jogador. A Clubero não se baseia num consentimento autónomo do menor nas idades nacionais mais baixas. Ver a página específica de **consentimento parental**.

## 5. Prazos de conservação

| Dados | Duração |
|---|---|
| Conta ativa | Duração da conta + 30 dias após o pedido de eliminação |
| Jogadores que deixaram o clube | 1 época desportiva para fins estatísticos |
| Mensagens e anexos | 24 meses |
| Registos de auditoria | 12 meses |
| Provas de consentimento | 5 anos após a retirada |
| Dados de pagamento | De acordo com as obrigações fiscais e contabilísticas |

## 6. Os seus direitos

Ao abrigo do RGPD, assistem ao utilizador os seguintes direitos:

- **Acesso** (Art. 15.º) — descarregue os seus dados em **Perfil → Privacidade → Descarregar os meus dados**.
- **Retificação** (Art. 16.º) — edite o seu perfil ou o do seu filho.
- **Apagamento** (Art. 17.º) — solicite a eliminação da sua conta (prazo de tolerância de 30 dias, seguido de anonimização).
- **Limitação / Oposição** (Art. 18.º / 21.º) — retire os seus consentimentos.
- **Portabilidade** (Art. 20.º) — as exportações são fornecidas em formato JSON.
- **Reclamação** — junto da autoridade de controlo competente. A autoridade principal da Clubero é a autoridade estónia de proteção de dados (**Andmekaitse Inspektsioon**); pode igualmente dirigir-se à sua autoridade nacional (por exemplo, CNPD em Portugal, CNIL em França).

## 7. Eliminação e exportação de dados

- **Exportação**: é gerado, mediante pedido, um ficheiro JSON com os seus dados e os dos seus filhos menores.
- **Eliminação**: os pedidos são agendados com um prazo de tolerância de 30 dias; em seguida, os seus identificadores pessoais são substituídos por marcadores anónimos e os conteúdos são desassociados da sua identidade. As estatísticas agregadas do clube podem ser conservadas.

## 8. Cookies e análise

Utilizamos um número mínimo de cookies e de armazenamento local estritamente necessários para a autenticação, a segurança e a conservação das suas preferências. **Não** utilizamos rastreadores publicitários nem cookies publicitários de terceiros. Qualquer futura medição de audiência respeitará a privacidade e será documentada nesta página.

## 9. Subcontratantes

Recorremos a um número limitado de subcontratantes de confiança: **Supabase / alojamento de base de dados e autenticação** (região UE), **Stripe** (pagamentos), **fornecedores de e-mail e SMS** (notificações), **alojamento em cloud** (Cloudflare) e **Lovable** (Lovable AB) enquanto plataforma de desenvolvimento e alojamento, bem como gateway de IA para o encaminhamento das funcionalidades de inteligência artificial (trânsito de prompts e metadados). A lista atualizada está disponível mediante pedido para **hello@clubero.app**.

## 10. Transferências internacionais de dados

Os dados são armazenados na **União Europeia**. Sempre que um subcontratante trate dados fora da UE, as transferências são abrangidas por cláusulas contratuais-tipo ou garantias equivalentes.

## 11. Segurança

Cifragem em trânsito (TLS), cifragem em repouso, controlo de acessos com base em funções, registo de auditoria e chaves com privilégios mínimos. Apesar dos nossos esforços, nenhum serviço é 100 % seguro; comunique qualquer vulnerabilidade para **hello@clubero.app**.

## 12. Comunicar um abuso

Para comunicar conteúdos abusivos, assédio ou um problema de segurança: **hello@clubero.app**. Respondemos no prazo de 5 dias úteis.

## 13. Integração Facebook / Meta

O Clubero permite que um clube ligue a sua página de Facebook para apresentar as suas publicações no mural do clube dentro da aplicação.

**Dados abrangidos.** Quando um administrador do clube autoriza a ligação, acedemos, através da API Graph da Meta, às seguintes informações: as publicações da página (texto, imagens, ligações e data de publicação), o nome e o identificador da página, bem como um token de acesso à página. Acedemos apenas aos dados estritamente necessários para apresentar as publicações do Facebook na aplicação. O Clubero não publica qualquer conteúdo na página de Facebook nem realiza qualquer ação em nome do clube sem autorização explícita.

**Finalidade.** Estes dados são utilizados exclusivamente para obter e apresentar as publicações da página do clube no mural da aplicação. Não acedemos aos dados pessoais dos visitantes da página, nem aos seus comentários ou mensagens.

**Conservação e segurança.** O token de acesso à página é armazenado de forma cifrada na nossa base de dados. As publicações obtidas são conservadas enquanto a ligação ao Facebook se mantiver ativa e são eliminadas no prazo máximo de 30 dias após a desativação da página.

**Retirada e eliminação.** Um administrador do clube pode desligar a página de Facebook a qualquer momento a partir das definições da aplicação. A desativação elimina o token de acesso e as publicações importadas. Qualquer pedido de eliminação dos dados relacionados com o Facebook pode também ser enviado para legal@clubero.app. Trataremos o pedido com a maior brevidade possível, em conformidade com a regulamentação aplicável.

**Conformidade.** A nossa utilização dos dados obtidos do Facebook está em conformidade com os Termos da Plataforma Meta (Meta Platform Terms) e as Políticas para Programadores da Meta.

## 14. Contacto

Responsável pelo tratamento: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estónia. Pedidos em matéria de proteção de dados e demais questões: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();