import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  subject?: string;
  ticketShortId?: string;
  category?: string;
  ticketUrl?: string;
  locale?: "fr" | "en" | string;
}

const COPY = {
  fr: {
    lang: "fr",
    preview: "Votre demande de support a bien été enregistrée — Clubero",
    greet: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: "Nous avons bien reçu votre demande de support. Notre équipe revient vers vous dans les meilleurs délais.",
    ref: "Référence",
    subject: "Sujet",
    category: "Catégorie",
    follow: "Suivez votre demande :",
    sign: "L'équipe Clubero",
    subject_line: (id?: string) =>
      id ? `Demande de support reçue (#${id}) — Clubero` : "Demande de support reçue — Clubero",
  },
  en: {
    lang: "en",
    preview: "Your support request has been received — Clubero",
    greet: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    intro: "We've received your support request. Our team will get back to you shortly.",
    ref: "Reference",
    subject: "Subject",
    category: "Category",
    follow: "Follow your request:",
    sign: "The Clubero team",
    subject_line: (id?: string) =>
      id ? `Support request received (#${id}) — Clubero` : "Support request received — Clubero",
  },
} as const;

const pick = (locale?: string) => (locale === "en" ? COPY.en : COPY.fr);

const SupportTicketCreatedEmail = ({ name, subject, ticketShortId, category, ticketUrl, locale }: Props) => {
  const c = pick(locale);
  return (
    <EmailShell preview={`${c.preview}`} locale={"fr"}>
          <Heading style={h1}>{c.greet(name)}</Heading>
          <Text style={text}>{c.intro}</Text>
          <Section style={card}>
            {ticketShortId && (
              <Text style={cardText}><strong>{c.ref} :</strong> #{ticketShortId}</Text>
            )}
            {subject && <Text style={cardText}><strong>{c.subject} :</strong> {subject}</Text>}
            {category && <Text style={cardText}><strong>{c.category} :</strong> {category}</Text>}
          </Section>
          {ticketUrl && (
            <Text style={text}>
              {c.follow} <a href={ticketUrl} style={link}>{ticketUrl}</a>
            </Text>
          )}
          </EmailShell>
  );
};

export const template = {
  component: SupportTicketCreatedEmail,
  subject: (data: Record<string, any>) => pick(data.locale).subject_line(data.ticketShortId),
  displayName: "Support — Ticket créé",
  previewData: { name: "Jane", subject: "Problème de connexion", ticketShortId: "A1B2C3", category: "Bug", ticketUrl: "https://www.clubero.app/support", locale: "fr" },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", margin: "16px 0" };
const cardText = { fontSize: "13px", color: "#334155", lineHeight: "1.55", margin: "0 0 6px" };
const link = { color: "#2563eb", textDecoration: "none" };
