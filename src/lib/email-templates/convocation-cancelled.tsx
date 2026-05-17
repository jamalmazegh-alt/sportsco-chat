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
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
}

const ConvocationCancelledEmail = ({
  recipientFirstName,
  playerName,
  eventTitle,
  eventDate,
  eventLocation,
  teamName,
  clubName,
  clubLogoUrl,
}: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>
      Convocation annulée : {eventTitle}
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
          {playerName ? <><strong>{playerName}</strong> n'est </> : <>Vous n'êtes </>}
          plus convoqué·e
          {teamName ? <> avec <strong>{teamName}</strong></> : null}
          {" "}pour cet événement.
        </Text>

        <Section style={card}>
          <Text style={cardKicker}>CONVOCATION ANNULÉE</Text>
          <Text style={cardTitle}>{eventTitle}</Text>
          {eventDate ? <Text style={cardMeta}>📅 {eventDate}</Text> : null}
          {eventLocation ? <Text style={cardMeta}>📍 {eventLocation}</Text> : null}
        </Section>

        <Text style={smallText}>
          L'événement, lui, est maintenu. Aucune action n'est requise. Le coach reviendra
          vers vous en cas de changement.
        </Text>

        <Text style={footer}>
          Envoyé par <strong>{clubName ?? "Clubero"}</strong> via Clubero
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: ConvocationCancelledEmail,
  subject: (d) =>
    `Convocation annulée : ${d.eventTitle}${d.eventDate ? ` — ${d.eventDate}` : ""}`,
  displayName: "Convocation cancelled",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Léo Dupont",
    eventTitle: "vs FC Exemple",
    eventDate: "samedi 24 mai à 15h00",
    eventLocation: "Stade Municipal, Paris",
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
const cardTitle = { fontSize: "17px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 10px" };
const cardMeta = { fontSize: "13px", color: "#475569", margin: "0 0 4px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0", textAlign: "center" as const };
