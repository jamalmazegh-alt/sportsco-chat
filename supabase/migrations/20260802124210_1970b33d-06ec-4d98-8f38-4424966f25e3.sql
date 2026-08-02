-- =========================================================================
-- CLUBERO — Corpus légal : traductions manquantes
-- DE : terms v4, data_processing v2, legal_notice v2, parental_consent v1,
--      media v2, notifications v2
-- ES / IT / NL / PT : media v2, notifications v2
-- Complète le corpus pour que les 7 langues de l'application soient servies
-- sans fallback anglais. Versions et flags `required` identiques aux
-- versions FR/EN existantes.
-- =========================================================================

INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md) VALUES

-- ===================== TERMS — DE =====================
('terms', 4, 'de', true, 'Allgemeine Nutzungsbedingungen',
$md$# Clubero — Allgemeine Nutzungsbedingungen

_Zuletzt aktualisiert: 28. Juni 2026_

Willkommen bei **Clubero** („Clubero", „wir", „unser", „uns"), einer SaaS-Plattform, betrieben von der **Clubero OÜ**, einer estnischen Gesellschaft mit beschränkter Haftung (Registernummer **17538695**), mit Sitz in Sepapaja tn 6, 15551 Tallinn, Estland. Umsatzsteuer nicht anwendbar. Diese Allgemeinen Nutzungsbedingungen („Nutzungsbedingungen") regeln Ihren Zugang zu den Web- und Mobilanwendungen, Websites und zugehörigen Diensten von Clubero (zusammen der „Dienst") sowie deren Nutzung.

Mit der Erstellung eines Kontos oder der Nutzung des Dienstes erklären Sie sich mit diesen Nutzungsbedingungen einverstanden.

## 1. Überblick über die Plattform

Clubero unterstützt Sportvereine, Trainer, Eltern und Spieler dabei, Mannschaften zu verwalten, zu kommunizieren, Veranstaltungen zu organisieren, Anmeldungen und Zahlungen abzuwickeln, Dokumente zu teilen und Benachrichtigungen zu erhalten.

## 2. Kontoerstellung

- Sie müssen bei der Erstellung eines Kontos zutreffende Angaben machen.
- Sie sind dafür verantwortlich, Ihre Zugangsdaten vertraulich zu behandeln.
- Sie müssen mindestens **18 Jahre alt** sein, um selbstständig ein Konto zu erstellen und zu verwalten. Personen unter 18 Jahren dürfen Clubero nur über ein Konto nutzen, das von einem Inhaber der elterlichen Sorge erstellt und beaufsichtigt wird (siehe §4 und die Seite „Elterliche Einwilligung").

## 3. Nutzerrollen

Der Dienst unterstützt mehrere Rollen: **Vereinsadministrator**, **Trainer / Betreuerstab**, **Elternteil / Erziehungsberechtigte(r)**, **Spieler** und **Plattformadministrator**. Jede Rolle verfügt über eigene, innerhalb des Dienstes festgelegte Berechtigungen. Sie verpflichten sich, den Dienst nur im Rahmen der Ihnen zugewiesenen Rolle zu nutzen.

## 4. Minderjährige

Ein minderjähriger Spieler kann nur von einem Inhaber der elterlichen Sorge hinzugefügt werden, der die erforderlichen elterlichen Einwilligungen erteilt (siehe die Seite „Elterliche Einwilligung"). Der Elternteil ist der primäre Empfänger der das Kind betreffenden Benachrichtigungen. Ein Kind erhält eigene Zugangsdaten nur, wenn der Elternteil dies ausdrücklich aktiviert.

## 5. Zulässige Nutzung

Sie verpflichten sich, Folgendes zu unterlassen:

- das Hochladen rechtswidriger, hasserfüllter, belästigender, verleumderischer oder sexuell expliziter Inhalte;
- das Erheben oder Weitergeben personenbezogener Daten anderer Nutzer ohne deren Einwilligung;
- Versuche, den Dienst zu stören, zurückzuentwickeln (Reverse Engineering), auszulesen (Scraping) oder anzugreifen;
- das Auftreten unter falscher Identität als andere Person oder anderer Verein;
- die Nutzung des Dienstes zum Versand unerwünschter kommerzieller Nachrichten.

Wir können Inhalte entfernen oder Konten sperren, die gegen diese Regeln verstoßen.

## 6. Zahlungen

Bestimmte Funktionen (Anmeldungen, Veranstaltungszahlungen, Spendenaktionen) können Zahlungen beinhalten, die über **Stripe** abgewickelt werden. Stripe ist der Zahlungsdienstleister; Clubero speichert zu keinem Zeitpunkt Ihre vollständigen Kartendaten. Erstattungen, Rückbuchungen und die steuerliche Behandlung richten sich nach den Regelungen des jeweiligen Vereins und dem anwendbaren Recht. Etwaige Servicegebühren werden vor der Zahlung angezeigt. Die Clubero OÜ ist derzeit nicht umsatzsteuerlich registriert; Rechnungen werden ohne Umsatzsteuer ausgestellt („Umsatzsteuer nicht anwendbar").

## 7. Verfügbarkeit des Dienstes

Wir streben eine hohe Verfügbarkeit an, gewährleisten jedoch nicht, dass der Dienst unterbrechungs- oder fehlerfrei ist. Wir können jederzeit Wartungsarbeiten durchführen, Aktualisierungen einspielen oder Funktionen ändern.

## 8. Sperrung und Beendigung

Wir können den Zugang zum Dienst sperren oder beenden, wenn Sie gegen diese Nutzungsbedingungen verstoßen, wenn dies gesetzlich vorgeschrieben ist oder um Nutzer zu schützen. Sie können Ihr Konto jederzeit unter **Profil → Datenschutz** löschen (siehe auch §10 der Datenschutzerklärung).

## 9. Haftungsbeschränkung

Soweit gesetzlich zulässig, haftet Clubero nicht für mittelbare Schäden, Neben- oder Folgeschäden, Datenverlust, entgangenen Gewinn oder entgangene Chancen. Unsere Gesamthaftung für sämtliche Ansprüche ist auf die Beträge beschränkt, die Sie in den 12 Monaten vor dem Anspruch für den Dienst an uns gezahlt haben.

## 10. Geistiges Eigentum

Clubero, seine Logos und seine Software sind durch das Recht des geistigen Eigentums geschützt. Sie behalten das Eigentum an den von Ihnen hochgeladenen Inhalten und räumen Clubero eine beschränkte Lizenz ein, diese zu hosten und anzuzeigen, soweit dies für den Betrieb des Dienstes erforderlich ist.

## 11. Anwendbares Recht

Diese Nutzungsbedingungen unterliegen dem Recht von **Estland**. Für Streitigkeiten sind ausschließlich die zuständigen Gerichte Estlands (**Harju Maakohus**, Tallinn) zuständig, unbeschadet zwingender verbraucherschützender Vorschriften in Ihrem Wohnsitzland.

## 12. Änderungen

Wir können diese Nutzungsbedingungen aktualisieren. Über wesentliche Änderungen werden Sie mindestens 14 Tage vor deren Inkrafttreten in der App und per E-Mail informiert. Die fortgesetzte Nutzung nach dem Inkrafttreten gilt als Zustimmung.

## 13. Kontakt

Fragen zu diesen Nutzungsbedingungen: **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallinn, Estland.
$md$),

-- ===================== DATA_PROCESSING — DE =====================
('data_processing', 2, 'de', true, 'Auftragsverarbeitungsvereinbarung',
$md$# Clubero — Auftragsverarbeitung

_Zuletzt aktualisiert: 14. Mai 2026_

Dieses Dokument ergänzt die Datenschutzerklärung und beschreibt, wie Clubero personenbezogene Daten im Auftrag von Vereinen und Nutzern verarbeitet.

## 1. Rollen

- Die **CLUBERO OÜ** ist **Verantwortliche** für Konto-, Authentifizierungs-, Abrechnungs- und plattformbezogene Daten.
- Für vereinsspezifische operative Daten (Kaderlisten, Veranstaltungen, Nachrichten) handelt Clubero als **Auftragsverarbeiter** für den Verein, der Verantwortlicher für diese Daten ist.

## 2. Datenkategorien

Identifikations-, Kontakt-, Rollen-, Anwesenheits- und Kommunikationsdaten, Anhänge, Zahlungsmetadaten. Keine biometrischen Daten, keine Gesundheitsdaten, kein Profiling von Minderjährigen.

## 3. Unterauftragsverarbeiter

Siehe §9 der Datenschutzerklärung. Vereine werden über neue Unterauftragsverarbeiter informiert und können aus berechtigten Gründen Einspruch erheben.

## 4. Sicherheitsmaßnahmen

Verschlüsselung bei der Übertragung und im Ruhezustand, rollenbasierte Zugriffskontrolle, Audit-Protokolle, Dienstschlüssel nach dem Prinzip der geringsten Berechtigung, Trennung von Test- und Produktionsumgebungen, regelmäßige Aktualisierung der Abhängigkeiten.

## 5. Anfragen betroffener Personen

Clubero unterstützt Vereine bei der Beantwortung von Anfragen betroffener Personen (Auskunft, Berichtigung, Löschung, Datenübertragbarkeit) innerhalb der gesetzlichen Fristen.

## 6. Meldung von Datenschutzverletzungen

Clubero benachrichtigt betroffene Vereine und Nutzer unverzüglich und innerhalb von 72 Stunden nach Bekanntwerden einer Verletzung des Schutzes personenbezogener Daten gemäß Art. 33 DSGVO.

## 7. Ende der Verarbeitung

Nach Vertragsbeendigung werden die Vereinsdaten innerhalb von 30 Tagen gelöscht oder zurückgegeben, sofern nicht gesetzliche Aufbewahrungspflichten bestehen.
$md$),

-- ===================== LEGAL_NOTICE — DE =====================
('legal_notice', 2, 'de', false, 'Impressum',
$md$# Clubero — Impressum

_Zuletzt aktualisiert: 28. Juni 2026_

## Herausgeber

**Clubero OÜ** — estnische Gesellschaft mit beschränkter Haftung (Osaühing / OÜ).

- Firmenname: Clubero OÜ
- Registernummer (registrikood): **17538695**
- Sitz: Sepapaja tn 6, 15551 Tallinn, Estland
- Gründungsdatum: 25. Juni 2026
- Umsatzsteuer: **Umsatzsteuer nicht anwendbar**
- Tätigkeit: Verlegen von Software (NACE 58.29)
- Kontakt: **hello@clubero.app**
- Website: <https://clubero.app>

Sämtliche Korrespondenz (Rechtliches, Datenschutz, Sicherheit, Missbrauch) wird über **hello@clubero.app** abgewickelt.

## Verantwortlich für die Veröffentlichung

Verantwortlich für die Veröffentlichung ist der gesetzliche Vertreter der Clubero OÜ.

## Hosting und Infrastruktur

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, USA — Anwendungs-Hosting (Workers / Edge-Runtime).
- **Supabase** (Supabase Inc.) — EU-Region — Datenbank-, Authentifizierungs- und Speicher-Backend.
- **Lovable** (Lovable AB) — `lovable.cloud` Build-/Vorschau-Plattform und **Lovable AI Gateway** zur Weiterleitung von KI-Funktionen.

## Geistiges Eigentum

Der Dienst, sein Quellcode, sein Design und seine Markenidentität (einschließlich des Namens und Logos „Clubero") sind ausschließliches Eigentum der Clubero OÜ. Jede Vervielfältigung, Darstellung oder Weiterverwendung ohne vorherige schriftliche Genehmigung ist untersagt.

## Meldung von Missbrauch und Entfernung von Inhalten

Meldungen rechtswidriger oder missbräuchlicher Inhalte können an **hello@clubero.app** gesendet werden. Bitte fügen Sie eine Beschreibung des Inhalts, die URL und den Grund der Meldung bei.

## Streitbeilegung

Für Verbraucherstreitigkeiten steht die Plattform der Europäischen Kommission zur Online-Streitbeilegung unter <https://ec.europa.eu/consumers/odr> zur Verfügung.
$md$),

-- ===================== PARENTAL_CONSENT — DE =====================
('parental_consent', 1, 'de', false, 'Elterliche Einwilligung',
$md$# Clubero — Elterliche Einwilligung

_Zuletzt aktualisiert: 14. Mai 2026_

Diese Seite erläutert die Einwilligungen, die ein Inhaber der elterlichen Sorge erteilt, wenn er ein minderjähriges Kind zu Clubero hinzufügt. Sie ergänzt die Datenschutzerklärung und die Seite „Einwilligung für Fotos und Medien".

## 1. Wer die elterliche Einwilligung erteilen kann

Nur ein Inhaber der **elterlichen Sorge** (Elternteil oder Erziehungsberechtigte(r)) darf im Namen eines Minderjährigen einwilligen. Mit der Erteilung der Einwilligung bestätigen Sie, dass Sie hierzu für das betreffende Kind rechtlich befugt sind.

## 2. Was Sie genehmigen

- Die Erstellung eines Spielerprofils für Ihr Kind (Vor-/Nachname, Geburtsdatum, Trikotnummer, Position, Mannschaft).
- Die Weitergabe dieses Profils an den Betreuerstab des Vereins des Kindes (Administrator, Trainer) sowie an andere Eltern/Spieler derselben Mannschaft, ausschließlich zu Zwecken der Sportorganisation.
- Den Empfang operativer Benachrichtigungen (Aufgebote, Terminänderungen, Anmeldungen, Zahlungen) im Namen des Kindes.

## 3. Einwilligung für Fotos und Medien

Die Anzeige von Fotos und kurzen Videos des Kindes auf Vereins-, Mannschafts- und Veranstaltungsseiten erfordert eine **gesonderte, freiwillige** Einwilligung. Sie können diese jederzeit über das Spielerprofil erteilen oder verweigern. Siehe die Seite **Einwilligung für Fotos und Medien**.

## 4. Kontozugang für das Kind

Das Kind erhält standardmäßig **keine** eigenen Zugangsdaten. Sie können nach eigenem Ermessen die Erstellung eines Kontos im Namen des Kindes genehmigen. In diesem Fall erhält das Kind eine Anmelde-E-Mail, und der Elternteil bleibt der primäre Empfänger wichtiger Mitteilungen.

## 5. Widerruf der Einwilligung

Sie können Ihre Einwilligung jederzeit unter **Profil → Datenschutz** oder über das Spielerprofil widerrufen. Der Widerruf beendet die weitere Verarbeitung für den jeweiligen Zweck und kann dazu führen, dass das Kind von über Clubero organisierten Mannschaftsaktivitäten ausgeschlossen wird.

## 6. Rolle der Erziehungsberechtigten

Bei gemeinsamer elterlicher Sorge können beide Elternteile das Profil des Kindes verwalten. Im Fall von Meinungsverschiedenheiten richtet sich Clubero nach dem registrierten Elternteil, der das Konto erstellt hat, unbeschadet gerichtlicher Entscheidungen, die Sie uns vorlegen können.

## 7. Kontakt

Bei Fragen zu den Daten eines Minderjährigen: **privacy@clubero.app**.
$md$),

-- ===================== MEDIA — DE =====================
('media', 2, 'de', false, 'Einwilligung für Fotos und Medien',
$md$# Clubero — Einwilligung für Fotos und Medien

_Zuletzt aktualisiert: 14. Mai 2026_

Clubero kann Fotos und kurze Videos von Spielern innerhalb des Dienstes anzeigen (Mannschaftskader, Veranstaltungsgalerien, Vereinspinnwand).

## 1. Standardverhalten

Standardmäßig werden Fotos **minderjähriger** Spieler **nicht angezeigt**, bis die elterliche Medieneinwilligung erteilt wurde. Volljährige Spieler verwalten ihre Medieneinwilligung selbst.

## 2. Worin Sie einwilligen

- die Anzeige des Fotos des Spielers auf Vereins-, Mannschafts- und Veranstaltungsseiten, die für authentifizierte Mitglieder des Vereins des Spielers sichtbar sind;
- die Anzeige des Fotos oder eines kurzen Videoclips des Spielers in Veranstaltungsrückblicken und auf der Vereinspinnwand.

## 3. Worin Sie **nicht** einwilligen

- die öffentliche Veröffentlichung außerhalb von Clubero (soziale Netzwerke, Websites) ohne gesonderte Einwilligung;
- die kommerzielle Nutzung, Werbung oder den Verkauf von Bildern;
- Gesichtserkennung, biometrische Verarbeitung oder KI-Training.

## 4. Widerruf der Einwilligung

Sie können die Medieneinwilligung jederzeit unter **Profil → Datenschutz** (für sich selbst) oder über das **Spielerprofil** (für Ihr Kind) widerrufen. Vorhandene Fotos werden innerhalb von 24 Stunden ausgeblendet.

## 5. Gruppenfotos

Gruppenfotos können beiläufig andere Spieler zeigen, die keine Einwilligung erteilt haben. Die Vereine sind dafür verantwortlich, diese Fälle zu behandeln (Zuschneiden, Unkenntlichmachen oder Entfernen auf Anfrage).
$md$),

-- ===================== NOTIFICATIONS — DE =====================
('notifications', 2, 'de', false, 'Einwilligung für Benachrichtigungen',
$md$# Clubero — Benachrichtigungen

_Zuletzt aktualisiert: 14. Mai 2026_

Wir versenden drei Kategorien von Nachrichten.

## 1. Transaktionsbezogen (werden immer versendet)

Kontoerstellung, Passwort-Zurücksetzung, Einladungen, Sicherheitswarnungen, Zahlungsbelege. Diese sind für den Betrieb des Dienstes erforderlich und können nur durch die Schließung Ihres Kontos abbestellt werden.

## 2. Operativ (Einwilligung empfohlen)

Aufgebote, Trainingsaktualisierungen, Veranstaltungserinnerungen, Anwesenheitsabfragen, Vereinsmitteilungen. Sie können diese je Kanal (E-Mail, Push, SMS) unter **Profil → Benachrichtigungen** deaktivieren.

## 3. Optional (Opt-in)

Newsletter, Produktneuigkeiten von Clubero. Standardmäßig deaktiviert.

## 4. Kanäle

E-Mail, In-App, Push, SMS. SMS werden sparsam eingesetzt (z. B. bei kurzfristigen Änderungen) und berücksichtigen die örtlichen Ruhezeiten.

## 5. Kinder

Ein minderjähriges Kind erhält standardmäßig keine Benachrichtigungen. Eltern können die Weiterleitung von Benachrichtigungen an das Kind aktivieren, sofern es über ein eigenes Konto verfügt.
$md$),

-- ===================== MEDIA — ES =====================
('media', 2, 'es', false, 'Consentimiento de fotos y medios',
$md$# Clubero — Consentimiento de fotos y medios

_Última actualización: 14 de mayo de 2026_

Clubero puede mostrar fotos y vídeos breves de los jugadores dentro del Servicio (plantillas de equipos, galerías de eventos, muro del club).

## 1. Comportamiento por defecto

Por defecto, las fotos de los jugadores **menores de edad** **no se muestran** hasta que se otorga el consentimiento parental de medios. Los jugadores adultos gestionan su propio consentimiento de medios.

## 2. A qué das tu consentimiento

- a que se muestre la foto del jugador en las páginas del club, del equipo y de los eventos, visibles para los miembros autenticados del club del jugador;
- a que se muestre la foto o un vídeo breve del jugador en los resúmenes de eventos y en el muro del club.

## 3. A qué **no** das tu consentimiento

- a la publicación pública fuera de Clubero (redes sociales, sitios web) sin un consentimiento adicional;
- al uso comercial, publicitario o a la venta de imágenes;
- al reconocimiento facial, al tratamiento biométrico o al entrenamiento de inteligencia artificial.

## 4. Retirada del consentimiento

Puedes retirar el consentimiento de medios en cualquier momento desde **Perfil → Privacidad** (para ti) o desde el **perfil del jugador** (para tu hijo o hija). Las fotos existentes se ocultarán en un plazo de 24 horas.

## 5. Fotos de grupo

Las fotos de grupo pueden incluir de forma incidental a otros jugadores que no hayan otorgado su consentimiento. Los Clubes son responsables de gestionar estos casos (recorte, difuminado o eliminación previa solicitud).
$md$),

-- ===================== NOTIFICATIONS — ES =====================
('notifications', 2, 'es', false, 'Consentimiento de notificaciones',
$md$# Clubero — Notificaciones

_Última actualización: 14 de mayo de 2026_

Enviamos tres categorías de mensajes.

## 1. Transaccionales (siempre se envían)

Creación de cuenta, restablecimiento de contraseña, invitaciones, alertas de seguridad, recibos de pago. Son necesarios para operar el Servicio y no es posible desactivarlos sin cerrar tu cuenta.

## 2. Operativos (consentimiento recomendado)

Convocatorias, actualizaciones de entrenamientos, recordatorios de eventos, solicitudes de asistencia, anuncios del Club. Puedes desactivarlos por canal (correo electrónico, push, SMS) desde **Perfil → Notificaciones**.

## 3. Opcionales (previa aceptación)

Boletines informativos y novedades de producto de Clubero. Desactivados por defecto.

## 4. Canales

Correo electrónico, dentro de la aplicación, push y SMS. Los SMS se utilizan con moderación (p. ej., cambios de última hora) y respetan las franjas horarias locales de descanso.

## 5. Menores

Un hijo menor de edad no recibe notificaciones por defecto. El padre/madre o tutor legal puede activar el reenvío de notificaciones al menor si este dispone de una cuenta personal.
$md$),

-- ===================== MEDIA — IT =====================
('media', 2, 'it', false, 'Consenso per foto e media',
$md$# Clubero — Consenso per foto e media

_Ultimo aggiornamento: 14 maggio 2026_

Clubero può visualizzare foto e brevi video dei giocatori all'interno del Servizio (rose delle squadre, gallerie degli eventi, bacheca della società).

## 1. Comportamento predefinito

Per impostazione predefinita, le foto dei giocatori **minorenni** **non vengono visualizzate** finché il genitore o tutore legale non ha prestato il consenso relativo ai media. I giocatori maggiorenni gestiscono autonomamente il proprio consenso relativo ai media.

## 2. Oggetto del consenso

- la visualizzazione della foto del giocatore sulle pagine della società, della squadra e degli eventi, visibili ai membri autenticati della società sportiva del giocatore;
- la visualizzazione della foto o di brevi video del giocatore nei riepiloghi degli eventi e nella bacheca della società.

## 3. Ciò a cui **non** acconsentite

- la pubblicazione al di fuori di Clubero (social network, siti web) senza un consenso separato;
- l'uso commerciale, pubblicitario o la vendita delle immagini;
- il riconoscimento facciale, il trattamento di dati biometrici o l'addestramento di sistemi di intelligenza artificiale.

## 4. Revoca del consenso

Potete revocare il consenso relativo ai media in qualsiasi momento da **Profilo → Privacy** (per voi stessi) o dal **profilo del giocatore** (per vostro figlio). Le foto esistenti saranno nascoste entro 24 ore.

## 5. Foto di gruppo

Le foto di gruppo possono includere incidentalmente altri giocatori che non hanno prestato il consenso. Le società sportive sono responsabili della gestione di tali casi (ritaglio, sfocatura o rimozione su richiesta).
$md$),

-- ===================== NOTIFICATIONS — IT =====================
('notifications', 2, 'it', false, 'Consenso per le notifiche',
$md$# Clubero — Notifiche

_Ultimo aggiornamento: 14 maggio 2026_

Inviamo tre categorie di messaggi.

## 1. Transazionali (sempre inviati)

Creazione dell'account, reimpostazione della password, inviti, avvisi di sicurezza, ricevute di pagamento. Sono necessari al funzionamento del Servizio e non è possibile disattivarli senza chiudere l'account.

## 2. Operativi (consenso raccomandato)

Convocazioni, aggiornamenti sugli allenamenti, promemoria degli eventi, richieste di presenza, comunicazioni della società. Potete disattivarli per singolo canale (email, push, SMS) da **Profilo → Notifiche**.

## 3. Facoltativi (su adesione)

Newsletter, aggiornamenti sui prodotti Clubero. Disattivati per impostazione predefinita.

## 4. Canali

Email, in-app, push, SMS. Gli SMS sono utilizzati con moderazione (ad es. per modifiche dell'ultimo minuto) e nel rispetto delle fasce orarie di riposo locali.

## 5. Minori

Un minore non riceve notifiche per impostazione predefinita. Il genitore o tutore legale può scegliere di inoltrare le notifiche al minore, qualora questi disponga di un account personale.
$md$),

-- ===================== MEDIA — NL =====================
('media', 2, 'nl', false, 'Toestemming voor foto''s en media',
$md$# Clubero — Toestemming voor foto's en media

_Laatst bijgewerkt: 14 mei 2026_

Clubero kan foto's en korte video's van spelers tonen binnen de Dienst (teamoverzichten, evenementgalerijen, clubprikbord).

## 1. Standaardgedrag

Standaard worden foto's van **minderjarige** spelers **niet getoond** totdat een ouder of wettelijke voogd mediatoestemming heeft gegeven. Volwassen spelers beheren hun eigen mediatoestemming.

## 2. Waarvoor je toestemming geeft

- het tonen van de foto van de speler op club-, team- en evenementpagina's die zichtbaar zijn voor ingelogde leden van de club van de speler;
- het tonen van de foto of een korte videoclip van de speler in evenementverslagen en op het clubprikbord.

## 3. Waarvoor je **geen** toestemming geeft

- openbare publicatie buiten Clubero (sociale netwerken, websites) zonder afzonderlijke toestemming;
- commercieel gebruik, reclame of verkoop van beelden;
- gezichtsherkenning, biometrische verwerking of het trainen van AI.

## 4. Toestemming intrekken

Je kunt je mediatoestemming op elk moment intrekken via **Profiel → Privacy** (voor jezelf) of via het **profiel van de speler** (voor je kind). Bestaande foto's worden binnen 24 uur verborgen.

## 5. Groepsfoto's

Op groepsfoto's kunnen onbedoeld ook andere spelers staan die geen toestemming hebben gegeven. Clubs zijn verantwoordelijk voor het afhandelen van deze gevallen (bijsnijden, vervagen of verwijderen op verzoek).
$md$),

-- ===================== NOTIFICATIONS — NL =====================
('notifications', 2, 'nl', false, 'Toestemming voor meldingen',
$md$# Clubero — Meldingen

_Laatst bijgewerkt: 14 mei 2026_

We versturen drie categorieën berichten.

## 1. Transactioneel (altijd verzonden)

Accountaanmaak, wachtwoordherstel, uitnodigingen, beveiligingsmeldingen, betalingsbewijzen. Deze zijn noodzakelijk om de Dienst te kunnen leveren en kun je niet uitschakelen zonder je account op te heffen.

## 2. Operationeel (toestemming aanbevolen)

Selectieoproepen, trainingsupdates, herinneringen voor evenementen, aanwezigheidsverzoeken, clubmededelingen. Je kunt deze per kanaal (e-mail, push, sms) uitschakelen via **Profiel → Meldingen**.

## 3. Optioneel (opt-in)

Nieuwsbrieven, productupdates van Clubero. Standaard uitgeschakeld.

## 4. Kanalen

E-mail, in-app, push, sms. Sms wordt spaarzaam gebruikt (bijv. bij last-minute wijzigingen) en houdt rekening met lokale stiltetijden.

## 5. Kinderen

Een minderjarig kind ontvangt standaard geen meldingen. Ouders kunnen ervoor kiezen meldingen door te sturen naar het kind als het een eigen account heeft.
$md$),

-- ===================== MEDIA — PT =====================
('media', 2, 'pt', false, 'Consentimento para fotografias e média',
$md$# Clubero — Consentimento para fotografias e média

_Última atualização: 14 de maio de 2026_

O Clubero pode apresentar fotografias e vídeos curtos dos jogadores no âmbito do Serviço (plantéis das equipas, galerias de eventos, mural do clube).

## 1. Comportamento por defeito

Por defeito, as fotografias dos jogadores **menores** **não são apresentadas** enquanto não for concedido o consentimento parental para média. Os jogadores maiores de idade gerem o seu próprio consentimento para média.

## 2. O que consente

- a apresentação da fotografia do jogador nas páginas do clube, da equipa e dos eventos, visíveis para os membros autenticados do clube do jogador;
- a apresentação da fotografia ou de um vídeo curto do jogador nos resumos de eventos e no mural do clube.

## 3. O que **não** consente

- a publicação pública fora do Clubero (redes sociais, sítios web) sem um consentimento distinto;
- a utilização comercial, publicitária ou a venda de imagens;
- o reconhecimento facial, o tratamento de dados biométricos ou o treino de inteligência artificial.

## 4. Retirada do consentimento

Pode retirar o consentimento para média a qualquer momento em **Perfil → Privacidade** (para si próprio) ou no **perfil do jogador** (para o seu filho). As fotografias existentes serão ocultadas no prazo de 24 horas.

## 5. Fotografias de grupo

As fotografias de grupo podem incluir, de forma incidental, outros jogadores que não tenham concedido o seu consentimento. Cabe aos clubes tratar estes casos (recorte, desfocagem ou remoção mediante pedido).
$md$),

-- ===================== NOTIFICATIONS — PT =====================
('notifications', 2, 'pt', false, 'Consentimento para notificações',
$md$# Clubero — Notificações

_Última atualização: 14 de maio de 2026_

Enviamos três categorias de mensagens.

## 1. Transacionais (envio obrigatório)

Criação de conta, redefinição da palavra-passe, convites, alertas de segurança, recibos de pagamento. Estas mensagens são necessárias ao funcionamento do Serviço e não podem ser recusadas sem o encerramento da sua conta.

## 2. Operacionais (consentimento recomendado)

Convocatórias, atualizações de treinos, lembretes de eventos, pedidos de confirmação de presença, comunicados do clube. Pode desativar estas mensagens por canal (email, push, SMS) em **Perfil → Notificações**.

## 3. Facultativas (mediante adesão)

Newsletters e novidades sobre o produto Clubero. Desativadas por defeito.

## 4. Canais

Email, na aplicação, push, SMS. O SMS é utilizado com moderação (por exemplo, alterações de última hora) e respeita os períodos de descanso locais.

## 5. Crianças

Uma criança menor não recebe notificações por defeito. O pai/mãe ou representante legal pode optar por reencaminhar as notificações para a criança, caso esta seja titular de uma conta pessoal.
$md$)

ON CONFLICT (kind, version, locale) DO NOTHING;