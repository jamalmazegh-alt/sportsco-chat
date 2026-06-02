import * as React from "react";
import { Button, Column, Heading, Row, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale } from "./_layout";
import type { Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface LineupPlayer {
  name: string;
  jersey?: number | null;
  role?: string;
  isCaptain?: boolean;
  isGK?: boolean;
  x?: number;
  y?: number;
}

interface Props {
  recipientFirstName?: string;
  playerName: string;
  eventTitle: string;
  eventType?: string;
  eventDate?: string;
  eventDescription?: string;
  convocationTime?: string;
  eventLocation?: string;
  locationMapsUrl?: string;
  meetingPoint?: string;
  meetingPointMapsUrl?: string;
  competitionName?: string;
  coachName?: string;
  squadList?: string[];
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  respondUrl: string; // base url for /r/<token>
  isReminder?: boolean;
  reminderHoursBefore?: number;
  isUpdate?: boolean;
  changes?: Array<{ label: string; previous?: string; current?: string }>;
  lineup?: {
    formation?: string;
    starting?: LineupPlayer[];
    bench?: LineupPlayer[];
  };
  locale?: Locale;
}

const T: Record<Locale, {
  update: string; reminder: string; convocation: string;
  subjUpdate: string; subjReminder: string; subjDefault: string;
  headingUpdate: string; headingReminder: (h?: number) => string;
  helloName: (n: string) => string; helloDefault: string;
  yourPlayer: string; bodyUpdate: string; bodyReminder: string; bodyDefault: string;
  withTeam: string; changesTitle: string; cardKickerDefault: string;
  meetingTime: string; meetingPointLabel: string; coachLabel: string;
  respondPrompt: string; btnPresent: string; btnUncertain: string; btnAbsent: string;
  squadTitle: (n: number) => string; lineupTitle: string; formationLabel: string;
  startingXI: string; benchTitle: string; foot: string; sentBy: string; via: string;
}> = {
  fr: {
    update: "Mise à jour — ", reminder: "Rappel — ", convocation: "Convocation",
    subjUpdate: "🔄 Mise à jour — ", subjReminder: "⏰ Rappel — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Mise à jour de la convocation",
    headingReminder: (h) => `⏰ Rappel — réponse attendue${h ? ` (${h}h avant)` : ""}`,
    helloName: (n) => `Bonjour ${n},`, helloDefault: "Bonjour,",
    yourPlayer: "Votre joueur",
    bodyUpdate: "— les informations de la convocation ont été mises à jour. Merci de vérifier et de confirmer votre réponse.",
    bodyReminder: "n'a pas encore répondu à la convocation",
    bodyDefault: "est convoqué·e",
    withTeam: "avec", changesTitle: "⚠️ Ce qui a changé", cardKickerDefault: "ÉVÉNEMENT",
    meetingTime: "Heure de RDV", meetingPointLabel: "Point de RDV", coachLabel: "Coach",
    respondPrompt: "Répondez en un clic :",
    btnPresent: "✅ Présent", btnUncertain: "❔ Incertain", btnAbsent: "❌ Absent",
    squadTitle: (n) => `Joueurs convoqués (${n})`,
    lineupTitle: "⚽ Composition prévue", formationLabel: "Formation",
    startingXI: "XI de départ", benchTitle: "Remplaçants",
    foot: "Pas besoin de vous connecter — votre réponse est enregistrée automatiquement et vous pourrez la modifier plus tard.",
    sentBy: "Envoyé par", via: "via Clubero",
  },
  en: {
    update: "Update — ", reminder: "Reminder — ", convocation: "Call-up",
    subjUpdate: "🔄 Update — ", subjReminder: "⏰ Reminder — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Call-up updated",
    headingReminder: (h) => `⏰ Reminder — response needed${h ? ` (${h}h before)` : ""}`,
    helloName: (n) => `Hi ${n},`, helloDefault: "Hi,",
    yourPlayer: "Your player",
    bodyUpdate: "— the call-up details have been updated. Please review and confirm your response.",
    bodyReminder: "hasn't responded to the call-up yet",
    bodyDefault: "has been called up",
    withTeam: "with", changesTitle: "⚠️ What changed", cardKickerDefault: "EVENT",
    meetingTime: "Meeting time", meetingPointLabel: "Meeting point", coachLabel: "Coach",
    respondPrompt: "Reply in one tap:",
    btnPresent: "✅ Present", btnUncertain: "❔ Uncertain", btnAbsent: "❌ Absent",
    squadTitle: (n) => `Squad (${n})`,
    lineupTitle: "⚽ Planned line-up", formationLabel: "Formation",
    startingXI: "Starting XI", benchTitle: "Bench",
    foot: "No need to sign in — your response is saved automatically and you can change it later.",
    sentBy: "Sent by", via: "via Clubero",
  },
  es: {
    update: "Actualización — ", reminder: "Recordatorio — ", convocation: "Convocatoria",
    subjUpdate: "🔄 Actualización — ", subjReminder: "⏰ Recordatorio — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Convocatoria actualizada",
    headingReminder: (h) => `⏰ Recordatorio — respuesta pendiente${h ? ` (${h}h antes)` : ""}`,
    helloName: (n) => `Hola ${n},`, helloDefault: "Hola,",
    yourPlayer: "Tu jugador/a",
    bodyUpdate: "— los datos de la convocatoria han sido actualizados. Por favor, revisa y confirma tu respuesta.",
    bodyReminder: "aún no ha respondido a la convocatoria",
    bodyDefault: "ha sido convocado/a",
    withTeam: "con", changesTitle: "⚠️ Lo que ha cambiado", cardKickerDefault: "EVENTO",
    meetingTime: "Hora de quedada", meetingPointLabel: "Punto de encuentro", coachLabel: "Entrenador",
    respondPrompt: "Responde en un clic:",
    btnPresent: "✅ Presente", btnUncertain: "❔ Tal vez", btnAbsent: "❌ Ausente",
    squadTitle: (n) => `Convocados (${n})`,
    lineupTitle: "⚽ Alineación prevista", formationLabel: "Formación",
    startingXI: "Once inicial", benchTitle: "Suplentes",
    foot: "No hace falta iniciar sesión — tu respuesta se guarda automáticamente y podrás modificarla más tarde.",
    sentBy: "Enviado por", via: "vía Clubero",
  },
  de: {
    update: "Update — ", reminder: "Erinnerung — ", convocation: "Aufgebot",
    subjUpdate: "🔄 Update — ", subjReminder: "⏰ Erinnerung — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Aufgebot aktualisiert",
    headingReminder: (h) => `⏰ Erinnerung — Antwort erwartet${h ? ` (${h}h vorher)` : ""}`,
    helloName: (n) => `Hallo ${n},`, helloDefault: "Hallo,",
    yourPlayer: "Dein Spieler",
    bodyUpdate: "— die Aufgebotsdaten wurden aktualisiert. Bitte überprüfe und bestätige deine Antwort.",
    bodyReminder: "hat noch nicht auf das Aufgebot geantwortet",
    bodyDefault: "wurde aufgeboten",
    withTeam: "mit", changesTitle: "⚠️ Was sich geändert hat", cardKickerDefault: "EVENT",
    meetingTime: "Treffzeit", meetingPointLabel: "Treffpunkt", coachLabel: "Trainer",
    respondPrompt: "Antworte mit einem Klick:",
    btnPresent: "✅ Anwesend", btnUncertain: "❔ Vielleicht", btnAbsent: "❌ Abwesend",
    squadTitle: (n) => `Aufgebot (${n})`,
    lineupTitle: "⚽ Geplante Aufstellung", formationLabel: "Formation",
    startingXI: "Startelf", benchTitle: "Bank",
    foot: "Kein Login nötig — deine Antwort wird automatisch gespeichert und kann später geändert werden.",
    sentBy: "Gesendet von", via: "über Clubero",
  },
  it: {
    update: "Aggiornamento — ", reminder: "Promemoria — ", convocation: "Convocazione",
    subjUpdate: "🔄 Aggiornamento — ", subjReminder: "⏰ Promemoria — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Convocazione aggiornata",
    headingReminder: (h) => `⏰ Promemoria — risposta attesa${h ? ` (${h}h prima)` : ""}`,
    helloName: (n) => `Ciao ${n},`, helloDefault: "Ciao,",
    yourPlayer: "Il tuo giocatore",
    bodyUpdate: "— le informazioni della convocazione sono state aggiornate. Per favore verifica e conferma la tua risposta.",
    bodyReminder: "non ha ancora risposto alla convocazione",
    bodyDefault: "è stato convocato",
    withTeam: "con", changesTitle: "⚠️ Cosa è cambiato", cardKickerDefault: "EVENTO",
    meetingTime: "Ora del ritrovo", meetingPointLabel: "Punto di ritrovo", coachLabel: "Allenatore",
    respondPrompt: "Rispondi in un clic:",
    btnPresent: "✅ Presente", btnUncertain: "❔ Forse", btnAbsent: "❌ Assente",
    squadTitle: (n) => `Convocati (${n})`,
    lineupTitle: "⚽ Formazione prevista", formationLabel: "Modulo",
    startingXI: "Titolari", benchTitle: "Panchina",
    foot: "Nessun login necessario — la tua risposta viene salvata automaticamente e potrai modificarla in seguito.",
    sentBy: "Inviato da", via: "tramite Clubero",
  },
  nl: {
    update: "Update — ", reminder: "Herinnering — ", convocation: "Oproep",
    subjUpdate: "🔄 Update — ", subjReminder: "⏰ Herinnering — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Oproep bijgewerkt",
    headingReminder: (h) => `⏰ Herinnering — reactie verwacht${h ? ` (${h}u vooraf)` : ""}`,
    helloName: (n) => `Hallo ${n},`, helloDefault: "Hallo,",
    yourPlayer: "Je speler",
    bodyUpdate: "— de gegevens van de oproep zijn bijgewerkt. Controleer en bevestig je antwoord.",
    bodyReminder: "heeft nog niet gereageerd op de oproep",
    bodyDefault: "is opgeroepen",
    withTeam: "met", changesTitle: "⚠️ Wat is gewijzigd", cardKickerDefault: "EVENEMENT",
    meetingTime: "Verzameltijd", meetingPointLabel: "Verzamelpunt", coachLabel: "Coach",
    respondPrompt: "Antwoord in één klik:",
    btnPresent: "✅ Aanwezig", btnUncertain: "❔ Misschien", btnAbsent: "❌ Afwezig",
    squadTitle: (n) => `Selectie (${n})`,
    lineupTitle: "⚽ Geplande opstelling", formationLabel: "Formatie",
    startingXI: "Basiself", benchTitle: "Bank",
    foot: "Geen aanmelding nodig — je antwoord wordt automatisch opgeslagen en kan later worden gewijzigd.",
    sentBy: "Verzonden door", via: "via Clubero",
  },
  pt: {
    update: "Atualização — ", reminder: "Lembrete — ", convocation: "Convocatória",
    subjUpdate: "🔄 Atualização — ", subjReminder: "⏰ Lembrete — ", subjDefault: "📣 ",
    headingUpdate: "🔄 Convocatória atualizada",
    headingReminder: (h) => `⏰ Lembrete — resposta em falta${h ? ` (${h}h antes)` : ""}`,
    helloName: (n) => `Olá ${n},`, helloDefault: "Olá,",
    yourPlayer: "O teu jogador",
    bodyUpdate: "— os dados da convocatória foram atualizados. Por favor verifica e confirma a tua resposta.",
    bodyReminder: "ainda não respondeu à convocatória",
    bodyDefault: "foi convocado(a)",
    withTeam: "com", changesTitle: "⚠️ O que mudou", cardKickerDefault: "EVENTO",
    meetingTime: "Hora de encontro", meetingPointLabel: "Ponto de encontro", coachLabel: "Treinador",
    respondPrompt: "Responde com um clique:",
    btnPresent: "✅ Presente", btnUncertain: "❔ Talvez", btnAbsent: "❌ Ausente",
    squadTitle: (n) => `Convocados (${n})`,
    lineupTitle: "⚽ Equipa prevista", formationLabel: "Formação",
    startingXI: "Onze inicial", benchTitle: "Suplentes",
    foot: "Não é preciso iniciar sessão — a tua resposta é guardada automaticamente e podes alterá-la mais tarde.",
    sentBy: "Enviado por", via: "via Clubero",
  },
};

const ConvocationInviteEmail = ({
  recipientFirstName,
  playerName,
  eventTitle,
  eventType,
  eventDate,
  eventDescription,
  convocationTime,
  eventLocation,
  locationMapsUrl,
  meetingPoint,
  meetingPointMapsUrl,
  competitionName,
  coachName,
  squadList,
  teamName,
  clubName,
  clubLogoUrl,
  respondUrl,
  isReminder,
  reminderHoursBefore,
  isUpdate,
  changes,
  lineup,
  locale,
}: Props) => {
  const l: Locale = locale === "fr" ? "fr" : "en";
  const t = T[l];
  return (

  <EmailShell preview={`${isUpdate ? t.update : isReminder ? t.reminder : ""}${t.convocation}: ${eventTitle}${eventDate ? ` — ${eventDate}` : ""}`} locale={l} clubName={clubName} clubLogoUrl={clubLogoUrl}>
        <Heading style={h1}>
          {isUpdate
            ? t.headingUpdate
            : isReminder
            ? t.headingReminder(reminderHoursBefore)
            : recipientFirstName ? t.helloName(recipientFirstName) : t.helloDefault}
        </Heading>

        {isUpdate && changes && changes.length > 0 ? (
          <Section style={changesCard}>
            <Text style={changesTitle}>{t.changesTitle}</Text>
            {changes.map((c, i) => (
              <Text key={i} style={changesLine}>
                <strong>{c.label} :</strong>{" "}
                {c.previous ? <span style={oldValue}>{c.previous}</span> : <em style={{ color: "#94a3b8" }}>—</em>}
                {" → "}
                <span style={newValue}>{c.current ?? "—"}</span>
              </Text>
            ))}
          </Section>
        ) : null}

        <Text style={text}>
          {playerName ? <strong>{playerName}</strong> : t.yourPlayer} {isUpdate ? t.bodyUpdate : isReminder ? t.bodyReminder : t.bodyDefault}
          {teamName ? <> {t.withTeam} <strong>{teamName}</strong></> : null}
          {clubName ? <> ({clubName})</> : null}.
        </Text>

        <Section style={card}>
          <Text style={cardKicker}>
            {(eventType?.toUpperCase() ?? t.cardKickerDefault)}
            {competitionName ? ` · ${competitionName}` : ""}
          </Text>
          <Text style={cardTitle}>{eventTitle}</Text>
          {eventDate ? <Text style={cardMeta}>📅 {eventDate}</Text> : null}
          {convocationTime ? (
            <Text style={cardMeta}>⏰ {t.meetingTime}: <strong>{convocationTime}</strong></Text>
          ) : null}
          {eventLocation ? (
            <Text style={cardMeta}>
              📍 {eventLocation}
              <br />
              <a href={locationMapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventLocation)}`} style={mapsLink}>🗺️ Google Maps</a>
              {" · "}
              <a href={`https://www.waze.com/ul?q=${encodeURIComponent(eventLocation)}&navigate=yes`} style={mapsLink}>🚗 Waze</a>
            </Text>
          ) : null}
          {meetingPoint ? (
            <Text style={cardMeta}>
              🚌 {t.meetingPointLabel}: {meetingPoint}
              <br />
              <a href={meetingPointMapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetingPoint)}`} style={mapsLink}>🗺️ Google Maps</a>
              {" · "}
              <a href={`https://www.waze.com/ul?q=${encodeURIComponent(meetingPoint)}&navigate=yes`} style={mapsLink}>🚗 Waze</a>
            </Text>
          ) : null}
          {coachName ? <Text style={cardMeta}>👤 {t.coachLabel}: {coachName}</Text> : null}
          {eventDescription ? (
            <Text style={{ ...cardMeta, marginTop: 10, whiteSpace: "pre-wrap" as const, color: "#0f172a" }}>
              📝 {eventDescription}
            </Text>
          ) : null}
        </Section>

        <Text style={text}>{t.respondPrompt}</Text>

        <Section style={{ margin: "0 0 12px" }}>
          <Row>
            <Column style={{ width: "33%", paddingRight: 6 }}>
              <Button style={btnPresent} href={`${respondUrl}?s=present`}>
                {t.btnPresent}
              </Button>
            </Column>
            <Column style={{ width: "34%", paddingRight: 6 }}>
              <Button style={btnUncertain} href={`${respondUrl}?s=uncertain`}>
                {t.btnUncertain}
              </Button>
            </Column>
            <Column style={{ width: "33%" }}>
              <Button style={btnAbsent} href={`${respondUrl}?s=absent`}>
                {t.btnAbsent}
              </Button>
            </Column>
          </Row>
        </Section>

        {squadList && squadList.length > 0 ? (
          <Section style={squadCard}>
            <Text style={squadTitle}>{t.squadTitle(squadList.length)}</Text>
            {squadList.map((name, i) => (
              <Text key={i} style={squadLine}>• {name}</Text>
            ))}
          </Section>
        ) : null}

        {lineup && ((lineup.starting?.length ?? 0) > 0 || (lineup.bench?.length ?? 0) > 0) ? (
          <Section style={lineupCard}>
            <Text style={lineupKicker}>{t.lineupTitle}</Text>
            {lineup.formation ? (
              <Text style={lineupFormation}>{t.formationLabel}: <strong>{lineup.formation}</strong></Text>
            ) : null}
            {lineup.starting && lineup.starting.some((p) => p.x != null && p.y != null) ? (
              <div style={pitchWrap}>
                <div style={pitch}>
                  <div style={pitchHalfway} />
                  <div style={pitchCircle} />
                  <div style={pitchPenaltyTop} />
                  <div style={pitchPenaltyBottom} />
                  {lineup.starting.map((p, i) => {
                    if (p.x == null || p.y == null) return null;
                    const isCap = p.isCaptain;
                    const isGK = p.isGK;
                    return (
                      <div
                        key={`pp-${i}`}
                        style={{
                          position: "absolute",
                          left: `${p.x}%`,
                          top: `${p.y}%`,
                          transform: "translate(-50%, -50%)",
                          width: 44,
                          marginLeft: -22,
                          marginTop: -22,
                          textAlign: "center" as const,
                        }}
                      >
                        <div style={{
                          width: 32,
                          height: 32,
                          margin: "0 auto",
                          borderRadius: 16,
                          backgroundColor: isGK ? "#fbbf24" : "#ffffff",
                          color: "#0f172a",
                          fontSize: 12,
                          fontWeight: "bold" as const,
                          lineHeight: "32px",
                          border: isCap ? "2px solid #f59e0b" : "2px solid #064e3b",
                        }}>
                          {p.jersey != null ? p.jersey : "•"}
                        </div>
                        <div style={{
                          marginTop: 2,
                          fontSize: 9,
                          color: "#ffffff",
                          fontWeight: "bold" as const,
                          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                          whiteSpace: "nowrap" as const,
                          overflow: "hidden" as const,
                          textOverflow: "ellipsis" as const,
                        }}>
                          {p.name.split(" ").slice(-1)[0]}
                          {isCap ? " (C)" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {lineup.starting && lineup.starting.length > 0 ? (
              <>
                <Text style={lineupSectionTitle}>{t.startingXI}</Text>
                {lineup.starting.map((p, i) => (
                  <Text key={`s-${i}`} style={lineupLine}>
                    {p.role ? <span style={lineupRole}>{p.role}</span> : null}
                    {p.jersey != null ? <strong> #{p.jersey}</strong> : null}
                    {" "}{p.name}
                    {p.isCaptain ? " (C)" : ""}
                    {p.isGK ? " 🧤" : ""}
                  </Text>
                ))}
              </>
            ) : null}
            {lineup.bench && lineup.bench.length > 0 ? (
              <>
                <Text style={lineupSectionTitle}>{t.benchTitle}</Text>
                {lineup.bench.map((p, i) => (
                  <Text key={`b-${i}`} style={lineupLine}>
                    {p.jersey != null ? <strong>#{p.jersey} </strong> : null}
                    {p.name}
                  </Text>
                ))}
              </>
            ) : null}
          </Section>
        ) : null}

        <Text style={smallText}>{t.foot}</Text>

        </EmailShell>
  );
};

export const template = {
  component: ConvocationInviteEmail,
  subject: (d) => {
    const l: Locale = (d as any).locale === "fr" ? "fr" : "en";
    const t = T[l];
    const prefix = d.isUpdate ? t.subjUpdate : d.isReminder ? t.subjReminder : t.subjDefault;
    return `${prefix}${t.convocation}: ${d.eventTitle}${d.eventDate ? ` — ${d.eventDate}` : ""}`;
  },
  displayName: "Convocation invite",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Leo Dupont",
    eventTitle: "vs FC Example",
    eventType: "Match",
    eventDate: "Saturday, May 24 at 3:00 PM",
    eventLocation: "Municipal Stadium, Paris",
    locationMapsUrl: "https://www.google.com/maps/search/?api=1&query=Stade+Municipal+Paris",
    meetingPoint: "Club car park at 2:00 PM",
    meetingPointMapsUrl: "https://www.google.com/maps/search/?api=1&query=Parking+du+club",
    competitionName: "U13 League",
    coachName: "Marc Lefèvre",
    squadList: ["Leo Dupont", "Hugo Martin", "Nathan Bernard", "Theo Petit"],
    teamName: "U13 Boys",
    clubName: "AS Clubero",
    respondUrl: "https://app.clubero.app/r/sample-token",
    locale: "en",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const smallText = { fontSize: "12px", color: "#64748b", lineHeight: "1.5", margin: "16px 0 0" };
const card = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "0 0 20px",
};
const cardKicker = {
  fontSize: "11px",
  letterSpacing: "1px",
  color: "#0ea5e9",
  fontWeight: "bold" as const,
  margin: "0 0 6px",
};
const cardTitle = { fontSize: "17px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 10px" };
const cardMeta = { fontSize: "13px", color: "#475569", margin: "0 0 4px" };
const btnBase = {
  display: "block",
  textAlign: "center" as const,
  fontSize: "14px",
  fontWeight: "bold" as const,
  borderRadius: "10px",
  padding: "12px 4px",
  textDecoration: "none",
  width: "100%",
};
const btnPresent = { ...btnBase, backgroundColor: "#16a34a", color: "#ffffff" };
const btnUncertain = { ...btnBase, backgroundColor: "#f59e0b", color: "#ffffff" };
const btnAbsent = { ...btnBase, backgroundColor: "#dc2626", color: "#ffffff" };

const mapsLink = { color: "#0ea5e9", textDecoration: "underline" };
const squadCard = {
  backgroundColor: "#f1f5f9",
  borderRadius: "10px",
  padding: "12px 14px",
  margin: "0 0 16px",
};
const squadTitle = { fontSize: "12px", fontWeight: "bold" as const, color: "#475569", margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.5px" };
const squadLine = { fontSize: "13px", color: "#334155", lineHeight: "1.6", margin: "0 0 2px" };
const changesCard = {
  backgroundColor: "#fef3c7",
  border: "1px solid #f59e0b",
  borderRadius: "10px",
  padding: "12px 14px",
  margin: "0 0 18px",
};
const changesTitle = { fontSize: "13px", fontWeight: "bold" as const, color: "#92400e", margin: "0 0 8px", textTransform: "uppercase" as const, letterSpacing: "0.5px" };
const changesLine = { fontSize: "13px", color: "#451a03", lineHeight: "1.6", margin: "0 0 4px" };
const oldValue = { color: "#9ca3af", textDecoration: "line-through" as const };
const newValue = { color: "#065f46", fontWeight: "bold" as const, backgroundColor: "#d1fae5", padding: "1px 6px", borderRadius: "4px" };
const lineupCard = {
  backgroundColor: "#ecfdf5",
  border: "1px solid #10b981",
  borderRadius: "10px",
  padding: "12px 14px",
  margin: "0 0 16px",
};
const lineupKicker = { fontSize: "12px", fontWeight: "bold" as const, color: "#065f46", margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.5px" };
const lineupFormation = { fontSize: "13px", color: "#065f46", margin: "0 0 8px" };
const lineupSectionTitle = { fontSize: "11px", fontWeight: "bold" as const, color: "#047857", margin: "8px 0 4px", textTransform: "uppercase" as const, letterSpacing: "0.5px" };
const lineupLine = { fontSize: "13px", color: "#064e3b", lineHeight: "1.6", margin: "0 0 2px" };
const lineupRole = { display: "inline-block", minWidth: "32px", fontSize: "10px", fontWeight: "bold" as const, color: "#ffffff", backgroundColor: "#10b981", padding: "1px 5px", borderRadius: "4px", marginRight: "6px" };
const pitchWrap = { margin: "8px 0 12px", textAlign: "center" as const };
const pitch = {
  position: "relative" as const,
  width: "100%",
  maxWidth: "320px",
  height: "480px",
  margin: "0 auto",
  backgroundColor: "#1f7a3a",
  backgroundImage: "linear-gradient(180deg, #1f7a3a 0%, #155e2c 100%)",
  border: "2px solid rgba(255,255,255,0.7)",
  borderRadius: "6px",
  overflow: "hidden" as const,
};
const pitchHalfway = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: "50%",
  height: 0,
  borderTop: "1px solid rgba(255,255,255,0.7)",
};
const pitchCircle = {
  position: "absolute" as const,
  left: "50%",
  top: "50%",
  width: "60px",
  height: "60px",
  marginLeft: "-30px",
  marginTop: "-30px",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: "50%",
};
const pitchPenaltyTop = {
  position: "absolute" as const,
  left: "20%",
  top: 0,
  width: "60%",
  height: "12%",
  borderLeft: "1px solid rgba(255,255,255,0.7)",
  borderRight: "1px solid rgba(255,255,255,0.7)",
  borderBottom: "1px solid rgba(255,255,255,0.7)",
};
const pitchPenaltyBottom = {
  position: "absolute" as const,
  left: "20%",
  bottom: 0,
  width: "60%",
  height: "12%",
  borderLeft: "1px solid rgba(255,255,255,0.7)",
  borderRight: "1px solid rgba(255,255,255,0.7)",
  borderTop: "1px solid rgba(255,255,255,0.7)",
};
