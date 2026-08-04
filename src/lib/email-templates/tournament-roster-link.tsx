import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  contactName?: string;
  tournamentName?: string;
  teamName?: string;
  rosterUrl: string;
  status?: "approved" | "pending";
  locale?: string;
}

const T = {
  fr: {
    defaultTournament: "votre tournoi",
    defaultTeam: "votre équipe",
    preview: (team: string) => `Composez l'effectif de ${team}`,
    brand: "Clubero · Tournois",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    approved: (team: string, tournament: string) => (
      <>
        Bonne nouvelle ! La candidature de <strong>{team}</strong> pour{" "}
        <strong>{tournament}</strong> a été validée.
      </>
    ),
    pending: (team: string, tournament: string) => (
      <>
        Votre inscription de <strong>{team}</strong> pour <strong>{tournament}</strong> est bien
        enregistrée.
      </>
    ),
    body: "Vous pouvez désormais composer l'effectif de votre équipe en quelques clics. Ce lien est personnel — conservez-le précieusement, il vous permettra de modifier la liste à tout moment.",
    cta: "Composer l'effectif",
    orLink: "Ou copiez ce lien dans votre navigateur :",
    subject: (tournament: string) => `Composez l'effectif de votre équipe — ${tournament}`,
  },
  en: {
    defaultTournament: "your tournament",
    defaultTeam: "your team",
    preview: (team: string) => `Build the roster for ${team}`,
    brand: "Clubero · Tournaments",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    approved: (team: string, tournament: string) => (
      <>
        Great news! The application for <strong>{team}</strong> to <strong>{tournament}</strong> has
        been approved.
      </>
    ),
    pending: (team: string, tournament: string) => (
      <>
        Your registration for <strong>{team}</strong> at <strong>{tournament}</strong> has been
        recorded.
      </>
    ),
    body: "You can now build your team roster in a few clicks. This link is personal — keep it safe; it lets you update the list anytime.",
    cta: "Build roster",
    orLink: "Or copy this link into your browser:",
    subject: (tournament: string) => `Build your team roster — ${tournament}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const TournamentRosterLinkEmail = ({
  contactName,
  tournamentName,
  teamName,
  rosterUrl,
  status = "approved",
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const tournament = tournamentName ?? t.defaultTournament;
  const team = teamName ?? t.defaultTeam;

  return (
    <EmailShell preview={t.preview(team)} locale={l}>
      <Section style={header}>
        <Img
          src="https://www.clubero.app/clubero-logo.png"
          alt="Clubero"
          width="56"
          height="56"
          style={logo}
        />
        <Text style={brand}>{t.brand}</Text>
      </Section>
      <Heading style={h1}>{t.hello(contactName)}</Heading>
      <Text style={text}>
        {status === "approved" ? t.approved(team, tournament) : t.pending(team, tournament)}
      </Text>
      <Text style={text}>{t.body}</Text>
      <Button style={button} href={rosterUrl}>
        {t.cta}
      </Button>
      <Text style={small}>
        {t.orLink}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{rosterUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: TournamentRosterLinkEmail,
  subject: (data) => {
    const l = pickLocale((data as { locale?: string }).locale);
    const t = pick(l);
    const tournament = (data.tournamentName as string | undefined) ?? t.defaultTournament;
    return t.subject(tournament);
  },
  displayName: "Tournament roster link",
  previewData: {
    contactName: "Alex",
    tournamentName: "Coupe d'été 2026",
    teamName: "Les Lions",
    rosterUrl: "https://clubero.app/tournament/coupe/roster/sample-token",
    status: "approved" as const,
    locale: "fr",
  },
} satisfies TemplateEntry;

const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = {
  fontSize: "13px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "8px 0 0",
  textAlign: "center" as const,
};
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 20px" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
};
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
