import * as React from "react";
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  subject?: string;
  ticketShortId?: string;
  category?: string;
  ticketUrl?: string;
}

const SupportTicketCreatedEmail = ({ name, subject, ticketShortId, category, ticketUrl }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Votre demande de support a bien été enregistrée — Clubero</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Bonjour ${name},` : "Bonjour,"}</Heading>
        <Text style={text}>
          Nous avons bien reçu votre demande de support. Notre équipe revient vers vous dans les meilleurs délais.
        </Text>
        <Section style={card}>
          {ticketShortId && (
            <Text style={cardText}><strong>Référence :</strong> #{ticketShortId}</Text>
          )}
          {subject && <Text style={cardText}><strong>Sujet :</strong> {subject}</Text>}
          {category && <Text style={cardText}><strong>Catégorie :</strong> {category}</Text>}
        </Section>
        {ticketUrl && (
          <Text style={text}>
            Suivez votre demande : <a href={ticketUrl} style={link}>{ticketUrl}</a>
          </Text>
        )}
        <Text style={footer}>L'équipe Clubero</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: SupportTicketCreatedEmail,
  subject: (data: Record<string, any>) =>
    data.ticketShortId
      ? `Demande de support reçue (#${data.ticketShortId}) — Clubero`
      : "Demande de support reçue — Clubero",
  displayName: "Support — Ticket créé",
  previewData: { name: "Jane", subject: "Problème de connexion", ticketShortId: "A1B2C3", category: "Bug", ticketUrl: "https://www.clubero.app/support" },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", margin: "16px 0" };
const cardText = { fontSize: "13px", color: "#334155", lineHeight: "1.55", margin: "0 0 6px" };
const link = { color: "#2563eb", textDecoration: "none" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
