import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  parentFirstName?: string;
  playerName: string;
  clubName?: string;
  appUrl: string;
  locale?: string;
}

const T = {
  fr: {
    subject: (player: string, club?: string) =>
      club
        ? `${player} vous a été rattaché·e comme parent sur ${club}`
        : `${player} vous a été rattaché·e comme parent`,
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (player: string, club?: string) =>
      club
        ? `${player} vient d'être rattaché·e à votre compte Clubero en tant que parent au sein du club ${club}.`
        : `${player} vient d'être rattaché·e à votre compte Clubero en tant que parent.`,
    detail:
      "Vous recevrez désormais ses convocations, communications et notifications directement sur ce compte.",
    open: "Ouvrir Clubero",
    foot: "Vous recevez cet e-mail car un enfant a été rattaché à votre compte Clubero.",
  },
  en: {
    subject: (player: string, club?: string) =>
      club
        ? `${player} has been linked to you as a parent on ${club}`
        : `${player} has been linked to you as a parent`,
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (player: string, club?: string) =>
      club
        ? `${player} has just been linked to your Clubero account as a parent at ${club}.`
        : `${player} has just been linked to your Clubero account as a parent.`,
    detail: "You will now receive their call-ups, messages and notifications on this account.",
    open: "Open Clubero",
    foot: "You are receiving this email because a child was linked to your Clubero account.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({ parentFirstName, playerName, clubName, appUrl, locale }: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.body(playerName, clubName)} locale={l}>
      <Heading style={h1}>{t.hello(parentFirstName)}</Heading>
      <Text style={text}>
        <strong>{t.body(playerName, clubName)}</strong>
      </Text>
      <Text style={text}>{t.detail}</Text>
      <Button style={button} href={appUrl}>
        {t.open}
      </Button>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (d) => {
    const l = pickLocale((d as any).locale);
    return pick(l).subject(
      (d as any).playerName as string,
      (d as any).clubName as string | undefined,
    );
  },
  displayName: "Parent — child linked",
  previewData: {
    parentFirstName: "Sophie",
    playerName: "Léo Dupont",
    clubName: "FC Exemple",
    appUrl: "https://www.clubero.app/",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
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
