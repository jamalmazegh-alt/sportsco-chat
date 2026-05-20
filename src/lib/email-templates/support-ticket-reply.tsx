import * as React from "react";
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  subject?: string;
  ticketShortId?: string;
  messagePreview?: string;
  ticketUrl?: string;
  locale?: "fr" | "en" | string;
}

const COPY = {
  fr: {
    lang: "fr",
    preview: "Nouvelle réponse à votre demande de support — Clubero",
    greet: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: (subject?: string, id?: string) =>
      `Notre équipe support vient de répondre à votre demande${subject ? ` "${subject}"` : ""}${id ? ` (#${id})` : ""}.`,
    follow: "Consultez et répondez :",
    sign: "L'équipe Clubero",
    subject_line: (id?: string) =>
      id ? `Réponse à votre demande #${id} — Clubero` : "Réponse à votre demande de support — Clubero",
  },
  en: {
    lang: "en",
    preview: "New reply on your support request — Clubero",
    greet: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    intro: (subject?: string, id?: string) =>
      `Our support team has just replied to your request${subject ? ` "${subject}"` : ""}${id ? ` (#${id})` : ""}.`,
    follow: "View and reply:",
    sign: "The Clubero team",
    subject_line: (id?: string) =>
      id ? `Reply to your request #${id} — Clubero` : "Reply to your support request — Clubero",
  },
} as const;

const pick = (locale?: string) => (locale === "en" ? COPY.en : COPY.fr);

const SupportTicketReplyEmail = ({ name, subject, ticketShortId, messagePreview, ticketUrl, locale }: Props) => {
  const c = pick(locale);
  return (
    <Html lang={c.lang} dir="ltr">
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{c.greet(name)}</Heading>
          <Text style={text}>{c.intro(subject, ticketShortId)}</Text>
          {messagePreview && (
            <Section style={card}>
              <Text style={cardText}>{messagePreview}</Text>
            </Section>
          )}
          {ticketUrl && (
            <Text style={text}>
              {c.follow} <a href={ticketUrl} style={link}>{ticketUrl}</a>
            </Text>
          )}
          <Text style={footer}>{c.sign}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: SupportTicketReplyEmail,
  subject: (data: Record<string, any>) => pick(data.locale).subject_line(data.ticketShortId),
  displayName: "Support — Réponse staff",
  previewData: { name: "Jane", subject: "Problème de connexion", ticketShortId: "A1B2C3", messagePreview: "Bonjour, pouvez-vous nous indiquer…", ticketUrl: "https://www.clubero.app/support", locale: "fr" },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", margin: "16px 0" };
const cardText = { fontSize: "13px", color: "#334155", lineHeight: "1.55", margin: 0, whiteSpace: "pre-wrap" as const };
const link = { color: "#2563eb", textDecoration: "none" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
