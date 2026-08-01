import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailShell, formatEmailDateTime } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en";

interface Props {
  coachFirstName?: string;
  playerName: string;
  eventTitle: string;
  eventDate?: string;
  status: "absent" | "uncertain";
  isChange?: boolean;
  reason?: string;
  declaredByName?: string;
  eventUrl: string;
  locale?: Locale;
}

const T = {
  fr: {
    labels: { absent: "Absent", uncertain: "Incertain" },
    preview: (n: string, s: string, t: string) => `${n} a répondu : ${s} — ${t}`,
    previewChange: (n: string, s: string, t: string) => `${n} a modifié sa réponse : ${s} — ${t}`,
    subject: (n: string, s: string, t: string) => `${n} : ${s} — ${t}`,
    subjectChange: (n: string, s: string, t: string) => `${n} (réponse modifiée) : ${s} — ${t}`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    answered: "a répondu",
    changed: "a modifié sa réponse en",
    changeBadge: "Réponse modifiée",
    toCallup: "à la convocation pour",
    reason: "Motif",
    declaredBy: (n: string) => `Déclaré par ${n}.`,
    seeEvent: "Voir l'événement",
    foot: "Vous recevez cet e-mail en tant que coach de l'équipe sur Clubero.",
  },
  en: {
    labels: { absent: "Absent", uncertain: "Uncertain" },
    preview: (n: string, s: string, t: string) => `${n} replied: ${s} — ${t}`,
    previewChange: (n: string, s: string, t: string) => `${n} changed their reply: ${s} — ${t}`,
    subject: (n: string, s: string, t: string) => `${n}: ${s} — ${t}`,
    subjectChange: (n: string, s: string, t: string) => `${n} (reply updated): ${s} — ${t}`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    answered: "replied",
    changed: "changed their reply to",
    changeBadge: "Reply updated",
    toCallup: "to the call-up for",
    reason: "Reason",
    declaredBy: (n: string) => `Declared by ${n}.`,
    seeEvent: "View event",
    foot: "You receive this email as a team coach on Clubero.",
  },
} as const;

const ConvocationResponseEmail = ({
  coachFirstName,
  playerName,
  eventTitle,
  eventDate,
  status,
  isChange,
  reason,
  declaredByName,
  eventUrl,
  locale,
}: Props) => {
  const l: Locale = locale === "fr" ? "fr" : "en";
  const t = T[l];
  const statusLabel = t.labels[status];
  const eventDateFmt = formatEmailDateTime(eventDate, l);
  return (
    <EmailShell
      preview={
        isChange
          ? t.previewChange(playerName, statusLabel, eventTitle)
          : t.preview(playerName, statusLabel, eventTitle)
      }
      locale={l}
    >
      <Heading style={h1}>{t.hello(coachFirstName)}</Heading>
      {isChange && <Text style={changeBadge}>{t.changeBadge}</Text>}
      <Text style={text}>
        <strong>{playerName}</strong> {isChange ? t.changed : t.answered}{" "}
        <strong style={{ color: status === "absent" ? "#dc2626" : "#d97706" }}>
          {statusLabel}
        </strong>{" "}
        {t.toCallup} <strong>{eventTitle}</strong>
        {eventDateFmt ? <> ({eventDateFmt})</> : null}.
      </Text>
      {declaredByName && <Text style={subtle}>{t.declaredBy(declaredByName)}</Text>}
      {reason && (
        <Section style={reasonBox}>
          <Text style={reasonLabel}>{t.reason}</Text>
          <Text style={reasonText}>"{reason}"</Text>
        </Section>
      )}
      <Button style={button} href={eventUrl}>
        {t.seeEvent}
      </Button>
    </EmailShell>
  );
};

export const template = {
  component: ConvocationResponseEmail,
  subject: (d) => {
    const l: Locale = (d as any).locale === "fr" ? "fr" : "en";
    const status = d.status as "absent" | "uncertain";
    const fn = (d as any).isChange ? T[l].subjectChange : T[l].subject;
    return fn(d.playerName as string, T[l].labels[status] ?? status, d.eventTitle as string);
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
const changeBadge = {
  display: "inline-block",
  fontSize: "11px",
  fontWeight: "bold" as const,
  textTransform: "uppercase" as const,
  color: "#b45309",
  backgroundColor: "#fef3c7",
  borderRadius: "999px",
  padding: "4px 10px",
  margin: "0 0 12px",
};
const subtle = { fontSize: "13px", color: "#64748b", margin: "0 0 16px" };
const reasonBox = {
  backgroundColor: "#f1f5f9",
  borderRadius: "10px",
  padding: "12px 16px",
  margin: "0 0 20px",
};
const reasonLabel = {
  fontSize: "11px",
  textTransform: "uppercase" as const,
  color: "#64748b",
  margin: "0 0 4px",
  fontWeight: "bold" as const,
};
const reasonText = { fontSize: "14px", color: "#0f172a", fontStyle: "italic" as const, margin: 0 };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
};
