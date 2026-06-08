import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Props {
  displayName?: string;
  teamName?: string;
  clubName?: string;
  teamUrl: string;
  locale?: Locale;
}

const COPY: Record<Locale, {
  preview: (t: string, c: string) => string;
  brand: string;
  hello: (n?: string) => string;
  title: string;
  body: (t: string, c: string) => React.ReactNode;
  cta: string;
  or: string;
  subject: (t: string, c: string) => string;
}> = {
  fr: {
    preview: (t, c) => `Vous avez été ajouté comme coach de ${t} (${c})`,
    brand: "Clubero",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: "Vous avez été ajouté à une équipe",
    body: (t, c) => <>Vous êtes maintenant coach de <strong>{t}</strong> au club <strong>{c}</strong>.</>,
    cta: "Accéder à l'équipe",
    or: "Ou copiez ce lien dans votre navigateur :",
    subject: (t, c) => `Vous êtes maintenant coach de ${t} (${c})`,
  },
  en: {
    preview: (t, c) => `You have been added as coach of ${t} (${c})`,
    brand: "Clubero",
    hello: (n) => (n ? `Hi ${n},` : "Hello,"),
    title: "You have been added to a team",
    body: (t, c) => <>You are now coach of <strong>{t}</strong> at <strong>{c}</strong>.</>,
    cta: "Open the team",
    or: "Or copy this link in your browser:",
    subject: (t, c) => `You are now coach of ${t} (${c})`,
  },
  de: {
    preview: (t, c) => `Sie wurden als Trainer von ${t} (${c}) hinzugefügt`,
    brand: "Clubero",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Sie wurden einem Team hinzugefügt",
    body: (t, c) => <>Sie sind jetzt Trainer von <strong>{t}</strong> bei <strong>{c}</strong>.</>,
    cta: "Team öffnen",
    or: "Oder kopieren Sie diesen Link in Ihren Browser:",
    subject: (t, c) => `Sie sind jetzt Trainer von ${t} (${c})`,
  },
  es: {
    preview: (t, c) => `Has sido añadido como entrenador de ${t} (${c})`,
    brand: "Clubero",
    hello: (n) => (n ? `Hola ${n},` : "Hola,"),
    title: "Has sido añadido a un equipo",
    body: (t, c) => <>Ahora eres entrenador de <strong>{t}</strong> en <strong>{c}</strong>.</>,
    cta: "Abrir el equipo",
    or: "O copia este enlace en tu navegador:",
    subject: (t, c) => `Ahora eres entrenador de ${t} (${c})`,
  },
  it: {
    preview: (t, c) => `Sei stato aggiunto come allenatore di ${t} (${c})`,
    brand: "Clubero",
    hello: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    title: "Sei stato aggiunto a una squadra",
    body: (t, c) => <>Ora sei allenatore di <strong>{t}</strong> presso <strong>{c}</strong>.</>,
    cta: "Apri la squadra",
    or: "Oppure copia questo link nel tuo browser:",
    subject: (t, c) => `Ora sei allenatore di ${t} (${c})`,
  },
  nl: {
    preview: (t, c) => `Je bent toegevoegd als coach van ${t} (${c})`,
    brand: "Clubero",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Je bent toegevoegd aan een team",
    body: (t, c) => <>Je bent nu coach van <strong>{t}</strong> bij <strong>{c}</strong>.</>,
    cta: "Team openen",
    or: "Of kopieer deze link in je browser:",
    subject: (t, c) => `Je bent nu coach van ${t} (${c})`,
  },
  pt: {
    preview: (t, c) => `Você foi adicionado como treinador de ${t} (${c})`,
    brand: "Clubero",
    hello: (n) => (n ? `Olá ${n},` : "Olá,"),
    title: "Você foi adicionado a uma equipe",
    body: (t, c) => <>Agora você é treinador de <strong>{t}</strong> no <strong>{c}</strong>.</>,
    cta: "Abrir a equipe",
    or: "Ou copie este link no seu navegador:",
    subject: (t, c) => `Agora você é treinador de ${t} (${c})`,
  },
};

function pickLocale(l?: string): Locale {
  const v = (l ?? "fr").toLowerCase().slice(0, 2);
  return (["fr","en","de","es","it","nl","pt"] as const).includes(v as Locale) ? (v as Locale) : "fr";
}

const CoachAssignedEmail = ({ displayName, teamName, clubName, teamUrl, locale }: Props) => {
  const c = COPY[pickLocale(locale)];
  const team = teamName ?? "";
  const club = clubName ?? "";
  return (
    <EmailShell preview={c.preview(team, club)} locale={"fr"}>
      <Section style={header}>
        <Img src="https://www.clubero.app/clubero-logo.png" alt="Clubero" width="56" height="56" style={logo} />
        <Text style={brand}>{c.brand}</Text>
      </Section>
      <Heading style={h1}>{c.hello(displayName)}</Heading>
      <Heading style={h2}>{c.title}</Heading>
      <Text style={text}>{c.body(team, club)}</Text>
      <Button style={button} href={teamUrl}>{c.cta}</Button>
      <Text style={small}>
        {c.or}<br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{teamUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: CoachAssignedEmail,
  subject: (data) => {
    const c = COPY[pickLocale(data.locale)];
    return c.subject(data.teamName ?? "", data.clubName ?? "");
  },
  displayName: "Coach assigned to team",
  previewData: {
    displayName: "Alex",
    teamName: "U15 Élite",
    clubName: "FC Clubero",
    teamUrl: "https://clubero.app/teams/abc",
    locale: "fr",
  },
} satisfies TemplateEntry;

const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "8px 0 0", textAlign: "center" as const };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 8px" };
const h2 = { fontSize: "16px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
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
