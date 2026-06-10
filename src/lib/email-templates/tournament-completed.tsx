import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Props {
  recipientFirstName?: string;
  tournamentName: string;
  teamsCount?: number;
  matchesCount?: number;
  winnerName?: string;
  pricingUrl: string;
  locale?: Locale;
}

const T: Record<
  Locale,
  {
    subject: (n: string) => string;
    preview: (n: string) => string;
    hello: (n?: string) => string;
    intro: (n: string) => string;
    summary: string;
    teams: string;
    matches: string;
    winner: string;
    cta: string;
    nextLead: string;
    foot: string;
  }
> = {
  fr: {
    subject: (n) => `Votre tournoi ${n} est terminé 🏆 — et après ?`,
    preview: (n) => `Bravo pour ${n} ! Découvrez Clubero toute l'année.`,
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: (n) => `Votre tournoi ${n} est terminé. Bravo pour l'organisation 🏆`,
    summary: "Récapitulatif",
    teams: "équipes",
    matches: "matchs",
    winner: "Vainqueur",
    cta: "Essayer Clubero gratuitement 30 jours",
    nextLead:
      "Continuez avec Clubero toute l'année : convocations, présences, covoiturage, discipline — tout ce qu'il faut pour gérer vos équipes au quotidien.",
    foot: "À très vite sur Clubero.",
  },
  en: {
    subject: (n) => `Your tournament ${n} is over 🏆 — what's next?`,
    preview: (n) => `Great job on ${n}! Discover Clubero year-round.`,
    hello: (n) => (n ? `Hi ${n},` : "Hi,"),
    intro: (n) => `Your tournament ${n} is over. Great job organising it 🏆`,
    summary: "Summary",
    teams: "teams",
    matches: "matches",
    winner: "Winner",
    cta: "Try Clubero free for 30 days",
    nextLead:
      "Keep using Clubero all year long: lineups, attendance, carpooling, discipline — everything you need to run your teams day-to-day.",
    foot: "See you on Clubero.",
  },
  de: {
    subject: (n) => `Ihr Turnier ${n} ist beendet 🏆 — und nun?`,
    preview: (n) => `Glückwunsch zu ${n}! Entdecken Sie Clubero das ganze Jahr.`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    intro: (n) => `Ihr Turnier ${n} ist beendet. Glückwunsch zur Organisation 🏆`,
    summary: "Zusammenfassung",
    teams: "Mannschaften",
    matches: "Spiele",
    winner: "Sieger",
    cta: "Clubero 30 Tage kostenlos testen",
    nextLead:
      "Nutzen Sie Clubero das ganze Jahr: Aufstellungen, Anwesenheit, Fahrgemeinschaften, Disziplin — alles für den Alltag Ihrer Mannschaften.",
    foot: "Bis bald auf Clubero.",
  },
  es: {
    subject: (n) => `Tu torneo ${n} ha terminado 🏆 — ¿y ahora?`,
    preview: (n) => `¡Enhorabuena por ${n}! Descubre Clubero todo el año.`,
    hello: (n) => (n ? `Hola ${n},` : "Hola,"),
    intro: (n) => `Tu torneo ${n} ha terminado. Enhorabuena por la organización 🏆`,
    summary: "Resumen",
    teams: "equipos",
    matches: "partidos",
    winner: "Ganador",
    cta: "Probar Clubero gratis 30 días",
    nextLead:
      "Sigue con Clubero todo el año: convocatorias, asistencia, carpooling, disciplina — todo lo que necesitas en el día a día.",
    foot: "Hasta pronto en Clubero.",
  },
  it: {
    subject: (n) => `Il tuo torneo ${n} è finito 🏆 — e adesso?`,
    preview: (n) => `Complimenti per ${n}! Scopri Clubero tutto l'anno.`,
    hello: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    intro: (n) => `Il tuo torneo ${n} è terminato. Complimenti per l'organizzazione 🏆`,
    summary: "Riepilogo",
    teams: "squadre",
    matches: "partite",
    winner: "Vincitore",
    cta: "Prova Clubero gratis 30 giorni",
    nextLead:
      "Continua con Clubero tutto l'anno: convocazioni, presenze, carpooling, disciplina — tutto il necessario per gestire le squadre.",
    foot: "A presto su Clubero.",
  },
  nl: {
    subject: (n) => `Uw toernooi ${n} is afgelopen 🏆 — wat nu?`,
    preview: (n) => `Goed gedaan met ${n}! Ontdek Clubero het hele jaar.`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    intro: (n) => `Uw toernooi ${n} is afgelopen. Goed gedaan met de organisatie 🏆`,
    summary: "Samenvatting",
    teams: "teams",
    matches: "wedstrijden",
    winner: "Winnaar",
    cta: "Clubero 30 dagen gratis proberen",
    nextLead:
      "Blijf Clubero het hele jaar gebruiken: oproepen, aanwezigheid, carpool, discipline — alles wat u dagelijks nodig heeft.",
    foot: "Tot snel op Clubero.",
  },
  pt: {
    subject: (n) => `O seu torneio ${n} terminou 🏆 — e agora?`,
    preview: (n) => `Parabéns por ${n}! Descubra a Clubero o ano todo.`,
    hello: (n) => (n ? `Olá ${n},` : "Olá,"),
    intro: (n) => `O seu torneio ${n} terminou. Parabéns pela organização 🏆`,
    summary: "Resumo",
    teams: "equipas",
    matches: "jogos",
    winner: "Vencedor",
    cta: "Experimentar a Clubero grátis 30 dias",
    nextLead:
      "Continue com a Clubero o ano todo: convocações, presenças, carona, disciplina — tudo para gerir as equipas.",
    foot: "Até breve na Clubero.",
  },
};

