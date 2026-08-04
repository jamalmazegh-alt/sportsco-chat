import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface TournamentPaymentRequestProps {
  teamName?: string;
  tournamentName?: string;
  amountLabel?: string;
  paymentUrl: string;
  expiresInDays?: number;
  locale?: string;
}

const T = {
  fr: {
    defaultTeam: "votre équipe",
    defaultTournament: "le tournoi",
    defaultAmount: "le montant indiqué",
    fallbackSubjectTournament: "votre tournoi",
    preview: (tournament: string) => `Paiement inscription — ${tournament}`,
    brand: "Clubero · Tournois",
    hello: (team: string) => `Bonjour ${team},`,
    body: (tournament: string) => (
      <>
        Voici le lien de paiement pour finaliser votre inscription au tournoi{" "}
        <strong>{tournament}</strong>.
      </>
    ),
    cta: "Payer maintenant",
    orLink: "Ou copiez ce lien dans votre navigateur :",
    subject: (tournament: string) => `Paiement inscription — ${tournament}`,
  },
  en: {
    defaultTeam: "your team",
    defaultTournament: "the tournament",
    defaultAmount: "the amount shown",
    fallbackSubjectTournament: "your tournament",
    preview: (tournament: string) => `Registration payment — ${tournament}`,
    brand: "Clubero · Tournaments",
    hello: (team: string) => `Hi ${team},`,
    body: (tournament: string) => (
      <>
        Here is the payment link to complete your registration for tournament{" "}
        <strong>{tournament}</strong>.
      </>
    ),
    cta: "Pay now",
    orLink: "Or copy this link into your browser:",
    subject: (tournament: string) => `Registration payment — ${tournament}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const TournamentPaymentRequestEmail = ({
  teamName,
  tournamentName,
  amountLabel,
  paymentUrl,
  locale,
}: TournamentPaymentRequestProps) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const team = teamName ?? t.defaultTeam;
  const tournament = tournamentName ?? t.defaultTournament;
  const amount = amountLabel ?? t.defaultAmount;

  return (
    <EmailShell preview={t.preview(tournament)} locale={l}>
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
      <Heading style={h1}>{t.hello(team)}</Heading>
      <Text style={text}>{t.body(tournament)}</Text>
      <Text style={amountText}>{amount}</Text>
      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Button style={button} href={paymentUrl}>
          {t.cta}
        </Button>
      </Section>
      <Text style={small}>
        {t.orLink}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{paymentUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: TournamentPaymentRequestEmail,
  subject: (data) => {
    const l = pickLocale((data as { locale?: string }).locale);
    const t = pick(l);
    const tournament = (data.tournamentName as string | undefined) ?? t.fallbackSubjectTournament;
    return t.subject(tournament);
  },
  displayName: "Tournament registration payment request",
  previewData: {
    teamName: "FC Demo",
    tournamentName: "Coupe d'été 2026",
    amountLabel: "25,00 €",
    paymentUrl: "https://clubero.app/t/coupe-ete/pay/sample-id",
    expiresInDays: 7,
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
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const amountText = {
  fontSize: "26px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "16px 0",
  textAlign: "center" as const,
};
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
