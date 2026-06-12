import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  kind?: "contact" | "demo";
  name?: string;
  locale?: string;
}

type Copy = {
  greeting: (name?: string) => string;
  title: { contact: string; demo: string };
  ack: { contact: string; demo: string };
  delay: (hours: string) => React.ReactNode;
  hours: string;
  meantime: (url: React.ReactNode) => React.ReactNode;
  subject: { contact: string; demo: string };
};

const COPY: Record<Locale, Copy> = {
  fr: {
    greeting: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: { contact: "Merci de nous avoir contactés", demo: "Merci pour votre demande de démo" },
    ack: { contact: "votre message", demo: "votre demande de démo" },
    delay: (h) => <>Nous avons bien reçu {/**/}votre demande et nous reviendrons vers vous sous <strong>{h}</strong>.</>,
    hours: "48 heures ouvrées",
    meantime: (url) => <>En attendant, n'hésitez pas à consulter notre site {url}.</>,
    subject: { contact: "Nous avons bien reçu votre message — Clubero", demo: "Votre demande de démo Clubero" },
  },
  en: {
    greeting: (n) => (n ? `Hi ${n},` : "Hi,"),
    title: { contact: "Thanks for contacting us", demo: "Thanks for your demo request" },
    ack: { contact: "your message", demo: "your demo request" },
    delay: (h) => <>We've received your request and will get back to you within <strong>{h}</strong>.</>,
    hours: "48 business hours",
    meantime: (url) => <>In the meantime, feel free to explore our site {url}.</>,
    subject: { contact: "We received your message — Clubero", demo: "Your Clubero demo request" },
  },
  es: {
    greeting: (n) => (n ? `Hola ${n},` : "Hola,"),
    title: { contact: "Gracias por contactarnos", demo: "Gracias por tu solicitud de demo" },
    ack: { contact: "tu mensaje", demo: "tu solicitud de demo" },
    delay: (h) => <>Hemos recibido tu solicitud y te responderemos en un plazo de <strong>{h}</strong>.</>,
    hours: "48 horas laborables",
    meantime: (url) => <>Mientras tanto, no dudes en visitar nuestro sitio {url}.</>,
    subject: { contact: "Hemos recibido tu mensaje — Clubero", demo: "Tu solicitud de demo de Clubero" },
  },
  de: {
    greeting: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: { contact: "Danke für Ihre Nachricht", demo: "Danke für Ihre Demo-Anfrage" },
    ack: { contact: "Ihre Nachricht", demo: "Ihre Demo-Anfrage" },
    delay: (h) => <>Wir haben Ihre Anfrage erhalten und melden uns innerhalb von <strong>{h}</strong>.</>,
    hours: "48 Geschäftsstunden",
    meantime: (url) => <>In der Zwischenzeit können Sie gerne unsere Website besuchen: {url}.</>,
    subject: { contact: "Wir haben Ihre Nachricht erhalten — Clubero", demo: "Ihre Clubero Demo-Anfrage" },
  },
  it: {
    greeting: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    title: { contact: "Grazie per averci contattato", demo: "Grazie per la richiesta di demo" },
    ack: { contact: "il tuo messaggio", demo: "la tua richiesta di demo" },
    delay: (h) => <>Abbiamo ricevuto la tua richiesta e ti risponderemo entro <strong>{h}</strong>.</>,
    hours: "48 ore lavorative",
    meantime: (url) => <>Nel frattempo, visita il nostro sito {url}.</>,
    subject: { contact: "Abbiamo ricevuto il tuo messaggio — Clubero", demo: "La tua richiesta di demo Clubero" },
  },
  nl: {
    greeting: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: { contact: "Bedankt voor uw bericht", demo: "Bedankt voor uw demo-aanvraag" },
    ack: { contact: "uw bericht", demo: "uw demo-aanvraag" },
    delay: (h) => <>We hebben uw aanvraag ontvangen en nemen binnen <strong>{h}</strong> contact op.</>,
    hours: "48 werkuren",
    meantime: (url) => <>Bezoek ondertussen gerust onze site {url}.</>,
    subject: { contact: "We hebben uw bericht ontvangen — Clubero", demo: "Uw Clubero demo-aanvraag" },
  },
  pt: {
    greeting: (n) => (n ? `Olá ${n},` : "Olá,"),
    title: { contact: "Obrigado pelo contacto", demo: "Obrigado pelo seu pedido de demo" },
    ack: { contact: "a sua mensagem", demo: "o seu pedido de demo" },
    delay: (h) => <>Recebemos o seu pedido e responderemos em <strong>{h}</strong>.</>,
    hours: "48 horas úteis",
    meantime: (url) => <>Entretanto, visite o nosso site {url}.</>,
    subject: { contact: "Recebemos a sua mensagem — Clubero", demo: "O seu pedido de demo Clubero" },
  },
};

const InquiryConfirmationEmail = ({ kind = "contact", name, locale }: Props) => {
  const l = pickLocale(locale);
  const c = COPY[l];
  const isDemo = kind === "demo";
  const title = isDemo ? c.title.demo : c.title.contact;
  const siteLink = (
    <a href="https://www.clubero.app" style={link}>www.clubero.app</a>
  );
  return (
    <EmailShell preview={`${title} — Clubero`} locale={l}>
      <Heading style={h1}>{c.greeting(name)}</Heading>
      <Text style={text}>{title}.</Text>
      <Text style={text}>{c.delay(c.hours)}</Text>
      <Section style={card}>
        <Text style={cardText}>{c.meantime(siteLink)}</Text>
      </Section>
    </EmailShell>
  );
};

export const template = {
  component: InquiryConfirmationEmail,
  subject: (data: Record<string, any>) => {
    const l = pickLocale(data.locale);
    return data.kind === "demo" ? COPY[l].subject.demo : COPY[l].subject.contact;
  },
  displayName: "Confirmation contact / démo (utilisateur)",
  previewData: { kind: "contact", name: "Jane", locale: "fr" },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", margin: "16px 0" };
const cardText = { fontSize: "13px", color: "#334155", lineHeight: "1.55", margin: 0 };
const link = { color: "#2563eb", textDecoration: "none" };