function pickLocale(l?: string): Locale {
  const v = (l ?? "fr").slice(0, 2).toLowerCase();
  if (v === "fr" || v === "en" || v === "de" || v === "es" || v === "it" || v === "nl" || v === "pt") {
    return v;
  }
  return "fr";
}

const TournamentCompletedEmail = ({
  recipientFirstName,
  tournamentName,
  teamsCount,
  matchesCount,
  winnerName,
  pricingUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = T[l];
  return (
    <EmailShell preview={t.preview(tournamentName)} locale={l === "fr" ? "fr" : "en"}>
      <Heading style={h1}>{t.hello(recipientFirstName)}</Heading>
      <Text style={text}>{t.intro(tournamentName)}</Text>

      <Section style={card}>
        <Text style={cardKicker}>{t.summary}</Text>
        <Text style={cardTitle}>{tournamentName}</Text>
        {(typeof teamsCount === "number" || typeof matchesCount === "number") && (
          <Text style={cardMeta}>
            {typeof teamsCount === "number" ? `${teamsCount} ${t.teams}` : ""}
            {typeof teamsCount === "number" && typeof matchesCount === "number" ? " · " : ""}
            {typeof matchesCount === "number" ? `${matchesCount} ${t.matches}` : ""}
          </Text>
        )}
        {winnerName ? (
          <Text style={cardMeta}>
            {t.winner}: <strong>{winnerName}</strong>
          </Text>
        ) : null}
      </Section>

      <Text style={text}>{t.nextLead}</Text>

      <Section style={{ textAlign: "center", marginTop: "24px" }}>
        <Button href={pricingUrl} style={button}>
          {t.cta}
        </Button>
      </Section>

      <Text style={{ ...text, marginTop: "24px" }}>{t.foot}</Text>
    </EmailShell>
  );
};

const h1 = { fontSize: "20px", fontWeight: 600, color: "#0f172a", marginBottom: "12px" };
const text = { fontSize: "15px", lineHeight: "22px", color: "#334155" };
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "16px 18px",
  marginTop: "12px",
};
const cardKicker = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "#64748b",
  margin: 0,
};
const cardTitle = { fontSize: "16px", fontWeight: 600, color: "#0f172a", margin: "4px 0 6px" };
const cardMeta = { fontSize: "13px", color: "#475569", margin: "2px 0" };
const button = {
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  padding: "12px 22px",
  borderRadius: "10px",
  textDecoration: "none",
};

export const template = {
  component: TournamentCompletedEmail,
  subject: (data: Record<string, any>) => {
    const l = pickLocale(data.locale);
    return T[l].subject(data.tournamentName ?? "");
  },
  displayName: "Tournament completed",
  previewData: {
    recipientFirstName: "Marie",
    tournamentName: "Tournoi Saint-Étienne U15",
    teamsCount: 8,
    matchesCount: 12,
    winnerName: "AS Saint-Étienne",
    pricingUrl: "https://www.clubero.app/pricing?utm_source=tournament_end_email",
    locale: "fr",
  },
} satisfies TemplateEntry;
