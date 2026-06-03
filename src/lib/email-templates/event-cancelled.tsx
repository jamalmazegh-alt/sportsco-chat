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
  reason: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  locale?: Locale;
}

const T = {
  fr: {
    subject: (title: string, date?: string) => `❌ Annulé : ${title}${date ? ` — ${date}` : ""}`,
    preview: (title: string, date?: string) => `Événement annulé : ${title}${date ? ` — ${date}` : ""}`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: "L'événement",
    forWhich: (n: string) => <> auquel <strong>{n}</strong> était convoqué·e</>,
    withTeam: (n: string) => <> avec <strong>{n}</strong></>,
    hasBeen: <> a été <strong>annulé</strong>.</>,
    kicker: "ANNULÉ",
    reasonLabel: "Raison de l'annulation",
    foot: "Aucune action n'est requise de votre part. Vous serez prévenu·e en cas de reprogrammation.",
    sentBy: "Envoyé par",
    via: "via Clubero",
  },
  en: {
    subject: (title: string, date?: string) => `❌ Cancelled: ${title}${date ? ` — ${date}` : ""}`,
    preview: (title: string, date?: string) => `Event cancelled: ${title}${date ? ` — ${date}` : ""}`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    intro: "The event",
    forWhich: (n: string) => <> that <strong>{n}</strong> was called up to</>,
    withTeam: (n: string) => <> with <strong>{n}</strong></>,
    hasBeen: <> has been <strong>cancelled</strong>.</>,
    kicker: "CANCELLED",
    reasonLabel: "Cancellation reason",
    foot: "Nothing else is required from you. We'll let you know if the event is rescheduled.",
    sentBy: "Sent by",
    via: "via Clubero",
  },
} as const;

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
  locale,
}: Props) => {
  const l: Locale = locale === "fr" ? "fr" : "en";
  const t = T[l];
  return (
  <EmailShell preview={`${t.preview(eventTitle, eventDate)}`} locale={l} clubName={clubName} clubLogoUrl={clubLogoUrl}>
        <Heading style={h1}>{t.hello(recipientFirstName)}</Heading>

        <Text style={text}>
          {t.intro}
          {playerName ? t.forWhich(playerName) : null}
          {teamName ? t.withTeam(teamName) : null}
          {t.hasBeen}
        </Text>

        <Section style={card}>
          <Text style={cardKicker}>{t.kicker}</Text>
          <Text style={cardTitle}>{eventTitle}</Text>
          {eventDate ? <Text style={cardMeta}>📅 {eventDate}</Text> : null}
          {eventLocation ? <Text style={cardMeta}>📍 {eventLocation}</Text> : null}
        </Section>

        <Section style={reasonCard}>
          <Text style={reasonLabel}>{t.reasonLabel}</Text>
          <Text style={reasonText}>{reason}</Text>
        </Section>

        <Text style={smallText}>{t.foot}</Text>

        </EmailShell>
  );
};

export const template = {
  component: EventCancelledEmail,
  subject: (d) => {
    const l: Locale = (d as any).locale === "fr" ? "fr" : "en";
    return T[l].subject(d.eventTitle as string, d.eventDate as string | undefined);
  },
  displayName: "Event cancelled",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Leo Dupont",
    eventTitle: "vs FC Example",
    eventDate: "Saturday, May 24 at 3:00 PM",
    eventLocation: "Municipal Stadium, Paris",
    reason: "Pitch unplayable due to weather.",
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
