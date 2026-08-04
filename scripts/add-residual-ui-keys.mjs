#!/usr/bin/env node
/**
 * Add residual missing i18n keys (FR source + EN/EU translations) into locale JSON.
 */
import fs from "node:fs";
import path from "node:path";

const LOCALES = ["fr", "en", "de", "es", "it", "nl", "pt"];
const ROOT = "src/locales";

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepGet(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** ns -> key -> { fr, en, de, es, it, nl, pt } */
const KEYS = {
  common: {
    "cockpit.alerts.missingReferee": {
      fr: "Arbitre manquant (démarrage dans {{minutes}} min)",
      en: "Missing referee (starts in {{minutes}} min)",
      de: "Schiedsrichter fehlt (Start in {{minutes}} Min.)",
      es: "Árbitro ausente (empieza en {{minutes}} min)",
      it: "Arbitro mancante (inizio tra {{minutes}} min)",
      nl: "Scheidsrechter ontbreekt (start over {{minutes}} min)",
      pt: "Árbitro em falta (começa em {{minutes}} min)",
    },
    "cockpit.alerts.title": {
      fr: "{{count}} chose à régler",
      en: "{{count}} item to resolve",
      de: "{{count}} Punkt zu klären",
      es: "{{count}} asunto por resolver",
      it: "{{count}} cosa da sistemare",
      nl: "{{count}} ding om te regelen",
      pt: "{{count}} assunto a resolver",
    },
    "events.commCard.subtitle": {
      fr: "{{count}} joueurs convoqués",
      en: "{{count}} players called up",
      de: "{{count}} Spieler einberufen",
      es: "{{count}} jugadores convocados",
      it: "{{count}} giocatori convocati",
      nl: "{{count}} spelers opgeroepen",
      pt: "{{count}} jogadores convocados",
    },
    "events.resend.buttonWithChangesAll": {
      fr: "Renvoyer à tous les joueurs ({{count}} mise(s) à jour)",
      en: "Resend to all players ({{count}} update(s))",
      de: "An alle Spieler erneut senden ({{count}} Aktualisierung(en))",
      es: "Reenviar a todos los jugadores ({{count}} actualización(es))",
      it: "Invia di nuovo a tutti i giocatori ({{count}} aggiornamento/i)",
      nl: "Opnieuw sturen naar alle spelers ({{count}} update(s))",
      pt: "Reenviar a todos os jogadores ({{count}} atualização(ões))",
    },
    "eventWizard.meetingPreview.countShort": {
      fr: "{{count}} personne(s) sélectionnée(s)",
      en: "{{count}} person(s) selected",
      de: "{{count}} Person(en) ausgewählt",
      es: "{{count}} persona(s) seleccionada(s)",
      it: "{{count}} persona/e selezionata/e",
      nl: "{{count}} persoon/personen geselecteerd",
      pt: "{{count}} pessoa(s) selecionada(s)",
    },
    "eventWizard.meetingSummary.title": {
      fr: "Convoqués · {{count}}",
      en: "Invitees · {{count}}",
      de: "Eingeladene · {{count}}",
      es: "Convocados · {{count}}",
      it: "Convocati · {{count}}",
      nl: "Opgeroepen · {{count}}",
      pt: "Convocados · {{count}}",
    },
    "eventWizard.recap.series": {
      fr: "série {{count}}",
      en: "series {{count}}",
      de: "Serie {{count}}",
      es: "serie {{count}}",
      it: "serie {{count}}",
      nl: "reeks {{count}}",
      pt: "série {{count}}",
    },
    "eventWizard.series.preview": {
      fr: "Créer {{count}} entraînements",
      en: "Create {{count}} trainings",
      de: "{{count}} Trainings erstellen",
      es: "Crear {{count}} entrenamientos",
      it: "Crea {{count}} allenamenti",
      nl: "{{count}} trainingen aanmaken",
      pt: "Criar {{count}} treinos",
    },
    "eventWizard.seriesCreated": {
      fr: "{{count}} événements créés",
      en: "{{count}} events created",
      de: "{{count}} Ereignisse erstellt",
      es: "{{count}} eventos creados",
      it: "{{count}} eventi creati",
      nl: "{{count}} evenementen aangemaakt",
      pt: "{{count}} eventos criados",
    },
    "flights.draftRulesSummary": {
      fr: "{{n}} règle(s) de qualification configurée(s)",
      en: "{{n}} qualification rule(s) configured",
      de: "{{n}} Qualifikationsregel(n) konfiguriert",
      es: "{{n}} regla(s) de clasificación configurada(s)",
      it: "{{n}} regola/e di qualificazione configurata/e",
      nl: "{{n}} kwalificatieregel(s) geconfigureerd",
      pt: "{{n}} regra(s) de qualificação configurada(s)",
    },
    "flights.generatedToast": {
      fr: "{{n}} matchs créés",
      en: "{{n}} matches created",
      de: "{{n}} Spiele erstellt",
      es: "{{n}} partidos creados",
      it: "{{n}} partite create",
      nl: "{{n}} wedstrijden aangemaakt",
      pt: "{{n}} jogos criados",
    },
    "flights.wizard.distribution": {
      fr: "Répartition ({{n}} équipes)",
      en: "Distribution ({{n}} teams)",
      de: "Aufteilung ({{n}} Teams)",
      es: "Reparto ({{n}} equipos)",
      it: "Ripartizione ({{n}} squadre)",
      nl: "Verdeling ({{n}} teams)",
      pt: "Distribuição ({{n}} equipas)",
    },
    "heatmap.lastWeeks": {
      fr: "{{n}} dernières semaines",
      en: "Last {{n}} weeks",
      de: "Letzte {{n}} Wochen",
      es: "Últimas {{n}} semanas",
      it: "Ultime {{n}} settimane",
      nl: "Laatste {{n}} weken",
      pt: "Últimas {{n}} semanas",
    },
    "meetings.confirmRemove.confirm": {
      fr: "Retirer quand même",
      en: "Remove anyway",
      de: "Trotzdem entfernen",
      es: "Quitar de todos modos",
      it: "Rimuovi comunque",
      nl: "Toch verwijderen",
      pt: "Remover mesmo assim",
    },
    "meetings.confirmRemove.desc": {
      fr: "Ces personnes ont déjà répondu ou été pointées. Les retirer supprimera aussi leur réponse et leur présence enregistrées. Elles restent convoquées tant que vous ne confirmez pas.",
      en: "These people have already replied or been marked present. Removing them will also delete their recorded reply and attendance. They stay invited until you confirm.",
      de: "Diese Personen haben bereits geantwortet oder wurden erfasst. Beim Entfernen werden auch Antwort und Anwesenheit gelöscht. Sie bleiben eingeladen, bis Sie bestätigen.",
      es: "Estas personas ya han respondido o han sido registradas. Al quitarlas también se eliminará su respuesta y asistencia. Siguen convocadas hasta que confirmes.",
      it: "Queste persone hanno già risposto o sono state registrate. Rimuoverle cancella anche risposta e presenza. Restano convocate finché non confermi.",
      nl: "Deze personen hebben al geantwoord of zijn aangemeld. Verwijderen wist ook hun antwoord en aanwezigheid. Ze blijven opgeroepen tot je bevestigt.",
      pt: "Estas pessoas já responderam ou foram registadas. Removê-las também apaga a resposta e a presença. Continuam convocadas até confirmar.",
    },
    "meetings.confirmRemove.title": {
      fr: "Retirer des personnes ayant déjà répondu ?",
      en: "Remove people who already replied?",
      de: "Personen entfernen, die bereits geantwortet haben?",
      es: "¿Quitar a personas que ya respondieron?",
      it: "Rimuovere persone che hanno già risposto?",
      nl: "Personen verwijderen die al hebben geantwoord?",
      pt: "Remover pessoas que já responderam?",
    },
    "meetings.empty.member": {
      fr: "Vous n'êtes pas convoqué à cette réunion.",
      en: "You are not invited to this meeting.",
      de: "Sie sind zu diesem Meeting nicht eingeladen.",
      es: "No estás convocado a esta reunión.",
      it: "Non sei convocato a questa riunione.",
      nl: "Je bent niet opgeroepen voor deze vergadering.",
      pt: "Não está convocado para esta reunião.",
    },
    "meetings.empty.staff": {
      fr: "Aucun convoqué — utilisez « Gérer les convoqués » pour inviter des groupes ou des personnes.",
      en: "No invitees — use “Manage invitees” to invite groups or people.",
      de: "Keine Eingeladenen — nutzen Sie „Eingeladene verwalten“, um Gruppen oder Personen einzuladen.",
      es: "Sin convocados — usa « Gestionar convocados » para invitar a grupos o personas.",
      it: "Nessun convocato — usa « Gestisci convocati » per invitare gruppi o persone.",
      nl: "Geen opgeroepenen — gebruik « Opgeroepenen beheren » om groepen of personen uit te nodigen.",
      pt: "Sem convocados — use « Gerir convocados » para convidar grupos ou pessoas.",
    },
    "meetings.manage.cta": {
      fr: "Gérer les convoqués",
      en: "Manage invitees",
      de: "Eingeladene verwalten",
      es: "Gestionar convocados",
      it: "Gestisci convocati",
      nl: "Opgeroepenen beheren",
      pt: "Gerir convocados",
    },
    "meetings.manage.desc": {
      fr: "Sélectionnez des groupes, des équipes ou des personnes. Chaque personne n'est convoquée qu'une fois.",
      en: "Select groups, teams, or people. Each person is invited only once.",
      de: "Wählen Sie Gruppen, Teams oder Personen. Jede Person wird nur einmal eingeladen.",
      es: "Selecciona grupos, equipos o personas. Cada persona se convoca solo una vez.",
      it: "Seleziona gruppi, squadre o persone. Ogni persona viene convocata una sola volta.",
      nl: "Selecteer groepen, teams of personen. Elke persoon wordt maar één keer opgeroepen.",
      pt: "Selecione grupos, equipas ou pessoas. Cada pessoa é convocada apenas uma vez.",
    },
    "meetings.row.remove.confirmDesc": {
      fr: "{{name}} sera retiré(e) de la réunion et recevra une notification de retrait.",
      en: "{{name}} will be removed from the meeting and receive a removal notification.",
      de: "{{name}} wird aus dem Meeting entfernt und erhält eine Benachrichtigung.",
      es: "{{name}} será retirado/a de la reunión y recibirá una notificación.",
      it: "{{name}} sarà rimosso/a dalla riunione e riceverà una notifica.",
      nl: "{{name}} wordt uit de vergadering verwijderd en ontvangt een melding.",
      pt: "{{name}} será removido/a da reunião e receberá uma notificação.",
    },
    "meetings.row.remove.success": {
      fr: "Convocation annulée",
      en: "Invitation cancelled",
      de: "Einladung storniert",
      es: "Convocatoria cancelada",
      it: "Convocazione annullata",
      nl: "Oproep geannuleerd",
      pt: "Convocatória cancelada",
    },
    "meetings.row.resend.success": {
      fr: "Convocation renvoyée",
      en: "Invitation resent",
      de: "Einladung erneut gesendet",
      es: "Convocatoria reenviada",
      it: "Convocazione reinviata",
      nl: "Oproep opnieuw verzonden",
      pt: "Convocatória reenviada",
    },
    "meetings.section.count": {
      fr: "{{count}} convoqué(s)",
      en: "{{count}} invitee(s)",
      de: "{{count}} Eingeladene",
      es: "{{count}} convocado(s)",
      it: "{{count}} convocato/i",
      nl: "{{count}} opgeroepene(n)",
      pt: "{{count}} convocado(s)",
    },
    "meetings.section.title": {
      fr: "Convocations réunion",
      en: "Meeting invitations",
      de: "Meeting-Einladungen",
      es: "Convocatorias de reunión",
      it: "Convocazioni riunione",
      nl: "Vergaderingsoproepen",
      pt: "Convocatórias da reunião",
    },
    "meetings.self.prompt": {
      fr: "Votre présence :",
      en: "Your attendance:",
      de: "Ihre Anwesenheit:",
      es: "Tu asistencia:",
      it: "La tua presenza:",
      nl: "Jouw aanwezigheid:",
      pt: "A sua presença:",
    },
    "meetings.source.manual": {
      fr: "ajouté manuellement",
      en: "added manually",
      de: "manuell hinzugefügt",
      es: "añadido manualmente",
      it: "aggiunto manualmente",
      nl: "handmatig toegevoegd",
      pt: "adicionado manualmente",
    },
    "meetings.sync.success": {
      fr: "{{added}} ajouté(s), {{removed}} retiré(s)",
      en: "{{added}} added, {{removed}} removed",
      de: "{{added}} hinzugefügt, {{removed}} entfernt",
      es: "{{added}} añadido(s), {{removed}} retirado(s)",
      it: "{{added}} aggiunto/i, {{removed}} rimosso/i",
      nl: "{{added}} toegevoegd, {{removed}} verwijderd",
      pt: "{{added}} adicionado(s), {{removed}} removido(s)",
    },
    "notification.sanctionCreated": {
      fr: "{{name}} a reçu une suspension de {{n}} match(s).",
      en: "{{name}} received a {{n}}-match suspension.",
      de: "{{name}} hat eine Sperre von {{n}} Spiel(en) erhalten.",
      es: "{{name}} ha recibido una suspensión de {{n}} partido(s).",
      it: "{{name}} ha ricevuto una squalifica di {{n}} partita/e.",
      nl: "{{name}} heeft een schorsing van {{n}} wedstrijd(en) gekregen.",
      pt: "{{name}} recebeu uma suspensão de {{n}} jogo(s).",
    },
    "players.inviteSuppressedSimple": {
      fr: "{{count}} invitation(s) bloquée(s) : l'adresse est en suppression (bounce, spam ou désinscription). Corrigez l'e-mail ou contactez le support.",
      en: "{{count}} invitation(s) blocked: the address is suppressed (bounce, spam, or unsubscribe). Fix the email or contact support.",
      de: "{{count}} Einladung(en) blockiert: Adresse unterdrückt (Bounce, Spam oder Abmeldung). E-Mail korrigieren oder Support kontaktieren.",
      es: "{{count}} invitación(es) bloqueada(s): la dirección está suprimida (rebote, spam o baja). Corrige el email o contacta con soporte.",
      it: "{{count}} invito/i bloccato/i: indirizzo soppresso (bounce, spam o disiscrizione). Correggi l'email o contatta il supporto.",
      nl: "{{count}} uitnodiging(en) geblokkeerd: adres is onderdrukt (bounce, spam of afmelding). Pas de e-mail aan of neem contact op met support.",
      pt: "{{count}} convite(s) bloqueado(s): o endereço está suprimido (bounce, spam ou anulação). Corrija o e-mail ou contacte o suporte.",
    },
    "players.photoUploadFailed": {
      fr: "Échec de l'envoi de la photo : {{message}}",
      en: "Photo upload failed: {{message}}",
      de: "Foto-Upload fehlgeschlagen: {{message}}",
      es: "Error al subir la foto: {{message}}",
      it: "Caricamento foto non riuscito: {{message}}",
      nl: "Foto uploaden mislukt: {{message}}",
      pt: "Falha no envio da foto: {{message}}",
    },
    "registrations.csv.done": {
      fr: "Export CSV téléchargé ({{count}} lignes).",
      en: "CSV export downloaded ({{count}} rows).",
      de: "CSV-Export heruntergeladen ({{count}} Zeilen).",
      es: "Exportación CSV descargada ({{count}} filas).",
      it: "Export CSV scaricato ({{count}} righe).",
      nl: "CSV-export gedownload ({{count}} rijen).",
      pt: "Exportação CSV transferida ({{count}} linhas).",
    },
    "registrations.detail.capacityLine": {
      fr: "Capacité : {{approved}}/{{capacity}} confirmées · {{remaining}} places restantes",
      en: "Capacity: {{approved}}/{{capacity}} confirmed · {{remaining}} spots left",
      de: "Kapazität: {{approved}}/{{capacity}} bestätigt · {{remaining}} Plätze frei",
      es: "Capacidad: {{approved}}/{{capacity}} confirmadas · {{remaining}} plazas restantes",
      it: "Capienza: {{approved}}/{{capacity}} confermate · {{remaining}} posti rimanenti",
      nl: "Capaciteit: {{approved}}/{{capacity}} bevestigd · {{remaining}} plaatsen over",
      pt: "Capacidade: {{approved}}/{{capacity}} confirmadas · {{remaining}} lugares restantes",
    },
    "registrations.detail.createdAt": {
      fr: "Reçue le {{date}}",
      en: "Received on {{date}}",
      de: "Eingegangen am {{date}}",
      es: "Recibida el {{date}}",
      it: "Ricevuta il {{date}}",
      nl: "Ontvangen op {{date}}",
      pt: "Recebida a {{date}}",
    },
    "registrations.detail.partialRemainingPreview": {
      fr: "Reste dû : {{amount}} {{currency}}",
      en: "Balance due: {{amount}} {{currency}}",
      de: "Restbetrag: {{amount}} {{currency}}",
      es: "Pendiente: {{amount}} {{currency}}",
      it: "Residuo: {{amount}} {{currency}}",
      nl: "Nog te betalen: {{amount}} {{currency}}",
      pt: "Valor em falta: {{amount}} {{currency}}",
    },
    "registrations.detail.paymentReceived": {
      fr: "Reçu : {{amount}} {{currency}}",
      en: "Received: {{amount}} {{currency}}",
      de: "Erhalten: {{amount}} {{currency}}",
      es: "Recibido: {{amount}} {{currency}}",
      it: "Ricevuto: {{amount}} {{currency}}",
      nl: "Ontvangen: {{amount}} {{currency}}",
      pt: "Recebido: {{amount}} {{currency}}",
    },
    "registrations.detail.paymentRemaining": {
      fr: "Reste dû : {{amount}} {{currency}}",
      en: "Balance due: {{amount}} {{currency}}",
      de: "Restbetrag: {{amount}} {{currency}}",
      es: "Pendiente: {{amount}} {{currency}}",
      it: "Residuo: {{amount}} {{currency}}",
      nl: "Nog te betalen: {{amount}} {{currency}}",
      pt: "Valor em falta: {{amount}} {{currency}}",
    },
    "registrations.detail.reservedUntil": {
      fr: "Place réservée jusqu'au {{date}}",
      en: "Spot reserved until {{date}}",
      de: "Platz reserviert bis {{date}}",
      es: "Plaza reservada hasta el {{date}}",
      it: "Posto riservato fino al {{date}}",
      nl: "Plaats gereserveerd tot {{date}}",
      pt: "Lugar reservado até {{date}}",
    },
    "registrations.docsSummary": {
      fr: "{{ok}}/{{total}} pièces",
      en: "{{ok}}/{{total}} documents",
      de: "{{ok}}/{{total}} Unterlagen",
      es: "{{ok}}/{{total}} documentos",
      it: "{{ok}}/{{total}} documenti",
      nl: "{{ok}}/{{total}} documenten",
      pt: "{{ok}}/{{total}} documentos",
    },
    "registrations.stats.expiredHint": {
      fr: "{{count}} réservation(s) 72 h expirée(s) — utilisez « Prolonger » pour retenir la place.",
      en: "{{count}} 72h reservation(s) expired — use “Extend” to keep the spot.",
      de: "{{count}} 72-Std.-Reservierung(en) abgelaufen — mit „Verlängern“ den Platz behalten.",
      es: "{{count}} reserva(s) de 72 h caducada(s) — usa « Prolongar » para conservar la plaza.",
      it: "{{count}} prenotazione/i di 72 h scaduta/e — usa « Prolunga » per mantenere il posto.",
      nl: "{{count}} 72u-reservering(en) verlopen — gebruik « Verlengen » om de plaats te behouden.",
      pt: "{{count}} reserva(s) de 72 h expirada(s) — use « Prolongar » para manter o lugar.",
    },
    "roster.import.blocked": {
      fr: "Import bloqué : {{total}} joueurs dépassent la limite de {{max}}. Réduisez le fichier ou choisissez « Remplacer ».",
      en: "Import blocked: {{total}} players exceed the limit of {{max}}. Reduce the file or choose “Replace”.",
      de: "Import blockiert: {{total}} Spieler überschreiten das Limit von {{max}}. Datei kürzen oder „Ersetzen“ wählen.",
      es: "Importación bloqueada: {{total}} jugadores superan el límite de {{max}}. Reduce el archivo o elige « Reemplazar ».",
      it: "Import bloccato: {{total}} giocatori superano il limite di {{max}}. Riduci il file o scegli « Sostituisci ».",
      nl: "Import geblokkeerd: {{total}} spelers overschrijden de limiet van {{max}}. Verklein het bestand of kies « Vervangen ».",
      pt: "Importação bloqueada: {{total}} jogadores excedem o limite de {{max}}. Reduza o ficheiro ou escolha « Substituir ».",
    },
    "roster.import.ok": {
      fr: "{{n}} joueur(s) importé(s)",
      en: "{{n}} player(s) imported",
      de: "{{n}} Spieler importiert",
      es: "{{n}} jugador(es) importado(s)",
      it: "{{n}} giocatore/i importato/i",
      nl: "{{n}} speler(s) geïmporteerd",
      pt: "{{n}} jogador(es) importado(s)",
    },
    "roster.tooMany": {
      fr: "Effectif limité à {{max}} joueurs.",
      en: "Roster limited to {{max}} players.",
      de: "Kader auf {{max}} Spieler begrenzt.",
      es: "Plantilla limitada a {{max}} jugadores.",
      it: "Rosa limitata a {{max}} giocatori.",
      nl: "Selectie beperkt tot {{max}} spelers.",
      pt: "Plantel limitado a {{max}} jogadores.",
    },
    "staffAvailability.visibility": {
      fr: "Visibilité",
      en: "Visibility",
      de: "Sichtbarkeit",
      es: "Visibilidad",
      it: "Visibilità",
      nl: "Zichtbaarheid",
      pt: "Visibilidade",
    },
    "suspensions.warningTooltip": {
      fr: "{{count}} match(s) restant(s) à purger",
      en: "{{count}} match(es) left to serve",
      de: "Noch {{count}} Spiel(e) abzusitzen",
      es: "{{count}} partido(s) pendiente(s) de cumplir",
      it: "{{count}} partita/e ancora da scontare",
      nl: "Nog {{count}} wedstrijd(en) uit te zitten",
      pt: "{{count}} jogo(s) em falta para cumprir",
    },
    "tournamentMembers.convertDesc": {
      fr: "Envoyer une invitation par email à {{name}} pour qu'il/elle puisse se connecter et valider ses matchs.",
      en: "Send an email invitation to {{name}} so they can sign in and validate their matches.",
      de: "Senden Sie {{name}} eine E-Mail-Einladung, damit er/sie sich anmelden und Spiele bestätigen kann.",
      es: "Enviar una invitación por email a {{name}} para que pueda iniciar sesión y validar sus partidos.",
      it: "Invia un invito email a {{name}} così può accedere e validare le partite.",
      nl: "Stuur {{name}} een e-mailuitnodiging zodat hij/zij kan inloggen en wedstrijden kan valideren.",
      pt: "Enviar um convite por e-mail a {{name}} para poder iniciar sessão e validar os jogos.",
    },
    "urgency.coach.convocationSilence": {
      fr: "{{count}} sans réponse",
      en: "{{count}} with no reply",
      de: "{{count}} ohne Antwort",
      es: "{{count}} sin respuesta",
      it: "{{count}} senza risposta",
      nl: "{{count}} zonder antwoord",
      pt: "{{count}} sem resposta",
    },
    "urgency.coach.reducedSquadTitleTeam": {
      fr: "Effectif réduit — {{team}}",
      en: "Reduced squad — {{team}}",
      de: "Reduzierter Kader — {{team}}",
      es: "Plantilla reducida — {{team}}",
      it: "Rosa ridotta — {{team}}",
      nl: "Verminderde selectie — {{team}}",
      pt: "Plantel reduzido — {{team}}",
    },
    "wall.newPostTitle": {
      fr: "{{name}} a publié sur le mur",
      en: "{{name}} posted on the wall",
      de: "{{name}} hat auf der Pinnwand gepostet",
      es: "{{name}} ha publicado en el muro",
      it: "{{name}} ha pubblicato sul muro",
      nl: "{{name}} heeft op de muur geplaatst",
      pt: "{{name}} publicou no mural",
    },
    "wall.reactions.count": {
      fr: "{{count}} réaction(s)",
      en: "{{count}} reaction(s)",
      de: "{{count}} Reaktion(en)",
      es: "{{count}} reacción(es)",
      it: "{{count}} reazione/i",
      nl: "{{count}} reactie(s)",
      pt: "{{count}} reação(ões)",
    },
    "wizard.footerProgress": {
      fr: "Étape {{current}} sur {{total}}",
      en: "Step {{current}} of {{total}}",
      de: "Schritt {{current}} von {{total}}",
      es: "Paso {{current}} de {{total}}",
      it: "Passo {{current}} di {{total}}",
      nl: "Stap {{current}} van {{total}}",
      pt: "Passo {{current}} de {{total}}",
    },
  },
  publications: {
    "audience.groupsBlock": {
      fr: "Groupes personnalisés",
      en: "Custom groups",
      de: "Benutzerdefinierte Gruppen",
      es: "Grupos personalizados",
      it: "Gruppi personalizzati",
      nl: "Aangepaste groepen",
      pt: "Grupos personalizados",
    },
    "audience.groupsHint": {
      fr: "Groupes transversaux créés dans l'admin du club",
      en: "Cross-cutting groups created in club admin",
      de: "Übergreifende Gruppen aus der Club-Verwaltung",
      es: "Grupos transversales creados en la admin del club",
      it: "Gruppi trasversali creati nell'admin del club",
      nl: "Dwarsdoorsnijdende groepen gemaakt in clubbeheer",
      pt: "Grupos transversais criados na admin do clube",
    },
    "audience.selectedTitle": {
      fr: "Destinataires sélectionnés",
      en: "Selected recipients",
      de: "Ausgewählte Empfänger",
      es: "Destinatarios seleccionados",
      it: "Destinatari selezionati",
      nl: "Geselecteerde ontvangers",
      pt: "Destinatários selecionados",
    },
    "audience.teamsBlock": {
      fr: "Équipes",
      en: "Teams",
      de: "Teams",
      es: "Equipos",
      it: "Squadre",
      nl: "Teams",
      pt: "Equipas",
    },
    "audience.teamsHint": {
      fr: "Choisisez joueurs et/ou parents par équipe",
      en: "Choose players and/or parents per team",
      de: "Spieler und/oder Eltern pro Team wählen",
      es: "Elige jugadores y/o padres por equipo",
      it: "Scegli giocatori e/o genitori per squadra",
      nl: "Kies spelers en/of ouders per team",
      pt: "Escolha jogadores e/ou encarregados por equipa",
    },
  },
};

// Fix typo in FR teamsHint - use correct French from source
KEYS.publications["audience.teamsHint"].fr = "Choisissez joueurs et/ou parents par équipe";

let added = 0;
let skipped = 0;
for (const [ns, entries] of Object.entries(KEYS)) {
  for (const locale of LOCALES) {
    const file = path.join(ROOT, locale, `${ns}.json`);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [key, translations] of Object.entries(entries)) {
      const value = translations[locale];
      if (typeof value !== "string") throw new Error(`Missing ${locale} for ${ns}.${key}`);
      const existing = deepGet(data, key);
      if (typeof existing === "string") {
        skipped++;
        continue;
      }
      // also skip if plural forms already exist
      if (
        typeof deepGet(data, `${key}_one`) === "string" ||
        typeof deepGet(data, `${key}_other`) === "string"
      ) {
        skipped++;
        continue;
      }
      deepSet(data, key, value);
      added++;
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}
console.log(`Done. added=${added} skipped=${skipped}`);
