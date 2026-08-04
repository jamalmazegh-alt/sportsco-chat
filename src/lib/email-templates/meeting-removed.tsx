import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Props {
  displayName?: string | null;
  meetingTitle: string;
  clubName?: string | null;
  eventUrl?: string | null;
  locale?: Locale;
}

const COPY: Record<
  Locale,
  {
    preview: (t: string) => string;
    hello: (n?: string | null) => string;
    title: string;
    body: (t: string, c?: string | null) => React.ReactNode;
    cta: string;
    subject: (t: string) => string;
  }
> = {
  fr: {
    preview: (t) => `Vous n'êtes plus convoqué·e à la réunion « ${t} »`,
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: "Vous n'êtes plus convoqué·e à une réunion",
    body: (t, c) => (
      <>
        Vous n'êtes plus convoqué·e à la réunion <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organisée par <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    cta: "Voir la réunion",
    subject: (t) => `Retrait de convocation : ${t}`,
  },
  en: {
    preview: (t) => `You are no longer invited to the meeting "${t}"`,
    hello: (n) => (n ? `Hi ${n},` : "Hello,"),
    title: "You are no longer invited to a meeting",
    body: (t, c) => (
      <>
        You are no longer invited to the meeting <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organised by <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    cta: "View meeting",
    subject: (t) => `Meeting invitation removed: ${t}`,
  },
  de: {
    preview: (t) => `Sie sind nicht mehr zur Besprechung „${t}" eingeladen`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Sie sind nicht mehr zu einer Besprechung eingeladen",
    body: (t, c) => (
      <>
        Sie sind nicht mehr zur Besprechung <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            von <strong>{c}</strong>
          </>
        ) : null}{" "}
        eingeladen.
      </>
    ),
    cta: "Besprechung ansehen",
    subject: (t) => `Einladung zurückgezogen: ${t}`,
  },
  es: {
    preview: (t) => `Ya no estás convocado·a a la reunión «${t}»`,
    hello: (n) => (n ? `Hola ${n},` : "Hola,"),
    title: "Ya no estás convocado·a a una reunión",
    body: (t, c) => (
      <>
        Ya no estás convocado·a a la reunión <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organizada por <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    cta: "Ver la reunión",
    subject: (t) => `Convocatoria retirada: ${t}`,
  },
  it: {
    preview: (t) => `Non sei più convocato·a alla riunione «${t}»`,
    hello: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    title: "Non sei più convocato·a a una riunione",
    body: (t, c) => (
      <>
        Non sei più convocato·a alla riunione <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organizzata da <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    cta: "Vedi la riunione",
    subject: (t) => `Convocazione ritirata: ${t}`,
  },
  nl: {
    preview: (t) => `Je bent niet meer uitgenodigd voor de vergadering "${t}"`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Je bent niet meer uitgenodigd voor een vergadering",
    body: (t, c) => (
      <>
        Je bent niet meer uitgenodigd voor de vergadering <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            van <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    cta: "Vergadering bekijken",
    subject: (t) => `Uitnodiging ingetrokken: ${t}`,
  },
  pt: {
    preview: (t) => `Você não está mais convocado·a para a reunião "${t}"`,
    hello: (n) => (n ? `Olá ${n},` : "Olá,"),
    title: "Você não está mais convocado·a para uma reunião",
    body: (t, c) => (
      <>
        Você não está mais convocado·a para a reunião <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organizada por <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    cta: "Ver a reunião",
    subject: (t) => `Convocação retirada: ${t}`,
  },
};

function pickLocale(l?: string): Locale {
  const v = (l ?? "fr").toLowerCase().slice(0, 2);
  return (["fr", "en", "de", "es", "it", "nl", "pt"] as const).includes(v as Locale)
    ? (v as Locale)
    : "fr";
}

const MeetingRemovedEmail = ({ displayName, meetingTitle, clubName, eventUrl, locale }: Props) => {
  const l = pickLocale(locale);
  const c = COPY[l];
  return (
    <EmailShell preview={c.preview(meetingTitle)} locale={l}>
      <Heading style={h1}>{c.hello(displayName)}</Heading>
      <Heading style={h2}>{c.title}</Heading>
      <Text style={text}>{c.body(meetingTitle, clubName)}</Text>
      {eventUrl ? (
        <Button style={button} href={eventUrl}>
          {c.cta}
        </Button>
      ) : null}
    </EmailShell>
  );
};

export const template = {
  component: MeetingRemovedEmail,
  subject: (data) => {
    const c = COPY[pickLocale(data.locale)];
    return c.subject(data.meetingTitle ?? "Réunion");
  },
  displayName: "Meeting invitation removed",
  previewData: {
    displayName: "Alex",
    meetingTitle: "Réunion staff",
    clubName: "FC Clubero",
    eventUrl: "https://clubero.app/events/abc",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 8px" };
const h2 = { fontSize: "16px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
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
