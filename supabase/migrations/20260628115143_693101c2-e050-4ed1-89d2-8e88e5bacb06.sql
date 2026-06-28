-- =====================================================================
-- Legal documents — Dutch (nl) translations  [DRAFT]
-- =====================================================================

-- 1) legal_notice v2 nl
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('legal_notice', 2, 'nl', false, 'Wettelijke vermeldingen',
$body$> **CONCEPT — NIET JURIDISCH GETOETST.** Door machine ondersteunde vertaling, juridische beoordeling in afwachting.

# Clubero — Wettelijke vermeldingen

_Laatst bijgewerkt: 28 juni 2026_

## Uitgever

**Clubero OÜ** — Estse besloten vennootschap (Osaühing / OÜ).

- Handelsnaam: Clubero OÜ
- Registratienummer (registrikood): **17538695**
- Statutaire zetel: Sepapaja tn 6, 15551 Tallinn, Estland
- Oprichtingsdatum: 25 juni 2026
- Btw: **Geen btw in rekening gebracht** — Clubero OÜ is op dit moment niet btw-geregistreerd.
- Activiteit: softwareonderneming — SaaS-platform voor sportclubs (NACE 58.29)
- Contact: **hello@clubero.app**
- Website: <https://clubero.app>

Alle correspondentie (juridisch, privacy, beveiliging, misbruik) verloopt via **hello@clubero.app**.

## Verantwoordelijke voor de publicatie

Verantwoordelijk voor de publicatie is de wettelijke vertegenwoordiger van Clubero OÜ.

## Hosting en infrastructuur

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, VS — hosting van de applicatie (Workers / edge runtime).
- **Supabase** (Supabase Inc.) — EU-regio — database, authenticatie en opslag.
- **Lovable** (Lovable AB) — ontwikkel- en hostingplatform alsmede AI-gateway voor het leveren van de AI-functionaliteit.

## Intellectuele eigendom

De Dienst, de broncode, het ontwerp en de merkidentiteit (waaronder de naam en het logo „Clubero") zijn de exclusieve eigendom van Clubero OÜ. Elke reproductie, weergave of hergebruik zonder voorafgaande schriftelijke toestemming is verboden.

## Melding van misbruik en verwijdering van inhoud

Meldingen van onrechtmatige of misbruikende inhoud kunnen worden verzonden naar **hello@clubero.app**. Vermeld een omschrijving van de inhoud, de URL en de reden van de melding.

## Geschillenbeslechting

Voor consumentengeschillen is het platform voor onlinegeschillenbeslechting van de Europese Commissie beschikbaar op <https://ec.europa.eu/consumers/odr>.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 2) terms v4 nl
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('terms', 4, 'nl', true, 'Algemene gebruiksvoorwaarden van Clubero',
$body$> **CONCEPT — NIET JURIDISCH GETOETST.** Door machine ondersteunde vertaling, juridische beoordeling in afwachting.

# Algemene gebruiksvoorwaarden van Clubero

_Laatst bijgewerkt: 28 juni 2026_

Welkom bij **Clubero** („Clubero", „wij"), een SaaS-platform dat wordt geëxploiteerd door **Clubero OÜ**, een besloten vennootschap naar Ests recht (registrikood **17538695**), met statutaire zetel te Sepapaja tn 6, 15551 Tallinn, Estland. Er wordt geen btw in rekening gebracht (Clubero OÜ is momenteel niet btw-geregistreerd). Deze gebruiksvoorwaarden („Voorwaarden") regelen uw toegang tot en gebruik van de web- en mobiele toepassingen, websites en bijbehorende diensten van Clubero (gezamenlijk: de „Dienst").

Door een account aan te maken of de Dienst te gebruiken, stemt u in met deze Voorwaarden.

## 1. Overzicht van het platform

Clubero helpt sportclubs, trainers, ouders en spelers bij het beheer van teams, communicatie, het organiseren van wedstrijden en trainingen, het beheer van inschrijvingen en betalingen, het delen van documenten en het ontvangen van meldingen.

## 2. Aanmaken van een account

- U dient bij het aanmaken van een account juiste informatie te verstrekken.
- U bent verantwoordelijk voor de vertrouwelijkheid van uw inloggegevens.
- U moet ten minste **18 jaar** zijn om zelf een account aan te maken en te beheren. Personen jonger dan 18 jaar mogen Clubero uitsluitend gebruiken via een account dat is aangemaakt en wordt beheerd door een houder van het ouderlijk gezag (zie §4 en de pagina over ouderlijke toestemming).

## 3. Gebruikersrollen

De Dienst ondersteunt meerdere rollen: **clubbeheerder**, **trainer / begeleider**, **ouder / wettelijke vertegenwoordiger**, **speler** en **platformbeheerder**. Aan elke rol zijn binnen de Dienst gedefinieerde rechten verbonden. U verbindt zich ertoe de Dienst uitsluitend te gebruiken binnen de reikwijdte van de aan u toegekende rol.

## 4. Minderjarigen

Een minderjarige speler kan uitsluitend worden toegevoegd door een houder van het ouderlijk gezag, die de vereiste ouderlijke toestemmingen verleent (zie de pagina over ouderlijke toestemming). De ouder is de prioritaire ontvanger van de meldingen die het kind betreffen. Het kind krijgt alleen eigen toegang als de ouder daar uitdrukkelijk toestemming voor geeft.

## 5. Aanvaardbaar gebruik

U verbindt zich ertoe niet:

- onrechtmatige, haatdragende, intimiderende, lasterlijke of seksueel expliciete inhoud te uploaden;
- persoonsgegevens van andere gebruikers te verzamelen of te verspreiden zonder hun toestemming;
- de Dienst te verstoren, te decompileren, te scrapen of aan te vallen;
- de identiteit van een persoon of club aan te nemen;
- de Dienst te gebruiken om ongevraagde commerciële berichten te verzenden.

Inhoud of accounts die deze regels schenden, kunnen worden verwijderd of opgeschort.

## 6. Betalingen

Bepaalde functies (inschrijvingen, betalingen voor evenementen, fondsenwervingen) kunnen betalingen omvatten die door **Stripe** worden verwerkt. Stripe is de betalingsdienstaanbieder; Clubero bewaart nooit uw volledige kaartgegevens. Terugbetalingen, terugboekingen en fiscale verplichtingen worden geregeld door het beleid van de betrokken club en het toepasselijke recht. Eventuele servicekosten worden vóór de betaling getoond.

## 7. Beschikbaarheid van de Dienst

Wij streven naar een hoge beschikbaarheid, maar garanderen geen ononderbroken of foutloze Dienst. Wij kunnen op elk moment onderhoud uitvoeren, updates publiceren of functies wijzigen.

## 8. Opschorting en beëindiging

Wij kunnen de toegang tot de Dienst opschorten of beëindigen bij schending van deze Voorwaarden, bij wettelijke verplichting of ter bescherming van de gebruikers. U kunt uw account op elk moment verwijderen via **Profiel → Privacy** (zie ook §10 van de Privacyverklaring).

## 9. Beperking van aansprakelijkheid

Voor zover wettelijk toegestaan, is Clubero niet aansprakelijk voor indirecte, incidentele of gevolgschade, verlies van gegevens, gederfde winst of gemiste kansen. Onze totale aansprakelijkheid voor enige aanspraak is beperkt tot de bedragen die u ons in de twaalf maanden vóór de aanspraak voor de Dienst heeft betaald.

## 10. Intellectuele eigendom

Clubero, zijn logo's en software zijn beschermd door het recht inzake intellectuele eigendom. U behoudt het eigendom van de inhoud die u uploadt en verleent Clubero een beperkte licentie om deze te hosten en weer te geven met het oog op de exploitatie van de Dienst.

## 11. Toepasselijk recht

Op deze Voorwaarden is Ests recht van toepassing. Geschillen vallen onder de exclusieve bevoegdheid van de bevoegde rechtbanken van Estland (Harju Maakohus, Tallinn), onverminderd dwingende consumentenbeschermingsbepalingen van uw woonland.

## 12. Wijzigingen

Wij kunnen deze Voorwaarden wijzigen. Wezenlijke wijzigingen worden ten minste 14 dagen vóór de inwerkingtreding ervan via de toepassing en per e-mail meegedeeld. Voortgezet gebruik na de datum van inwerkingtreding geldt als aanvaarding.

## 13. Contact

Vragen over deze Voorwaarden: **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallinn, Estland.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 3) privacy v4 nl
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 4, 'nl', true, 'Privacyverklaring',
$body$> **CONCEPT — NIET JURIDISCH GETOETST.** Door machine ondersteunde vertaling, juridische beoordeling in afwachting.

# Clubero — Privacyverklaring

_Laatst bijgewerkt: 28 juni 2026_

Clubero wordt geëxploiteerd door **Clubero OÜ** (registrikood **17538695**, Sepapaja tn 6, 15551 Tallinn, Estland), de verwerkingsverantwoordelijke voor de via de Dienst verwerkte persoonsgegevens. Deze Privacyverklaring beschrijft welke gegevens wij verzamelen, voor welk doel en welke rechten u heeft op grond van de **Algemene Verordening Gegevensbescherming (AVG)**.

## 1. Verzamelde gegevens

- **Accountgegevens**: naam, e-mail, telefoon, wachtwoord (gehasht), avatar, taal, rol.
- **Spelergegevens**: voor- en achternaam, geboortedatum, rugnummer, positie, foto (met toestemming), team(s).
- **Ouder/kind-koppelingen**: relatie tussen de ouder en de minderjarige speler.
- **Club- en teamgegevens**: lidmaatschap, rol binnen de club, teamtoewijzingen.
- **Operationele gegevens**: evenementen, aanwezigheden, inschrijvingen, opstellingen, berichten, bijlagen.
- **Betalingsmetagegevens**: bedragen, status, referenties — de volledige kaartgegevens worden verwerkt door **Stripe** en worden door ons nooit opgeslagen.
- **Technische gegevens**: IP-adres, user agent, apparaatinformatie, logbestanden (beveiliging en debug).

Wij verzamelen **geen** biometrische gegevens, **geen** gezondheidsgegevens en **geen** gedragsscores, en wij voeren **geen** AI-profilering van minderjarigen uit.

## 2. Verwerkingsdoeleinden

| Doel | Rechtsgrond |
|---|---|
| Levering en werking van de Dienst | Overeenkomst (Art. 6 lid 1, b) |
| Beheer van accounts van minderjarigen | Ouderlijke toestemming (Art. 6 lid 1, a + Art. 8) |
| Versturen van e-mails en meldingen | Overeenkomst / Toestemming |
| Betalingsverwerking via Stripe | Overeenkomst |
| Beveiliging, fraudepreventie, audit | Wettelijke verplichting, gerechtvaardigd belang |
| Nakoming van wettelijke verplichtingen | Wettelijke verplichting (Art. 6 lid 1, c) |

## 3. Nageleefde AVG-beginselen

Rechtmatigheid, behoorlijkheid, transparantie · Doelbinding · Minimale gegevensverwerking · Juistheid · Opslagbeperking · Integriteit en vertrouwelijkheid · Verantwoordingsplicht.

## 4. Minderjarigen en ouderlijk gezag

Artikel 8 AVG staat de lidstaten toe de minimumleeftijd waarop een minderjarige zelfstandig kan instemmen met verwerking in diensten van de informatiemaatschappij vast te stellen tussen 13 en 16 jaar (ter informatie: 13 in Estland, 15 in Frankrijk, 16 in Nederland en Luxemburg). Clubero hanteert bewust één strengere drempel in alle landen: **iedere persoon jonger dan 18 jaar wordt als minderjarig beschouwd** en mag Clubero uitsluitend gebruiken via een account dat is aangemaakt en wordt beheerd door een houder van het ouderlijk gezag, die de ouderlijke toestemming verleent en deze op elk moment kan intrekken via **Profiel → Privacy** of vanuit het profiel van de speler. Clubero baseert zich niet op een zelfstandige toestemming van de minderjarige op de lagere nationale leeftijden. Zie de afzonderlijke pagina over **ouderlijke toestemming**.

## 5. Bewaartermijnen

| Gegevens | Duur |
|---|---|
| Actief account | Duur van het account + 30 dagen na het verzoek tot verwijdering |
| Spelers die de club hebben verlaten | 1 sportseizoen voor statistieken |
| Berichten en bijlagen | 24 maanden |
| Auditlogs | 12 maanden |
| Toestemmingsbewijzen | 5 jaar na intrekking |
| Betalingsgegevens | Conform de fiscale en boekhoudkundige verplichtingen |

## 6. Uw rechten

Op grond van de AVG beschikt u over de volgende rechten:

- **Inzage** (Art. 15) — download uw gegevens via **Profiel → Privacy → Mijn gegevens downloaden**.
- **Rectificatie** (Art. 16) — bewerk uw profiel of dat van uw kind.
- **Wissing** (Art. 17) — vraag de verwijdering van uw account aan (respijtperiode van 30 dagen, daarna anonimisering).
- **Beperking / Bezwaar** (Art. 18 / 21) — trek uw toestemmingen in.
- **Overdraagbaarheid** (Art. 20) — exports worden in JSON-formaat geleverd.
- **Klacht** — bij de bevoegde toezichthoudende autoriteit. De leidende autoriteit van Clubero is de Estse autoriteit voor gegevensbescherming (**Andmekaitse Inspektsioon**); u kunt zich ook wenden tot uw nationale autoriteit (bijvoorbeeld Autoriteit Persoonsgegevens in Nederland, CNIL in Frankrijk, CNPD in Luxemburg).

## 7. Verwijdering en export van gegevens

- **Export**: op verzoek wordt een JSON-archief van uw gegevens en die van uw minderjarige kinderen aangemaakt.
- **Verwijdering**: verzoeken worden gepland met een respijtperiode van 30 dagen; daarna worden uw persoonlijke identificatoren vervangen door anonieme markeringen en wordt de inhoud losgekoppeld van uw identiteit. Geaggregeerde clubstatistieken kunnen worden bewaard.

## 8. Cookies en analyse

Wij gebruiken een minimum aan cookies en lokale opslag dat strikt noodzakelijk is voor authenticatie, beveiliging en het opslaan van uw voorkeuren. Wij gebruiken **geen** advertentietrackers en **geen** advertentiecookies van derden. Toekomstige bezoekersmetingen zullen privacyvriendelijk zijn en hier worden gedocumenteerd.

## 9. Verwerkers

Wij maken gebruik van een beperkt aantal vertrouwde verwerkers: **Supabase / database- en authenticatiehosting** (EU-regio), **Stripe** (betalingen), **e-mail- en sms-leveranciers** (meldingen), **cloudhosting** (Cloudflare) en **Lovable** (Lovable AB) als ontwikkel- en hostingplatform alsmede AI-gateway voor het routeren van AI-functionaliteit (doorvoer van prompts en metagegevens). De actuele lijst is op verzoek beschikbaar via **hello@clubero.app**.

## 10. Internationale doorgiften

De gegevens worden opgeslagen in de **Europese Unie**. Wanneer een verwerker gegevens buiten de EU verwerkt, worden de doorgiften gedekt door standaardcontractbepalingen of gelijkwaardige waarborgen.

## 11. Beveiliging

Versleuteling tijdens transport (TLS), versleuteling in rust, op rollen gebaseerde toegangscontrole, auditlogging en sleutels met minimale rechten. Ondanks onze inspanningen is geen enkele dienst 100 % veilig; meld kwetsbaarheden bij **hello@clubero.app**.

## 12. Misbruik melden

Voor het melden van misbruikende inhoud, intimidatie of een beveiligingsprobleem: **hello@clubero.app**. Wij reageren binnen 5 werkdagen.

## 13. Contact

Verwerkingsverantwoordelijke: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estland. Privacyverzoeken en alle andere vragen: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 4) data_processing v2 nl
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('data_processing', 2, 'nl', true, 'Verwerkersovereenkomst',
$body$> **CONCEPT — NIET JURIDISCH GETOETST.** Door machine ondersteunde vertaling, juridische beoordeling in afwachting.

# Clubero — Gegevensverwerking

_Laatst bijgewerkt: 28 juni 2026_

Dit document vormt een aanvulling op de Privacyverklaring en beschrijft hoe Clubero persoonsgegevens verwerkt namens clubs en gebruikers.

## 1. Rollen

- **Clubero OÜ** is **Verwerkingsverantwoordelijke** voor account-, authenticatie-, facturatie- en platformgegevens.
- Voor de operationele gegevens die eigen zijn aan elke club (selectie, evenementen, berichten) treedt Clubero op als **Verwerker** voor de club, die in dat kader verwerkingsverantwoordelijke is.

## 2. Categorieën van gegevens

Identificatie, contact, rol, aanwezigheid, communicatie, bijlagen, betalingsmetagegevens. Geen biometrische of gezondheidsgegevens en geen profilering van minderjarigen.

## 3. Subverwerkers

Zie §9 van de Privacyverklaring. Clubs worden geïnformeerd over nieuwe subverwerkers en kunnen om gerechtvaardigde redenen bezwaar maken.

## 4. Beveiligingsmaatregelen

Versleuteling tijdens transport en in rust, op rollen gebaseerde toegangscontrole, auditlogs, servicesleutels met minimale rechten, scheiding van test- en productieomgevingen, regelmatige bijwerking van afhankelijkheden.

## 5. Verzoeken van betrokkenen

Clubero ondersteunt clubs bij het beantwoorden van verzoeken van betrokkenen (inzage, rectificatie, wissing, overdraagbaarheid) binnen de wettelijke termijnen.

## 6. Melding van datalekken

Clubero stelt de betrokken clubs en gebruikers onverwijld en binnen 72 uur na kennisname van een inbreuk in verband met persoonsgegevens op de hoogte, overeenkomstig Art. 33 AVG.

## 7. Einde van de verwerking

Bij beëindiging worden de gegevens van de club binnen 30 dagen verwijderd of teruggegeven, behoudens een wettelijke bewaarplicht.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 5) parental_consent v1 nl
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('parental_consent', 1, 'nl', false, 'Ouderlijke toestemming',
$body$> **CONCEPT — NIET JURIDISCH GETOETST.** Door machine ondersteunde vertaling, juridische beoordeling in afwachting.

# Clubero — Ouderlijke toestemming

_Laatst bijgewerkt: 28 juni 2026_

Op deze pagina worden de toestemmingen toegelicht die een houder van het ouderlijk gezag verleent bij het toevoegen van een minderjarige aan Clubero. Zij vormt een aanvulling op de Privacyverklaring en de pagina over toestemming voor foto's en media.

## 1. Wie ouderlijke toestemming kan geven

Alleen een houder van het **ouderlijk gezag** (ouder of wettelijke vertegenwoordiger) kan namens een minderjarige toestemming geven. Door toestemming te geven verklaart u daartoe wettelijk bevoegd te zijn ten aanzien van de betrokken minderjarige.

## 2. Waartoe u toestemming geeft

- Het aanmaken van een spelerprofiel voor uw kind (voor- en achternaam, geboortedatum, rugnummer, positie, team).
- Het delen van dat profiel met de begeleidingsstaf van de club van de minderjarige (beheerder, trainer) en met de andere ouders/spelers van hetzelfde team, uitsluitend met het oog op sportieve organisatie.
- Het ontvangen van operationele meldingen (oproepingen, wijzigingen van schema, inschrijvingen, betalingen) namens de minderjarige.

## 3. Toestemming voor foto's en media

Het tonen van foto's en korte video's van de minderjarige op de pagina's van de club, het team en de evenementen vereist een **afzonderlijke en optionele** toestemming. U kunt deze op elk moment vanuit het profiel van de speler verlenen of weigeren. Zie de pagina **Toestemming voor foto's en media**.

## 4. Accounttoegang voor de minderjarige

Standaard ontvangt de minderjarige **geen** eigen inloggegevens. U kunt naar eigen inzicht het aanmaken van een account namens de minderjarige toestaan. In dat geval ontvangt de minderjarige een aanmeld-e-mail en blijft de ouder de prioritaire ontvanger van belangrijke mededelingen.

## 5. Intrekking van de toestemming

U kunt uw toestemming op elk moment intrekken via **Profiel → Privacy** of vanuit het profiel van de speler. De intrekking beëindigt de overeenkomstige verwerking en kan ertoe leiden dat de minderjarige wordt verwijderd uit de via Clubero georganiseerde teamactiviteiten.

## 6. Rol van de wettelijke vertegenwoordigers

Wanneer het ouderlijk gezag gezamenlijk wordt uitgeoefend, kunnen beide ouders het profiel van de minderjarige beheren. Bij onenigheid baseert Clubero zich op de geregistreerde ouder die het account heeft aangemaakt, onverminderd een door u overgelegde rechterlijke uitspraak.

## 7. Contact

Vragen over de gegevens van een minderjarige: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();