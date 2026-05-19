import * as React from "react";
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Row, Column,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface LineupPlayer {
  name: string;
  jersey?: number | null;
  role?: string;
  isCaptain?: boolean;
  isGK?: boolean;
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
}


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
}: Props) => (

  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>
      {isUpdate ? "Mise à jour — " : isReminder ? "Rappel — " : ""}Convocation : {eventTitle}
      {eventDate ? ` — ${eventDate}` : ""}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        {clubLogoUrl ? (
          <Section style={{ textAlign: "center", margin: "0 0 16px" }}>
            <img
              src={clubLogoUrl}
              alt={clubName ?? ""}
              width={56}
              height={56}
              style={{ borderRadius: 12, objectFit: "cover" }}
            />
          </Section>
        ) : null}

        <Heading style={h1}>
          {isUpdate
            ? `🔄 Mise à jour de la convocation`
            : isReminder
            ? `⏰ Rappel — réponse attendue${reminderHoursBefore ? ` (${reminderHoursBefore}h avant)` : ""}`
            : recipientFirstName ? `Bonjour ${recipientFirstName},` : "Bonjour,"}
        </Heading>

        {isUpdate && changes && changes.length > 0 ? (
          <Section style={changesCard}>
            <Text style={changesTitle}>⚠️ Ce qui a changé</Text>
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
          {playerName ? <strong>{playerName}</strong> : "Votre joueur"} {isUpdate ? "— les informations de la convocation ont été mises à jour. Merci de vérifier et de confirmer votre réponse." : isReminder ? "n'a pas encore répondu à la convocation" : "est convoqué·e"}
          {teamName ? <> avec <strong>{teamName}</strong></> : null}
          {clubName ? <> ({clubName})</> : null}.
        </Text>

        <Section style={card}>
          <Text style={cardKicker}>
            {(eventType?.toUpperCase() ?? "ÉVÉNEMENT")}
            {competitionName ? ` · ${competitionName}` : ""}
          </Text>
          <Text style={cardTitle}>{eventTitle}</Text>
          {eventDate ? <Text style={cardMeta}>📅 {eventDate}</Text> : null}
          {convocationTime ? (
            <Text style={cardMeta}>⏰ Heure de RDV : <strong>{convocationTime}</strong></Text>
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
              🚌 Point de RDV : {meetingPoint}
              <br />
              <a href={meetingPointMapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetingPoint)}`} style={mapsLink}>🗺️ Google Maps</a>
              {" · "}
              <a href={`https://www.waze.com/ul?q=${encodeURIComponent(meetingPoint)}&navigate=yes`} style={mapsLink}>🚗 Waze</a>
            </Text>
          ) : null}
          {coachName ? <Text style={cardMeta}>👤 Coach : {coachName}</Text> : null}
          {eventDescription ? (
            <Text style={{ ...cardMeta, marginTop: 10, whiteSpace: "pre-wrap" as const, color: "#0f172a" }}>
              📝 {eventDescription}
            </Text>
          ) : null}
        </Section>

        <Text style={text}>Répondez en un clic :</Text>

        <Section style={{ margin: "0 0 12px" }}>
          <Row>
            <Column style={{ width: "33%", paddingRight: 6 }}>
              <Button style={btnPresent} href={`${respondUrl}?s=present`}>
                ✅ Présent
              </Button>
            </Column>
            <Column style={{ width: "34%", paddingRight: 6 }}>
              <Button style={btnUncertain} href={`${respondUrl}?s=uncertain`}>
                ❔ Incertain
              </Button>
            </Column>
            <Column style={{ width: "33%" }}>
              <Button style={btnAbsent} href={`${respondUrl}?s=absent`}>
                ❌ Absent
              </Button>
            </Column>
          </Row>
        </Section>

        {squadList && squadList.length > 0 ? (
          <Section style={squadCard}>
            <Text style={squadTitle}>
              Joueurs convoqués ({squadList.length})
            </Text>
            {squadList.map((name, i) => (
              <Text key={i} style={squadLine}>• {name}</Text>
            ))}
          </Section>
        ) : null}

        {lineup && ((lineup.starting?.length ?? 0) > 0 || (lineup.bench?.length ?? 0) > 0) ? (
          <Section style={lineupCard}>
            <Text style={lineupKicker}>⚽ Composition prévue</Text>
            {lineup.formation ? (
              <Text style={lineupFormation}>Formation : <strong>{lineup.formation}</strong></Text>
            ) : null}
            {lineup.starting && lineup.starting.some((p) => p.x != null && p.y != null) ? (
              <div style={pitchWrap}>
                <div style={pitch}>
                  {/* halfway line */}
                  <div style={pitchHalfway} />
                  {/* center circle */}
                  <div style={pitchCircle} />
                  {/* top penalty area */}
                  <div style={pitchPenaltyTop} />
                  {/* bottom penalty area */}
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
                <Text style={lineupSectionTitle}>XI de départ</Text>
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
                <Text style={lineupSectionTitle}>Remplaçants</Text>
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


        <Text style={smallText}>
          Pas besoin de vous connecter — votre réponse est enregistrée automatiquement et
          vous pourrez la modifier plus tard.
        </Text>

        <Text style={footer}>
          Envoyé par <strong>{clubName ?? "Clubero"}</strong> via Clubero
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: ConvocationInviteEmail,
  subject: (d) =>
    `${d.isUpdate ? "🔄 Mise à jour — " : d.isReminder ? "⏰ Rappel — " : "📣 "}Convocation : ${d.eventTitle}${d.eventDate ? ` — ${d.eventDate}` : ""}`,
  displayName: "Convocation invite",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Léo Dupont",
    eventTitle: "vs FC Exemple",
    eventType: "Match",
    eventDate: "samedi 24 mai à 15h00",
    eventLocation: "Stade Municipal, Paris",
    locationMapsUrl: "https://www.google.com/maps/search/?api=1&query=Stade+Municipal+Paris",
    meetingPoint: "Parking du club à 14h",
    meetingPointMapsUrl: "https://www.google.com/maps/search/?api=1&query=Parking+du+club",
    competitionName: "Championnat U13",
    coachName: "Marc Lefèvre",
    squadList: ["Léo Dupont", "Hugo Martin", "Nathan Bernard", "Théo Petit"],
    teamName: "U13 Garçons",
    clubName: "AS Clubero",
    respondUrl: "https://app.clubero.app/r/sample-token",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
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
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0", textAlign: "center" as const };
const mapsLink = { color: "#0ea5e9", textDecoration: "underline" };
const squadCard = {
  backgroundColor: "#f1f5f9",
  borderRadius: "10px",
  padding: "12px 14px",
  margin: "0 0 16px",
};
const squadTitle = { fontSize: "12px", fontWeight: "bold" as const, color: "#475569", margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.5px" };
const squadText = { fontSize: "13px", color: "#334155", lineHeight: "1.5", margin: 0 };
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
