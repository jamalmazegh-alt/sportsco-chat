import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, formatEmailDateTime } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en";

interface Props {
  recipientFirstName?: string;
  playerName?: string;
  eventTitle: string;
  previousDate?: string;
  newDate: string;
  eventLocation?: string;
  reason?: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  locale?: Locale;
}

const T = {
  fr: {
    subject: (title: string, newDate: string) => `🔁 Reporté : ${title} — ${newDate}`,
    preview: (title: string, newDate: string) => `Événement reporté : ${title} — ${newDate}`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: "L'événement",
    forWhich: (n: string) => <> auquel <strong>{n}</strong> est convoqué·e</>,
    withTeam: (n: string) => <> avec <strong>{n}</strong></>,
    hasBeen: <> a été <strong>reporté</strong>.</>,
    kicker: "REPORTÉ",
    reasonLabel: "Raison du report",
    foot: "Merci de mettre à jour votre réponse à la convocation si nécessaire.",
    sentBy: "Envoyé par",
    via: "via Clubero",
  },
  en: {
    subject: (title: string, newDate: string) => `🔁 Rescheduled: ${title} — ${newDate}`,
    preview: (title: string, newDate: string) => `Event rescheduled: ${title} — ${newDate}`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    intro: "The event",
    forWhich: (n: string) => <> that <strong>{n}</strong> is called up to</>,
    withTeam: (n: string) => <> with <strong>{n}</strong></>,
    hasBeen: <> has been <strong>rescheduled</strong>.</>,
    kicker: "RESCHEDULED",
    reasonLabel: "Reason",
    foot: "Please update your call-up response if needed.",
    sentBy: "Sent by",
    via: "via Clubero",
  },
} as const;

const EventRescheduledEmail = ({
  recipientFirstName,
  playerName,
  eventTitle,
  previousDate,
  newDate,
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
  <EmailShell preview={`${t.preview(eventTitle, newDate)}`} locale={l} clubName={clubName} clubLogoUrl={clubLogoUrl}>
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
          {previousDate ? (
            <Text style={cardMetaOld}>📅 <span style={strike}>{previousDate}</span></Text>
          ) : null}
          <Text style={cardMetaNew}>✅ {newDate}</Text>
          {eventLocation ? <Text style={cardMeta}>📍 {eventLocation}</Text> : null}
        </Section>

        {reason ? (
          <Section style={reasonCard}>
            <Text style={reasonLabel}>{t.reasonLabel}</Text>
            <Text style={reasonText}>{reason}</Text>
          </Section>
        ) : null}

        <Text style={smallText}>{t.foot}</Text>

        </EmailShell>
  );
};

export const template = {
  component: EventRescheduledEmail,
  subject: (d) => {
    const l: Locale = (d as any).locale === "fr" ? "fr" : "en";
    return T[l].subject(d.eventTitle as string, d.newDate as string);
  },
  displayName: "Event rescheduled",
  previewData: {
    recipientFirstName: "Sophie",
    playerName: "Leo Dupont",
    eventTitle: "vs FC Example",
    previousDate: "Saturday, May 24 at 3:00 PM",
    newDate: "Sunday, June 1 at 3:00 PM",
    eventLocation: "Municipal Stadium, Paris",
    reason: "Pitch unavailable.",
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
  color: "#d97706",
  fontWeight: "bold" as const,
  margin: "0 0 6px",
};
const cardTitle = { fontSize: "17px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 10px" };
const cardMeta = { fontSize: "13px", color: "#475569", margin: "0 0 4px" };
const cardMetaOld = { fontSize: "13px", color: "#94a3b8", margin: "0 0 4px" };
const cardMetaNew = { fontSize: "14px", color: "#047857", fontWeight: "bold" as const, margin: "4px 0" };
const strike = { textDecoration: "line-through" as const };
const reasonCard = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "12px",
  padding: "14px 16px",
  margin: "0 0 16px",
};
const reasonLabel = {
  fontSize: "11px",
  letterSpacing: "0.5px",
  color: "#92400e",
  fontWeight: "bold" as const,
  textTransform: "uppercase" as const,
  margin: "0 0 6px",
};
const reasonText = { fontSize: "14px", color: "#78350f", lineHeight: "1.5", margin: 0, whiteSpace: "pre-wrap" as const };
