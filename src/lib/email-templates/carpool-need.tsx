import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  coachFirstName?: string;
  playerNames: string;
  requesterName?: string;
  eventTitle: string;
  eventDate?: string;
  note?: string | null;
  eventUrl: string;
  locale?: string;
}

const T = {
  fr: {
    subject: (p: string, e: string) => `Besoin de transport — ${p} (${e})`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (p: string, e: string) => `${p} a besoin d'un transport pour ${e}.`,
    when: "Date",
    by: (n: string) => `Demande faite par ${n}.`,
    note: "Note",
    cta: "Voir le covoiturage",
    foot: "Vous recevez cet e-mail en tant qu'encadrant de l'équipe sur Clubero.",
  },
  en: {
    subject: (p: string, e: string) => `Ride needed — ${p} (${e})`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (p: string, e: string) => `${p} needs a ride for ${e}.`,
    when: "Date",
    by: (n: string) => `Requested by ${n}.`,
    note: "Note",
    cta: "View carpooling",
    foot: "You receive this email as a team staff member on Clubero.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({
  coachFirstName,
  playerNames,
  requesterName,
  eventTitle,
  eventDate,
  note,
  eventUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.body(playerNames, eventTitle)} locale={l}>
      <Heading style={h1}>{t.hello(coachFirstName)}</Heading>
      <Text style={text}>
        <strong>{t.body(playerNames, eventTitle)}</strong>
      </Text>
      {eventDate && (
        <Text style={text}>
          <strong>{t.when} :</strong> {eventDate}
        </Text>
      )}
      {requesterName && <Text style={subtle}>{t.by(requesterName)}</Text>}
      {note && (
        <Text style={text}>
          <strong>{t.note} :</strong> {note}
        </Text>
      )}
      <Button style={button} href={eventUrl}>
        {t.cta}
      </Button>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (d) => {
    const l = pickLocale((d as any).locale);
    return pick(l).subject(d.playerNames as string, d.eventTitle as string);
  },
  displayName: "Carpool ride needed",
  previewData: {
    coachFirstName: "Marc",
    playerNames: "Léo Dupont",
    requesterName: "Sophie Dupont",
    eventTitle: "Match U15 vs FC Metz",
    eventDate: "samedi 13 juin à 14:00",
    note: "Nous habitons vers la gare",
    eventUrl: "https://app.clubero.app/events/123",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const subtle = { fontSize: "13px", color: "#64748b", margin: "0 0 16px" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "8px",
};
