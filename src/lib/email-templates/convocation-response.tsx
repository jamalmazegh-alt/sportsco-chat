import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en";

interface Props {
  coachFirstName?: string;
  playerName: string;
  eventTitle: string;
  eventDate?: string;
  status: "absent" | "uncertain";
  reason?: string;
  eventUrl: string;
  locale?: Locale;
}

const T = {
  fr: {
    labels: { absent: "Absent", uncertain: "Incertain" },
    preview: (n: string, s: string, t: string) => `${n} a répondu : ${s} — ${t}`,
    subject: (n: string, s: string, t: string) => `${n} : ${s} — ${t}`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    answered: "a répondu",
    toCallup: "à la convocation pour",
    reason: "Motif",
    seeEvent: "Voir l'événement",
    foot: "Vous recevez cet e-mail en tant que coach de l'équipe sur Clubero.",
  },
  en: {
    labels: { absent: "Absent", uncertain: "Uncertain" },
    preview: (n: string, s: string, t: string) => `${n} replied: ${s} — ${t}`,
    subject: (n: string, s: string, t: string) => `${n}: ${s} — ${t}`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    answered: "replied",
    toCallup: "to the call-up for",
    reason: "Reason",
    seeEvent: "View event",
    foot: "You receive this email as a team coach on Clubero.",
  },
} as const;

const ConvocationResponseEmail = ({
  coachFirstName, playerName, eventTitle, eventDate, status, reason, eventUrl, locale,
}: Props) => {
  const l: Locale = locale === "fr" ? "fr" : "en";
  const t = T[l];
  const statusLabel = t.labels[status];
  return (
  <EmailShell preview={`${t.preview(playerName, statusLabel, eventTitle)}`} locale={l}>
        <Heading style={h1}>{t.hello(coachFirstName)}</Heading>
        <Text style={text}>
          <strong>{playerName}</strong> {t.answered}{" "}
          <strong style={{ color: status === "absent" ? "#dc2626" : "#d97706" }}>
            {statusLabel}
          </strong>{" "}
          {t.toCallup} <strong>{eventTitle}</strong>
          {eventDate ? <> ({eventDate})</> : null}.
        </Text>
        {reason && (
          <Section style={reasonBox}>
            <Text style={reasonLabel}>{t.reason}</Text>
            <Text style={reasonText}>"{reason}"</Text>
          </Section>
        )}
        <Button style={button} href={eventUrl}>{t.seeEvent}</Button>
        </EmailShell>
  );
};

export const template = {
  component: ConvocationResponseEmail,
  subject: (d) => {
    const l: Locale = (d as any).locale === "fr" ? "fr" : "en";
    const status = d.status as "absent" | "uncertain";
    return T[l].subject(d.playerName as string, T[l].labels[status] ?? status, d.eventTitle as string);
  },
  displayName: "Convocation response",
  previewData: {
    coachFirstName: "Marc",
    playerName: "Leo Dupont",
    eventTitle: "Match vs FC Example",
    eventDate: "Saturday, May 24 at 3:00 PM",
    status: "absent",
    reason: "Family tournament this weekend",
    eventUrl: "https://app.clubero.app/events/123",
    locale: "en",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 20px" };
const reasonBox = { backgroundColor: "#f1f5f9", borderRadius: "10px", padding: "12px 16px", margin: "0 0 20px" };
const reasonLabel = { fontSize: "11px", textTransform: "uppercase" as const, color: "#64748b", margin: "0 0 4px", fontWeight: "bold" as const };
const reasonText = { fontSize: "14px", color: "#0f172a", fontStyle: "italic" as const, margin: 0 };
const button = {
  backgroundColor: "#0f172a", color: "#ffffff", fontSize: "14px",
  borderRadius: "10px", padding: "12px 20px", textDecoration: "none", display: "inline-block",
};
