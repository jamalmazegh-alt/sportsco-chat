import * as React from "react";
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  displayName?: string;
  tournamentName?: string;
  roleLabel?: string;
  tournamentUrl: string;
  locale?: "fr" | "en";
}

const COPY = {
  fr: {
    preview: (t: string, r: string) => `Vous avez été ajouté à ${t} en tant que ${r}`,
    brand: "Clubero · Tournois",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (t: string, r: string) => (
      <>Vous venez d'être ajouté à l'organisation du tournoi <strong>{t}</strong> en tant que <strong>{r}</strong>. Vous pouvez accéder dès maintenant au tournoi depuis votre tableau de bord.</>
    ),
    cta: "Accéder au tournoi",
    or: "Ou copiez ce lien dans votre navigateur :",
    footer: "Si vous n'attendiez pas cet email, vous pouvez l'ignorer en toute sécurité.",
    subject: (t: string, r: string) => `Vous avez été ajouté à ${t} (${r})`,
  },
  en: {
    preview: (t: string, r: string) => `You have been added to ${t} as ${r}`,
    brand: "Clubero · Tournaments",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hello,"),
    body: (t: string, r: string) => (
      <>You have just been added to the organization of tournament <strong>{t}</strong> as <strong>{r}</strong>. You can access the tournament right away from your dashboard.</>
    ),
    cta: "Open tournament",
    or: "Or copy this link in your browser:",
    footer: "If you didn't expect this email, you can safely ignore it.",
    subject: (t: string, r: string) => `You've been added to ${t} (${r})`,
  },
};

const TournamentMemberAddedEmail = ({
  displayName,
  tournamentName,
  roleLabel,
  tournamentUrl,
  locale = "fr",
}: Props) => {
  const c = COPY[locale] ?? COPY.fr;
  const tournament = tournamentName ?? (locale === "fr" ? "un tournoi" : "a tournament");
  const role = roleLabel ?? (locale === "fr" ? "collaborateur" : "collaborator");
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{c.preview(tournament, role)}</Preview>
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
            <Text style={brand}>{c.brand}</Text>
          </Section>
          <Heading style={h1}>{c.hello(displayName)}</Heading>
          <Text style={text}>{c.body(tournament, role)}</Text>
          <Button style={button} href={tournamentUrl}>{c.cta}</Button>
          <Text style={small}>
            {c.or}<br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{tournamentUrl}</span>
          </Text>
          <Text style={footer}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TournamentMemberAddedEmail,
  subject: (data) => {
    const locale = (data.locale === "en" ? "en" : "fr") as "fr" | "en";
    const c = COPY[locale];
    const t = data.tournamentName ?? (locale === "fr" ? "un tournoi" : "a tournament");
    const r = data.roleLabel ?? (locale === "fr" ? "collaborateur" : "collaborator");
    return c.subject(t, r);
  },
  displayName: "Tournament member added",
  previewData: {
    displayName: "Alex",
    tournamentName: "Coupe d'été 2026",
    roleLabel: "arbitre",
    tournamentUrl: "https://clubero.app/tournament/coupe-ete-2026",
    locale: "fr",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "8px 0 0", textAlign: "center" as const };
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
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
