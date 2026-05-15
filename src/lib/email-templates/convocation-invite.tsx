import * as React from "react";
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Row, Column,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

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
}: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>
      Convocation : {eventTitle}
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
          {recipientFirstName ? `Bonjour ${recipientFirstName},` : "Bonjour,"}
        </Heading>

        <Text style={text}>
          {playerName ? <strong>{playerName}</strong> : "Votre joueur"} est convoqué·e
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
              {locationMapsUrl ? (
                <> — <a href={locationMapsUrl} style={mapsLink}>Voir sur Maps</a></>
              ) : null}
            </Text>
          ) : null}
          {meetingPoint ? (
            <Text style={cardMeta}>
              🚌 Point de RDV : {meetingPoint}
              {meetingPointMapsUrl ? (
                <> — <a href={meetingPointMapsUrl} style={mapsLink}>Maps</a></>
              ) : null}
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
    `📣 Convocation : ${d.eventTitle}${d.eventDate ? ` — ${d.eventDate}` : ""}`,
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
