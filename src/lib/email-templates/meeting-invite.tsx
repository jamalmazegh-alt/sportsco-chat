import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Props {
  displayName?: string | null;
  meetingTitle: string;
  meetingStartsAt?: string | null;
  location?: string | null;
  clubName?: string | null;
  eventUrl: string;
  locale?: Locale;
}

const COPY: Record<
  Locale,
  {
    preview: (t: string) => string;
    hello: (n?: string | null) => string;
    title: string;
    body: (t: string, c?: string | null) => React.ReactNode;
    whenLabel: string;
    whereLabel: string;
    cta: string;
    or: string;
    subject: (t: string) => string;
    dateLocale: string;
  }
> = {
  fr: {
    preview: (t) => `Vous êtes convoqué·e à la réunion « ${t} »`,
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: "Convocation à une réunion",
    body: (t, c) => (
      <>
        Vous êtes convoqué·e à la réunion <strong>{t}</strong>
        {c ? (
          <>
            {" "}organisée par <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Quand",
    whereLabel: "Où",
    cta: "Voir la réunion",
    or: "Ou copiez ce lien dans votre navigateur :",
    subject: (t) => `Convocation : ${t}`,
    dateLocale: "fr-FR",
  },
  en: {
    preview: (t) => `You are invited to the meeting "${t}"`,
    hello: (n) => (n ? `Hi ${n},` : "Hello,"),
    title: "Meeting invitation",
    body: (t, c) => (
      <>
        You are invited to the meeting <strong>{t}</strong>
        {c ? (
          <>
            {" "}organised by <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "When",
    whereLabel: "Where",
    cta: "View meeting",
    or: "Or copy this link in your browser:",
    subject: (t) => `Meeting invitation: ${t}`,
    dateLocale: "en-GB",
  },
  de: {
    preview: (t) => `Sie sind zur Besprechung „${t}" eingeladen`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Einladung zur Besprechung",
    body: (t, c) => (
      <>
        Sie sind zur Besprechung <strong>{t}</strong>
        {c ? (
          <>
            {" "}von <strong>{c}</strong>
          </>
        ) : null}
        {" "}eingeladen.
      </>
    ),
    whenLabel: "Wann",
    whereLabel: "Wo",
    cta: "Besprechung ansehen",
    or: "Oder kopieren Sie diesen Link in Ihren Browser:",
    subject: (t) => `Einladung: ${t}`,
    dateLocale: "de-DE",
  },
  es: {
    preview: (t) => `Estás convocado·a a la reunión «${t}»`,
    hello: (n) => (n ? `Hola ${n},` : "Hola,"),
    title: "Convocatoria a una reunión",
    body: (t, c) => (
      <>
        Estás convocado·a a la reunión <strong>{t}</strong>
        {c ? (
          <>
            {" "}organizada por <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Cuándo",
    whereLabel: "Dónde",
    cta: "Ver la reunión",
    or: "O copia este enlace en tu navegador:",
    subject: (t) => `Convocatoria: ${t}`,
    dateLocale: "es-ES",
  },
  it: {
    preview: (t) => `Sei convocato·a alla riunione «${t}»`,
    hello: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    title: "Convocazione a una riunione",
    body: (t, c) => (
      <>
        Sei convocato·a alla riunione <strong>{t}</strong>
        {c ? (
          <>
            {" "}organizzata da <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Quando",
    whereLabel: "Dove",
    cta: "Vedi la riunione",
    or: "Oppure copia questo link nel tuo browser:",
    subject: (t) => `Convocazione: ${t}`,
    dateLocale: "it-IT",
  },
  nl: {
    preview: (t) => `Je bent uitgenodigd voor de vergadering "${t}"`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Uitnodiging voor een vergadering",
    body: (t, c) => (
      <>
        Je bent uitgenodigd voor de vergadering <strong>{t}</strong>
        {c ? (
          <>
            {" "}van <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Wanneer",
    whereLabel: "Waar",
    cta: "Vergadering bekijken",
    or: "Of kopieer deze link in je browser:",
    subject: (t) => `Uitnodiging: ${t}`,
    dateLocale: "nl-NL",
  },
  pt: {
    preview: (t) => `Você foi convocado·a para a reunião "${t}"`,
    hello: (n) => (n ? `Olá ${n},` : "Olá,"),
    title: "Convocação para uma reunião",
    body: (t, c) => (
      <>
        Você foi convocado·a para a reunião <strong>{t}</strong>
        {c ? (
          <>
            {" "}organizada por <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Quando",
    whereLabel: "Onde",
    cta: "Ver a reunião",
    or: "Ou copie este link no seu navegador:",
    subject: (t) => `Convocação: ${t}`,
    dateLocale: "pt-PT",
  },
};

function pickLocale(l?: string): Locale {
  const v = (l ?? "fr").toLowerCase().slice(0, 2);
  return (["fr", "en", "de", "es", "it", "nl", "pt"] as const).includes(v as Locale)
    ? (v as Locale)
    : "fr";
}

function formatWhen(iso: string | null | undefined, dateLocale: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(dateLocale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

const MeetingInviteEmail = ({
  displayName,
  meetingTitle,
  meetingStartsAt,
  location,
  clubName,
  eventUrl,
  locale,
}: Props) => {
  const c = COPY[pickLocale(locale)];
  const when = formatWhen(meetingStartsAt, c.dateLocale);
  return (
    <EmailShell preview={c.preview(meetingTitle)} locale={locale}>
      <Heading style={h1}>{c.hello(displayName)}</Heading>
      <Heading style={h2}>{c.title}</Heading>
      <Text style={text}>{c.body(meetingTitle, clubName)}</Text>
      {when ? (
        <Text style={meta}>
          <strong>{c.whenLabel} :</strong> {when}
        </Text>
      ) : null}
      {location ? (
        <Text style={meta}>
          <strong>{c.whereLabel} :</strong> {location}
        </Text>
      ) : null}
      <Button style={button} href={eventUrl}>
        {c.cta}
      </Button>
      <Text style={small}>
        {c.or}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{eventUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: MeetingInviteEmail,
  subject: (data) => {
    const c = COPY[pickLocale(data.locale)];
    return c.subject(data.meetingTitle ?? "Réunion");
  },
  displayName: "Meeting invitation",
  previewData: {
    displayName: "Alex",
    meetingTitle: "Réunion staff",
    meetingStartsAt: new Date().toISOString(),
    location: "Salle du club",
    clubName: "FC Clubero",
    eventUrl: "https://clubero.app/events/abc",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 8px" };
const h2 = { fontSize: "16px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const meta = { fontSize: "14px", color: "#334155", lineHeight: "1.5", margin: "0 0 8px" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "12px",
};
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
