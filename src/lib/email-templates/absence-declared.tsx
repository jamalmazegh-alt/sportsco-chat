import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  coachFirstName?: string;
  playerName: string;
  startDate: string; // pre-formatted in coach locale
  endDate: string;
  reasonLabel?: string;
  declaredByName?: string;
  eventUrl: string;
  locale?: string;
}

const T = {
  fr: {
    subject: (n: string, s: string, e: string) =>
      s === e ? `${n} sera absent·e le ${s}` : `${n} sera absent·e du ${s} au ${e}`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (player: string, s: string, e: string) =>
      s === e
        ? `${player} sera absent·e le ${s}.`
        : `${player} sera absent·e du ${s} au ${e}.`,
    declaredBy: (n: string) => `Déclaré par ${n}.`,
    reason: "Motif",
    seeProfile: "Voir le profil joueur",
    foot: "Vous recevez cet e-mail en tant que coach de l'équipe sur Clubero.",
  },
  en: {
    subject: (n: string, s: string, e: string) =>
      s === e ? `${n} will be unavailable on ${s}` : `${n} will be unavailable from ${s} to ${e}`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (player: string, s: string, e: string) =>
      s === e
        ? `${player} will be unavailable on ${s}.`
        : `${player} will be unavailable from ${s} to ${e}.`,
    declaredBy: (n: string) => `Declared by ${n}.`,
    reason: "Reason",
    seeProfile: "View player profile",
    foot: "You receive this email as a team coach on Clubero.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({ coachFirstName, playerName, startDate, endDate, reasonLabel, declaredByName, eventUrl, locale }: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.body(playerName, startDate, endDate)} locale={l}>
      <Heading style={h1}>{t.hello(coachFirstName)}</Heading>
      <Text style={text}>
        <strong>{t.body(playerName, startDate, endDate)}</strong>
      </Text>
      {declaredByName && <Text style={subtle}>{t.declaredBy(declaredByName)}</Text>}
      {reasonLabel && (
        <Text style={text}>
          <strong>{t.reason} :</strong> {reasonLabel}
        </Text>
      )}
      <Button style={button} href={eventUrl}>{t.seeProfile}</Button>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (d) => {
    const l = pickLocale((d as any).locale);
    return pick(l).subject(d.playerName as string, d.startDate as string, d.endDate as string);
  },
  displayName: "Absence declared",
  previewData: {
    coachFirstName: "Marc",
    playerName: "Léo Dupont",
    startDate: "samedi 13 juin",
    endDate: "dimanche 14 juin",
    reasonLabel: "Vacances",
    declaredByName: "Sophie",
    eventUrl: "https://app.clubero.app/players/123",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const subtle = { fontSize: "13px", color: "#64748b", margin: "0 0 16px" };
const button = {
  backgroundColor: "#0f172a", color: "#ffffff", fontSize: "14px",
  borderRadius: "10px", padding: "12px 20px", textDecoration: "none", display: "inline-block",
  marginTop: "8px",
};
