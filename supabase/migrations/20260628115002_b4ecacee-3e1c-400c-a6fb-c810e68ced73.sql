-- =====================================================================
-- Legal documents — Italian (it) translations  [DRAFT]
-- =====================================================================

-- 1) legal_notice v2 it
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('legal_notice', 2, 'it', false, 'Note legali',
$body$> **BOZZA — NON REVISIONATA LEGALMENTE.** Traduzione assistita da macchina, revisione legale in attesa.

# Clubero — Note legali

_Ultimo aggiornamento: 28 giugno 2026_

## Editore

**Clubero OÜ** — società a responsabilità limitata di diritto estone (Osaühing / OÜ).

- Denominazione: Clubero OÜ
- Numero di registro (registrikood): **17538695**
- Sede legale: Sepapaja tn 6, 15551 Tallinn, Estonia
- Data di costituzione: 25 giugno 2026
- IVA: **Nessuna IVA addebitata** — Clubero OÜ non è attualmente registrata ai fini IVA.
- Attività: società di software — piattaforma SaaS per società sportive (NACE 58.29)
- Contatto: **hello@clubero.app**
- Sito web: <https://clubero.app>

Tutta la corrispondenza (legale, privacy, sicurezza, abusi) è gestita tramite **hello@clubero.app**.

## Responsabile della pubblicazione

Il responsabile della pubblicazione è il rappresentante legale di Clubero OÜ.

## Hosting e infrastruttura

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, USA — hosting dell'applicazione (Workers / runtime edge).
- **Supabase** (Supabase Inc.) — regione UE — database, autenticazione e archiviazione.
- **Lovable** (Lovable AB) — piattaforma di sviluppo e hosting, nonché gateway AI per la distribuzione delle funzionalità di intelligenza artificiale.

## Proprietà intellettuale

Il Servizio, il suo codice sorgente, il suo design e la sua identità di marca (compresi il nome e il logo «Clubero») sono di proprietà esclusiva di Clubero OÜ. È vietata qualsiasi riproduzione, rappresentazione o riutilizzo senza previa autorizzazione scritta.

## Segnalazione di abusi e rimozione di contenuti

Le segnalazioni di contenuti illeciti o abusivi possono essere inviate a **hello@clubero.app**. Indicare la descrizione del contenuto, l'URL e il motivo della segnalazione.

## Risoluzione delle controversie

Per le controversie con i consumatori, la piattaforma di Risoluzione delle Controversie Online della Commissione europea è disponibile all'indirizzo <https://ec.europa.eu/consumers/odr>.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 2) terms v4 it
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('terms', 4, 'it', true, 'Condizioni generali di utilizzo di Clubero',
$body$> **BOZZA — NON REVISIONATA LEGALMENTE.** Traduzione assistita da macchina, revisione legale in attesa.

# Condizioni generali di utilizzo di Clubero

_Ultimo aggiornamento: 28 giugno 2026_

Benvenuti su **Clubero** («Clubero», «noi»), piattaforma SaaS gestita da **Clubero OÜ**, società a responsabilità limitata di diritto estone (registrikood **17538695**), con sede in Sepapaja tn 6, 15551 Tallinn, Estonia. Nessuna IVA è addebitata (Clubero OÜ non è attualmente registrata ai fini IVA). Le presenti condizioni d'uso («Condizioni») disciplinano l'accesso e l'utilizzo delle applicazioni web e mobile, dei siti web e dei servizi correlati di Clubero (collettivamente, il «Servizio»).

Creando un account o utilizzando il Servizio, l'utente accetta le presenti Condizioni.

## 1. Panoramica della piattaforma

Clubero aiuta società sportive, allenatori, genitori e giocatori a gestire le squadre, comunicare, organizzare partite e allenamenti, gestire iscrizioni e pagamenti, condividere documenti e ricevere notifiche.

## 2. Creazione dell'account

- È necessario fornire informazioni veritiere al momento della creazione dell'account.
- L'utente è responsabile della riservatezza delle proprie credenziali.
- È necessario avere almeno **18 anni** per creare e gestire autonomamente un account. Le persone di età inferiore a 18 anni possono utilizzare Clubero solo tramite un account creato e supervisionato da un titolare della responsabilità genitoriale (cfr. §4 e la pagina relativa al consenso dei genitori).

## 3. Ruoli utente

Il Servizio supporta più ruoli: **amministratore del club**, **allenatore / responsabile**, **genitore / rappresentante legale**, **giocatore** e **amministratore della piattaforma**. Ogni ruolo dispone di autorizzazioni definite all'interno del Servizio. L'utente si impegna a utilizzare il Servizio esclusivamente nell'ambito del ruolo che gli è stato assegnato.

## 4. Minori

Un giocatore minorenne può essere aggiunto esclusivamente da un titolare della responsabilità genitoriale, che fornisce i consensi genitoriali richiesti (cfr. la pagina relativa al consenso dei genitori). Il genitore è il destinatario prioritario delle notifiche riguardanti il minore. Il minore disporrà di un proprio accesso solo se il genitore lo autorizza espressamente.

## 5. Uso consentito

L'utente si impegna a non:

- caricare contenuti illeciti, di odio, molesti, diffamatori o sessualmente espliciti;
- raccogliere o diffondere dati personali di altri utenti senza il loro consenso;
- alterare, decompilare, sottoporre a scraping o attaccare il Servizio;
- impersonare una persona o un club;
- utilizzare il Servizio per inviare comunicazioni commerciali non richieste.

I contenuti o gli account che violano queste regole possono essere rimossi o sospesi.

## 6. Pagamenti

Alcune funzionalità (iscrizioni, pagamenti di eventi, raccolte fondi) possono comportare pagamenti elaborati da **Stripe**. Stripe è il fornitore di pagamento; Clubero non memorizza mai i dati completi della carta. Rimborsi, contestazioni e obblighi fiscali sono disciplinati dalle politiche del club interessato e dalla legge applicabile. Eventuali commissioni di servizio sono mostrate prima del pagamento.

## 7. Disponibilità del Servizio

Puntiamo a un'elevata disponibilità, ma non garantiamo un Servizio ininterrotto o privo di errori. Possiamo effettuare interventi di manutenzione, pubblicare aggiornamenti o modificare le funzionalità in qualsiasi momento.

## 8. Sospensione e cessazione

Possiamo sospendere o terminare l'accesso al Servizio in caso di violazione delle presenti Condizioni, di obbligo di legge o di necessità di tutelare gli utenti. L'utente può eliminare il proprio account in qualsiasi momento da **Profilo → Privacy** (cfr. anche il §10 dell'Informativa sulla Privacy).

## 9. Limitazione di responsabilità

Nei limiti consentiti dalla legge, Clubero non è responsabile per danni indiretti, accidentali o consequenziali, perdita di dati, mancato profitto o perdita di opportunità. La nostra responsabilità totale per qualsiasi reclamo è limitata agli importi che l'utente ci ha versato per il Servizio nei dodici mesi precedenti il reclamo.

## 10. Proprietà intellettuale

Clubero, i suoi loghi e il suo software sono protetti dalle leggi sulla proprietà intellettuale. L'utente conserva la titolarità dei contenuti caricati e concede a Clubero una licenza limitata per ospitarli e visualizzarli al fine di gestire il Servizio.

## 11. Legge applicabile

Le presenti Condizioni sono disciplinate dalla legge estone. Le controversie sono soggette alla giurisdizione esclusiva dei tribunali competenti dell'Estonia (Harju Maakohus, Tallinn), fatte salve le disposizioni imperative di tutela dei consumatori del Paese di residenza dell'utente.

## 12. Modifiche

Possiamo modificare le presenti Condizioni. Qualsiasi modifica sostanziale sarà comunicata almeno 14 giorni prima della sua entrata in vigore, nell'applicazione e via e-mail. L'utilizzo continuato dopo la data di efficacia costituisce accettazione.

## 13. Contatti

Per qualsiasi domanda relativa alle presenti Condizioni: **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallinn, Estonia.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 3) privacy v4 it
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 4, 'it', true, 'Informativa sulla Privacy',
$body$> **BOZZA — NON REVISIONATA LEGALMENTE.** Traduzione assistita da macchina, revisione legale in attesa.

# Clubero — Informativa sulla Privacy

_Ultimo aggiornamento: 28 giugno 2026_

Clubero è gestito da **Clubero OÜ** (registrikood **17538695**, Sepapaja tn 6, 15551 Tallinn, Estonia), titolare del trattamento dei dati personali trattati tramite il Servizio. La presente Informativa sulla Privacy descrive quali dati raccogliamo, per quale finalità e quali diritti l'utente può esercitare ai sensi del **Regolamento Generale sulla Protezione dei Dati (RGPD)**.

## 1. Dati raccolti

- **Dati dell'account**: nome, e-mail, telefono, password (hashata), avatar, lingua, ruolo.
- **Dati del giocatore**: nome e cognome, data di nascita, numero di maglia, ruolo in campo, foto (con consenso), squadra/e.
- **Collegamenti genitore/figlio**: relazione tra il genitore e il giocatore minorenne.
- **Dati del club e della squadra**: appartenenza, ruolo nel club, assegnazioni alle squadre.
- **Dati operativi**: eventi, presenze, iscrizioni, formazioni, messaggi, allegati.
- **Metadati di pagamento**: importi, stato, riferimenti — i dati completi della carta sono trattati da **Stripe** e mai memorizzati da noi.
- **Dati tecnici**: indirizzo IP, user agent, informazioni sul dispositivo, log (sicurezza e debug).

**Non** raccogliamo dati biometrici, dati sanitari, né punteggi comportamentali, e **non** effettuiamo alcuna profilazione tramite IA dei minori.

## 2. Finalità del trattamento

| Finalità | Base giuridica |
|---|---|
| Erogazione e funzionamento del Servizio | Contratto (Art. 6.1.b) |
| Gestione degli account dei minori | Consenso genitoriale (Art. 6.1.a + Art. 8) |
| Invio di e-mail e notifiche | Contratto / Consenso |
| Elaborazione dei pagamenti tramite Stripe | Contratto |
| Sicurezza, prevenzione delle frodi, audit | Obbligo di legge, interesse legittimo |
| Adempimento degli obblighi di legge | Obbligo di legge (Art. 6.1.c) |

## 3. Principi RGPD rispettati

Liceità, correttezza, trasparenza · Limitazione della finalità · Minimizzazione dei dati · Esattezza · Limitazione della conservazione · Integrità e riservatezza · Responsabilizzazione.

## 4. Minori e responsabilità genitoriale

L'articolo 8 del RGPD consente agli Stati membri di fissare tra i 13 e i 16 anni l'età minima a partire dalla quale un minore può prestare autonomamente il consenso al trattamento nei servizi della società dell'informazione (a titolo informativo: 13 in Estonia, 14 in Italia, 15 in Francia, 16 in Lussemburgo). Clubero applica deliberatamente una soglia unica e più rigorosa in tutti i Paesi: **ogni persona di età inferiore a 18 anni è considerata minorenne** e può utilizzare Clubero esclusivamente tramite un account creato e supervisionato da un titolare della responsabilità genitoriale, che presta il consenso genitoriale e può revocarlo in qualsiasi momento da **Profilo → Privacy** o dal profilo del giocatore. Clubero non si basa su un consenso autonomo del minore alle età nazionali inferiori. Cfr. la pagina dedicata al **consenso dei genitori**.

## 5. Periodi di conservazione

| Dati | Durata |
|---|---|
| Account attivo | Durata dell'account + 30 giorni dopo la richiesta di cancellazione |
| Giocatori che hanno lasciato il club | 1 stagione sportiva a fini statistici |
| Messaggi e allegati | 24 mesi |
| Log di audit | 12 mesi |
| Prove di consenso | 5 anni dopo la revoca |
| Dati di pagamento | Secondo gli obblighi fiscali e contabili |

## 6. I tuoi diritti

Ai sensi del RGPD, all'utente sono riconosciuti i seguenti diritti:

- **Accesso** (Art. 15) — scarica i tuoi dati da **Profilo → Privacy → Scarica i miei dati**.
- **Rettifica** (Art. 16) — modifica il tuo profilo o quello di tuo figlio.
- **Cancellazione** (Art. 17) — richiedi la cancellazione del tuo account (periodo di grazia di 30 giorni, poi anonimizzazione).
- **Limitazione / Opposizione** (Art. 18 / 21) — revoca i tuoi consensi.
- **Portabilità** (Art. 20) — le esportazioni sono fornite in formato JSON.
- **Reclamo** — presso l'autorità di controllo competente. L'autorità capofila di Clubero è l'autorità estone per la protezione dei dati (**Andmekaitse Inspektsioon**); è inoltre possibile rivolgersi alla propria autorità nazionale (ad esempio, Garante per la protezione dei dati personali in Italia, CNIL in Francia, CNPD in Lussemburgo).

## 7. Cancellazione ed esportazione dei dati

- **Esportazione**: su richiesta viene generato un archivio JSON contenente i tuoi dati e quelli dei tuoi figli minorenni.
- **Cancellazione**: le richieste sono programmate con un periodo di grazia di 30 giorni; successivamente, i tuoi identificatori personali sono sostituiti da marcatori anonimi e i contenuti sono scollegati dalla tua identità. Le statistiche aggregate del club possono essere conservate.

## 8. Cookie e analisi

Utilizziamo un numero minimo di cookie e di archiviazione locale strettamente necessari per l'autenticazione, la sicurezza e la conservazione delle preferenze. **Non** utilizziamo tracker pubblicitari né cookie pubblicitari di terze parti. Qualsiasi futura misurazione del traffico rispetterà la privacy e sarà documentata in questa pagina.

## 9. Responsabili del trattamento

Ci avvaliamo di un numero limitato di responsabili del trattamento di fiducia: **Supabase / hosting database e autenticazione** (regione UE), **Stripe** (pagamenti), **fornitori di e-mail e SMS** (notifiche), **hosting cloud** (Cloudflare) e **Lovable** (Lovable AB) come piattaforma di sviluppo e hosting nonché gateway AI per instradare le funzionalità di intelligenza artificiale (transito di prompt e metadati). L'elenco aggiornato è disponibile su richiesta a **hello@clubero.app**.

## 10. Trasferimenti internazionali di dati

I dati sono memorizzati nell'**Unione Europea**. Quando un responsabile del trattamento tratta dati al di fuori dell'UE, i trasferimenti sono disciplinati da clausole contrattuali tipo o garanzie equivalenti.

## 11. Sicurezza

Cifratura in transito (TLS), cifratura a riposo, controllo degli accessi basato sui ruoli, log di audit e chiavi a privilegio minimo. Nonostante i nostri sforzi, nessun servizio è sicuro al 100 %; segnalare eventuali vulnerabilità a **hello@clubero.app**.

## 12. Segnalare un abuso

Per segnalare contenuti abusivi, molestie o un problema di sicurezza: **hello@clubero.app**. Rispondiamo entro 5 giorni lavorativi.

## 13. Contatti

Titolare del trattamento: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estonia. Richieste in materia di protezione dei dati e altre domande: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 4) data_processing v2 it
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('data_processing', 2, 'it', true, 'Accordo sul trattamento dei dati',
$body$> **BOZZA — NON REVISIONATA LEGALMENTE.** Traduzione assistita da macchina, revisione legale in attesa.

# Clubero — Trattamento dei dati

_Ultimo aggiornamento: 28 giugno 2026_

Il presente documento integra l'Informativa sulla Privacy e descrive in che modo Clubero tratta i dati personali per conto dei club e degli utenti.

## 1. Ruoli

- **Clubero OÜ** è **Titolare del trattamento** dei dati di account, autenticazione, fatturazione e piattaforma.
- Per i dati operativi propri di ciascun club (rosa, eventi, messaggi), Clubero agisce come **Responsabile del trattamento** per il club, che in tale ambito è Titolare.

## 2. Categorie di dati

Identificazione, contatti, ruolo, presenze, comunicazione, allegati, metadati di pagamento. Nessun dato biometrico, sanitario, né profilazione dei minori.

## 3. Sub-responsabili

Cfr. il §9 dell'Informativa sulla Privacy. I club sono informati dei nuovi sub-responsabili e possono opporsi per motivi legittimi.

## 4. Misure di sicurezza

Cifratura in transito e a riposo, controllo degli accessi basato sui ruoli, log di audit, chiavi di servizio a privilegio minimo, separazione degli ambienti di test e produzione, aggiornamento regolare delle dipendenze.

## 5. Richieste degli interessati

Clubero assiste i club nel rispondere alle richieste degli interessati (accesso, rettifica, cancellazione, portabilità) entro i termini di legge.

## 6. Notifica delle violazioni

Clubero notifica ai club e agli utenti interessati senza ingiustificato ritardo e entro 72 ore dalla conoscenza di una violazione di dati personali, conformemente all'Art. 33 del RGPD.

## 7. Fine del trattamento

Al termine, i dati del club sono cancellati o restituiti entro 30 giorni, salvo obbligo di conservazione di legge.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 5) parental_consent v1 it
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('parental_consent', 1, 'it', false, 'Consenso dei genitori',
$body$> **BOZZA — NON REVISIONATA LEGALMENTE.** Traduzione assistita da macchina, revisione legale in attesa.

# Clubero — Consenso dei genitori

_Ultimo aggiornamento: 28 giugno 2026_

La presente pagina descrive i consensi prestati da un titolare della responsabilità genitoriale al momento dell'aggiunta di un minore a Clubero. Integra l'Informativa sulla Privacy e la pagina relativa al consenso per foto e contenuti multimediali.

## 1. Chi può prestare il consenso dei genitori

Solo un titolare della **responsabilità genitoriale** (genitore o rappresentante legale) può prestare il consenso a nome di un minore. Prestando il consenso, dichiari di esserne legalmente legittimato per il minore in questione.

## 2. Cosa autorizzi

- La creazione di un profilo giocatore per tuo figlio (nome e cognome, data di nascita, numero di maglia, ruolo, squadra).
- La condivisione di tale profilo con lo staff del club del minore (amministratore, allenatore) e con gli altri genitori/giocatori della stessa squadra, esclusivamente per finalità di organizzazione sportiva.
- La ricezione delle notifiche operative (convocazioni, modifiche di orario, iscrizioni, pagamenti) a nome del minore.

## 3. Consenso per foto e contenuti multimediali

La pubblicazione di foto e brevi video del minore nelle pagine del club, della squadra e degli eventi richiede un consenso **distinto e facoltativo**. Puoi prestarlo o negarlo in qualsiasi momento dal profilo del giocatore. Cfr. la pagina **Consenso per foto e contenuti multimediali**.

## 4. Accesso all'account per il minore

Per impostazione predefinita, il minore **non** riceve credenziali proprie. Puoi, a tua discrezione, autorizzare la creazione di un account a nome del minore. In tal caso, il minore riceverà un'e-mail di accesso e il genitore resterà il destinatario prioritario delle comunicazioni importanti.

## 5. Revoca del consenso

Puoi revocare il tuo consenso in qualsiasi momento da **Profilo → Privacy** o dal profilo del giocatore. La revoca pone fine al trattamento corrispondente e può comportare la rimozione del minore dalle attività di squadra organizzate tramite Clubero.

## 6. Ruolo dei rappresentanti legali

Quando la responsabilità genitoriale è esercitata congiuntamente, entrambi i genitori possono gestire il profilo del minore. In caso di disaccordo, Clubero si basa sul genitore registrato che ha creato l'account, fatto salvo qualsiasi provvedimento giudiziario che tu ci fornisca.

## 7. Contatti

Per qualsiasi domanda sui dati di un minore: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();