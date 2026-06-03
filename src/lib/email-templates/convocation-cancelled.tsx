import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, formatEmailDateTime } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en";

interface Props {
  recipientFirstName?: string;
  playerName?: string;
  eventTitle: string;
  eventDate?: string;
  eventLocation?: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  locale?: Locale;
}

const T = {
  fr: {
    subject: (title: string, date?: string) => `Convocation annulée : ${title}${date ? ` — ${date}` : ""}`,
    preview: "Convocation annulée",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    bodyPlayer: "n'est plus convoqué·e",
    bodyYou: "Vous n'êtes plus convoqué·e",
    withTeam: "avec",
    forEvent: "pour cet événement.",
    kicker: "CONVOCATION ANNULÉE",
    foot: "L'événement, lui, est maintenu. Aucune action n'est requise. Le coach reviendra vers vous en cas de changement.",
    sentBy: "Envoyé par",
    via: "via Clubero",
  },
  en: {
    subject: (title: string, date?: string) => `Call-up cancelled: ${title}${date ? ` — ${date}` : ""}`,
    preview: "Call-up cancelled",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    bodyPlayer: "is no longer called up",
    bodyYou: "You are no longer called up",
    withTeam: "with",
    forEvent: "for this event.",
    kicker: "CALL-UP CANCELLED",
    foot: "The event itself is still on. Nothing else is required from you. The coach will reach out if anything changes.",
    sentBy: "Sent by",
    via: "via Clubero",
  },
} as const;

const ConvocationCancelledEmail = ({
  recipientFirstName,
  playerName,
  eventTitle,
  eventDate,
  eventLocation,
  teamName,
  clubName,
  clubLogoUrl,
  locale,
}: Props) => {
  const l: Locale = locale === "fr" ? "fr" : "en";
  const t = T[l];
  const eventDateFmt = formatEmailDateTime(eventDate, l);
  return (
  <EmailShell preview={`${t.preview}: ${eventTitle}${eventDateFmt ? ` — ${eventDateFmt}` : ""}`} locale={l} clubName={clubName} clubLogoUrl={clubLogoUrl}>
        <Heading style={h1}>{t.hello(recipientFirstName)}</Heading>

        <Text style={text}>
          {playerName ? <><strong>{playerName}</strong> {t.bodyPlayer}</> : <>{t.bodyYou}</>}
          {teamName ? <> {t.withTeam} <strong>{teamName}</strong></> : null}
          {" "}{t.forEvent}
        </Text>

        <Section style={card}>
          <Text style={cardKicker}>{t.kicker}</Text>
          <Text style={cardTitle}>{eventTitle}</Text>
          {eventDateFmt ? <Text style={cardMeta}>📅 {eventDateFmt}</Text> : null}
          {eventLocation ? <Text style={cardMeta}>📍 {eventLocation}</Text> : null}
        </Section>

        <Text style={smallText}>{t.foot}</Text>

        </EmailShell>
  );
};

export const template = {
  component: ConvocationCancelledEmail,
  subject: (d) => {
    const l: Locale = (d as any).locale === "fr" ? "fr" : "en";
    return T[l].subject(d.eventTitle as string, formatEmailDateTime(d.eventDate as string | undefined, l));
  },
  displayName: "Convocation cancelled",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Leo Dupont",
    eventTitle: "vs FC Example",
    eventDate: "Saturday, May 24 at 3:00 PM",
    eventLocation: "Municipal Stadium, Paris",
    teamName: "U13 Boys",
    clubName: "AS Clubero",
    locale: "en",
  },
} satisfies TemplateEntry;

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
