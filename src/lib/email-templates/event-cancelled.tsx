import * as React from "react";
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  recipientFirstName?: string;
  playerName?: string;
  eventTitle: string;
  eventDate?: string;
  eventLocation?: string;
  reason: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
}

const EventCancelledEmail = ({
  recipientFirstName,
  playerName,
  eventTitle,
  eventDate,
  eventLocation,
  reason,
  teamName,
  clubName,
  clubLogoUrl,
}: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>
      Événement annulé : {eventTitle}
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
          L'événement
          {playerName ? <> auquel <strong>{playerName}</strong> était convoqué·e</> : null}
          {teamName ? <> avec <strong>{teamName}</strong></> : null}
          {" "}a été <strong>annulé</strong>.
        </Text>

        <Section style={card}>
          <Text style={cardKicker}>ANNULÉ</Text>
          <Text style={cardTitle}>{eventTitle}</Text>
          {eventDate ? <Text style={cardMeta}>📅 {eventDate}</Text> : null}
          {eventLocation ? <Text style={cardMeta}>📍 {eventLocation}</Text> : null}
        </Section>

        <Section style={reasonCard}>
          <Text style={reasonLabel}>Raison de l'annulation</Text>
          <Text style={reasonText}>{reason}</Text>
        </Section>

        <Text style={smallText}>
          Aucune action n'est requise de votre part. Vous serez prévenu·e en cas de
          reprogrammation.
        </Text>

        <Text style={footer}>
          Envoyé par <strong>{clubName ?? "Clubero"}</strong> via Clubero
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: EventCancelledEmail,
  subject: (d) =>
    `❌ Annulé : ${d.eventTitle}${d.eventDate ? ` — ${d.eventDate}` : ""}`,
  displayName: "Event cancelled",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Léo Dupont",
    eventTitle: "vs FC Exemple",
    eventDate: "samedi 24 mai à 15h00",
    eventLocation: "Stade Municipal, Paris",
    reason: "Terrain impraticable suite aux intempéries.",
    teamName: "U13 Garçons",
    clubName: "AS Clubero",
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
  margin: "0 0 16px",
};
const cardKicker = {
  fontSize: "11px",
  letterSpacing: "1px",
  color: "#dc2626",
  fontWeight: "bold" as const,
  margin: "0 0 6px",
};
const cardTitle = { fontSize: "17px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 10px", textDecoration: "line-through" as const };
const cardMeta = { fontSize: "13px", color: "#475569", margin: "0 0 4px" };
const reasonCard = {
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "12px",
  padding: "14px 16px",
  margin: "0 0 16px",
};
const reasonLabel = {
  fontSize: "11px",
  letterSpacing: "0.5px",
  color: "#991b1b",
  fontWeight: "bold" as const,
  textTransform: "uppercase" as const,
  margin: "0 0 6px",
};
const reasonText = { fontSize: "14px", color: "#7f1d1d", lineHeight: "1.5", margin: 0, whiteSpace: "pre-wrap" as const };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0", textAlign: "center" as const };
