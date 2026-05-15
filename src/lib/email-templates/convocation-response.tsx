import * as React from "react";
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  coachFirstName?: string;
  playerName: string;
  eventTitle: string;
  eventDate?: string;
  status: "absent" | "uncertain";
  reason?: string;
  eventUrl: string;
}

const labels: Record<string, string> = {
  absent: "Absent",
  uncertain: "Incertain",
};

const ConvocationResponseEmail = ({
  coachFirstName, playerName, eventTitle, eventDate, status, reason, eventUrl,
}: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>{playerName} a répondu : {labels[status]} — {eventTitle}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {coachFirstName ? `Bonjour ${coachFirstName},` : "Bonjour,"}
        </Heading>
        <Text style={text}>
          <strong>{playerName}</strong> a répondu{" "}
          <strong style={{ color: status === "absent" ? "#dc2626" : "#d97706" }}>
            {labels[status]}
          </strong>{" "}
          à la convocation pour <strong>{eventTitle}</strong>
          {eventDate ? <> ({eventDate})</> : null}.
        </Text>
        {reason && (
          <Section style={reasonBox}>
            <Text style={reasonLabel}>Motif</Text>
            <Text style={reasonText}>"{reason}"</Text>
          </Section>
        )}
        <Button style={button} href={eventUrl}>Voir l'événement</Button>
        <Text style={footer}>
          Vous recevez cet e-mail en tant que coach de l'équipe sur Clubero.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: ConvocationResponseEmail,
  subject: (d) =>
    `${d.playerName} : ${labels[d.status as string] ?? d.status} — ${d.eventTitle}`,
  displayName: "Convocation response",
  previewData: {
    coachFirstName: "Marc",
    playerName: "Léo Dupont",
    eventTitle: "Match vs FC Exemple",
    eventDate: "samedi 24 mai à 15h00",
    status: "absent",
    reason: "Tournoi familial ce week-end",
    eventUrl: "https://app.clubero.app/events/123",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 20px" };
const reasonBox = { backgroundColor: "#f1f5f9", borderRadius: "10px", padding: "12px 16px", margin: "0 0 20px" };
const reasonLabel = { fontSize: "11px", textTransform: "uppercase" as const, color: "#64748b", margin: "0 0 4px", fontWeight: "bold" as const };
const reasonText = { fontSize: "14px", color: "#0f172a", fontStyle: "italic" as const, margin: 0 };
const button = {
  backgroundColor: "#0f172a", color: "#ffffff", fontSize: "14px",
  borderRadius: "10px", padding: "12px 20px", textDecoration: "none", display: "inline-block",
};
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
