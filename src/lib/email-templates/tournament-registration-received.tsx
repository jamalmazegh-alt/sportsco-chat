import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  organizerName?: string;
  tournamentName?: string;
  teamName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  manageUrl: string;
  requiresApproval?: boolean;
  locale?: string;
}

const T = {
  fr: {
    defaultTournament: "votre tournoi",
    preview: (team: string) => `Nouvelle inscription : ${team}`,
    brand: "Clubero · Tournois",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (tournament: string) => (
      <>
        Une nouvelle équipe vient de s'inscrire à <strong>{tournament}</strong> :
      </>
    ),
    contact: "Contact",
    email: "Email",
    phone: "Téléphone",
    pending: "Cette inscription est en attente de votre validation.",
    auto: "L'équipe a été automatiquement ajoutée au tournoi.",
    ctaPending: "Valider l'inscription",
    ctaAuto: "Voir l'équipe",
    orLink: "Ou ouvrez ce lien :",
    subject: (team: string, tournament: string) => `Nouvelle inscription — ${team} (${tournament})`,
  },
  en: {
    defaultTournament: "your tournament",
    preview: (team: string) => `New registration: ${team}`,
    brand: "Clubero · Tournaments",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (tournament: string) => (
      <>
        A new team just registered for <strong>{tournament}</strong>:
      </>
    ),
    contact: "Contact",
    email: "Email",
    phone: "Phone",
    pending: "This registration is waiting for your approval.",
    auto: "The team was automatically added to the tournament.",
    ctaPending: "Approve registration",
    ctaAuto: "View team",
    orLink: "Or open this link:",
    subject: (team: string, tournament: string) => `New registration — ${team} (${tournament})`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const TournamentRegistrationReceivedEmail = ({
  organizerName,
  tournamentName,
  teamName,
  contactName,
  contactEmail,
  contactPhone,
  manageUrl,
  requiresApproval = true,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const tournament = tournamentName ?? t.defaultTournament;
  return (
    <EmailShell preview={t.preview(teamName)} locale={l}>
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
      <Heading style={h1}>{t.hello(organizerName)}</Heading>
      <Text style={text}>{t.body(tournament)}</Text>
      <Section style={card}>
        <Text style={cardTitle}>{teamName}</Text>
        {contactName && (
          <Text style={cardLine}>
            {t.contact} : {contactName}
          </Text>
        )}
        {contactEmail && (
          <Text style={cardLine}>
            {t.email} : {contactEmail}
          </Text>
        )}
        {contactPhone && (
          <Text style={cardLine}>
            {t.phone} : {contactPhone}
          </Text>
        )}
      </Section>
      <Text style={text}>{requiresApproval ? t.pending : t.auto}</Text>
      <Button style={button} href={manageUrl}>
        {requiresApproval ? t.ctaPending : t.ctaAuto}
      </Button>
      <Text style={small}>
        {t.orLink}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{manageUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: TournamentRegistrationReceivedEmail,
  subject: (data) => {
    const t = pick(pickLocale((data as { locale?: string }).locale));
    const tournament = (data.tournamentName as string | undefined) ?? t.defaultTournament;
    return t.subject((data.teamName as string | undefined) ?? "", tournament);
  },
  displayName: "Tournament registration received",
  previewData: {
    organizerName: "Alex",
    tournamentName: "Coupe d'été 2026",
    teamName: "FC Nantes",
    contactName: "Marie Dupont",
    contactEmail: "marie@example.com",
    contactPhone: "+33 6 12 34 56 78",
    manageUrl: "https://clubero.app/tournaments/sample",
    requiresApproval: true,
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
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const card = {
  backgroundColor: "#f1f5f9",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "0 0 20px",
};
const cardTitle = {
  fontSize: "16px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "0 0 6px",
};
const cardLine = { fontSize: "13px", color: "#475569", margin: "2px 0" };
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
