import * as React from "react";
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface TournamentProgrammePublishedProps {
  teamName?: string;
  tournamentName?: string;
  startDate?: string;
  firstMatchDate?: string | null;
  firstMatchTime?: string | null;
  firstMatchField?: string | null;
  firstMatchOpponent?: string | null;
  programmeUrl: string;
  locale?: "fr" | "en";
}

const COPY = {
  fr: {
    preview: (name: string) => `Le programme de ${name} est disponible !`,
    subject: (name: string) => `Le programme de ${name} est disponible !`,
    hello: (team: string) => `Bonjour ${team},`,
    body: (name: string, date: string) =>
      `Le programme du tournoi ${name} (${date}) vient d'être publié.`,
    firstMatchTitle: "Votre premier match :",
    iconDate: (d: string, t: string) => `📅 ${d} à ${t}`,
    iconField: (f: string) => `🏟️ Terrain : ${f}`,
    iconOpponent: (o: string) => `⚽ Contre : ${o}`,
    cta: "Voir le programme complet →",
    footer: "Bon tournoi à votre équipe !",
  },
  en: {
    preview: (name: string) => `The programme for ${name} is available!`,
    subject: (name: string) => `The programme for ${name} is available!`,
    hello: (team: string) => `Hello ${team},`,
    body: (name: string, date: string) =>
      `The programme for ${name} (${date}) has just been published.`,
    firstMatchTitle: "Your first match:",
    iconDate: (d: string, t: string) => `📅 ${d} at ${t}`,
    iconField: (f: string) => `🏟️ Field: ${f}`,
    iconOpponent: (o: string) => `⚽ vs: ${o}`,
    cta: "View full programme →",
    footer: "Have a great tournament!",
  },
} as const;

const TournamentProgrammePublishedEmail = ({
  teamName,
  tournamentName,
  startDate,
  firstMatchDate,
  firstMatchTime,
  firstMatchField,
  firstMatchOpponent,
  programmeUrl,
  locale,
}: TournamentProgrammePublishedProps) => {
  const lang = locale === "en" ? "en" : "fr";
  const copy = COPY[lang];
  const team = teamName ?? (lang === "fr" ? "votre équipe" : "your team");
  const tournament = tournamentName ?? (lang === "fr" ? "le tournoi" : "the tournament");
  const date = startDate ?? "";
  const hasFirstMatch = !!(firstMatchDate && firstMatchTime);

  return (
    <Html lang={lang} dir="ltr">
      <Head />
      <Preview>{copy.preview(tournament)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://www.clubero.app/clubero-logo.png"
              alt="Clubero"
              width="56"
              height="56"
              style={logo}
            />
            <Text style={brand}>Clubero · Tournois</Text>
          </Section>
          <Heading style={h1}>{copy.hello(team)}</Heading>
          <Text style={text}>{copy.body(tournament, date)}</Text>

          {hasFirstMatch && (
            <Section style={matchBox}>
              <Text style={matchTitle}>{copy.firstMatchTitle}</Text>
              <Text style={matchLine}>
                {copy.iconDate(firstMatchDate as string, firstMatchTime as string)}
              </Text>
              {firstMatchField && (
                <Text style={matchLine}>{copy.iconField(firstMatchField)}</Text>
              )}
              {firstMatchOpponent && (
                <Text style={matchLine}>{copy.iconOpponent(firstMatchOpponent)}</Text>
              )}
            </Section>
          )}

          <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
            <Button style={button} href={programmeUrl}>
              {copy.cta}
            </Button>
          </Section>

          <Text style={small}>
            {lang === "fr"
              ? "Ou copiez ce lien dans votre navigateur :"
              : "Or copy this link into your browser:"}
            <br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{programmeUrl}</span>
          </Text>
          <Text style={footer}>{copy.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TournamentProgrammePublishedEmail,
  subject: (data) => {
    const lang = data.locale === "en" ? "en" : "fr";
    const name = data.tournamentName ?? (lang === "fr" ? "votre tournoi" : "your tournament");
    return COPY[lang].subject(name);
  },
  displayName: "Tournament programme published",
  previewData: {
    teamName: "FC Demo",
    tournamentName: "Coupe d'été 2026",
    startDate: "15 juin 2026",
    firstMatchDate: "15/06/2026",
    firstMatchTime: "10:30",
    firstMatchField: "Terrain 1",
    firstMatchOpponent: "AS Sample",
    programmeUrl: "https://clubero.app/tournament/coupe-ete",
    locale: "fr",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "8px 0 0", textAlign: "center" as const };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const matchBox = {
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "16px 20px",
  margin: "16px 0",
  backgroundColor: "#f8fafc",
};
const matchTitle = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 8px", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
const matchLine = { fontSize: "15px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const button = {
  backgroundColor: "#10b981",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "bold" as const,
  borderRadius: "10px",
  padding: "14px 28px",
  textDecoration: "none",
  display: "inline-block",
};
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
