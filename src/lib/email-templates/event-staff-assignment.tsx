import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";


type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";
type Action = "assigned" | "unassigned";

interface Props {
  displayName?: string;
  action: Action;
  eventLabel: string; // e.g. "Match vs Espanyol" or event title
  teamName?: string;
  dateStr: string;
  timeStr?: string;
  eventUrl: string;
  locale?: Locale;
}

const COPY: Record<
  Locale,
  {
    brand: string;
    hello: (n?: string) => string;
    titleAssigned: string;
    titleUnassigned: string;
    bodyAssigned: (e: string, t: string, d: string, tm?: string) => React.ReactNode;
    bodyUnassigned: (e: string, t: string) => React.ReactNode;
    ctaAssigned: string;
    ctaUnassigned: string;
    or: string;
    subjectAssigned: (e: string) => string;
    subjectUnassigned: (e: string) => string;
    at: string;
  }
> = {
  fr: {
    brand: "Clubero",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    titleAssigned: "Tu as été assigné à un événement",
    titleUnassigned: "Assignation retirée",
    bodyAssigned: (e, t, d, tm) => (
      <>
        Tu as été assigné en tant qu'<strong>encadrant</strong> à <strong>{e}</strong>
        {tm ? <> de <strong>{tm}</strong></> : null}, le <strong>{d}</strong>
        {t ? <> à <strong>{t}</strong></> : null}.
      </>
    ),
    bodyUnassigned: (e, tm) => (
      <>
        Tu n'es plus <strong>encadrant</strong> de <strong>{e}</strong>
        {tm ? <> de <strong>{tm}</strong></> : null}.
      </>
    ),
    ctaAssigned: "Voir l'événement",
    ctaUnassigned: "Voir l'événement",
    or: "Ou copie ce lien dans ton navigateur :",
    subjectAssigned: (e) => `Tu as été assigné comme encadrant à ${e}`,
    subjectUnassigned: (e) => `Encadrement retiré : ${e}`,
    at: "à",
  },
  en: {
    brand: "Clubero",
    hello: (n) => (n ? `Hi ${n},` : "Hello,"),
    titleAssigned: "You have been assigned to an event",
    titleUnassigned: "Assignment removed",
    bodyAssigned: (e, t, d, tm) => (
      <>
        You have been assigned as <strong>event staff</strong> to <strong>{e}</strong>
        {tm ? <> of <strong>{tm}</strong></> : null}, on <strong>{d}</strong>
        {t ? <> at <strong>{t}</strong></> : null}.
      </>
    ),
    bodyUnassigned: (e, tm) => (
      <>
        You are no longer <strong>event staff</strong> for <strong>{e}</strong>
        {tm ? <> of <strong>{tm}</strong></> : null}.
      </>
    ),
    ctaAssigned: "Open the event",
    ctaUnassigned: "Open the event",
    or: "Or copy this link in your browser:",
    subjectAssigned: (e) => `You have been assigned as event staff to ${e}`,
    subjectUnassigned: (e) => `Event staff assignment removed: ${e}`,
    at: "at",
  },
  de: {
    brand: "Clubero",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    titleAssigned: "Du wurdest einem Ereignis zugewiesen",
    titleUnassigned: "Zuweisung entfernt",
    bodyAssigned: (e, t, d, tm) => (
      <>Du wurdest als <strong>Betreuer</strong> für <strong>{e}</strong>{tm ? <> von <strong>{tm}</strong></> : null} am <strong>{d}</strong>{t ? <> um <strong>{t}</strong></> : null} zugewiesen.</>
    ),
    bodyUnassigned: (e, tm) => (
      <>Du bist nicht mehr <strong>Betreuer</strong> von <strong>{e}</strong>{tm ? <> ({tm})</> : null}.</>
    ),
    ctaAssigned: "Ereignis öffnen",
    ctaUnassigned: "Ereignis öffnen",
    or: "Oder kopiere diesen Link in deinen Browser:",
    subjectAssigned: (e) => `Du wurdest als Betreuer zugewiesen: ${e}`,
    subjectUnassigned: (e) => `Betreuung entfernt: ${e}`,
    at: "um",
  },
  es: {
    brand: "Clubero",
    hello: (n) => (n ? `Hola ${n},` : "Hola,"),
    titleAssigned: "Has sido asignado a un evento",
    titleUnassigned: "Asignación retirada",
    bodyAssigned: (e, t, d, tm) => (
      <>Has sido asignado como <strong>responsable</strong> a <strong>{e}</strong>{tm ? <> de <strong>{tm}</strong></> : null}, el <strong>{d}</strong>{t ? <> a las <strong>{t}</strong></> : null}.</>
    ),
    bodyUnassigned: (e, tm) => (
      <>Ya no eres <strong>responsable</strong> de <strong>{e}</strong>{tm ? <> de <strong>{tm}</strong></> : null}.</>
    ),
    ctaAssigned: "Abrir el evento",
    ctaUnassigned: "Abrir el evento",
    or: "O copia este enlace en tu navegador:",
    subjectAssigned: (e) => `Has sido asignado como responsable a ${e}`,
    subjectUnassigned: (e) => `Responsabilidad retirada: ${e}`,
    at: "a las",
  },
  it: {
    brand: "Clubero",
    hello: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    titleAssigned: "Sei stato assegnato a un evento",
    titleUnassigned: "Assegnazione rimossa",
    bodyAssigned: (e, t, d, tm) => (
      <>Sei stato assegnato come <strong>responsabile</strong> a <strong>{e}</strong>{tm ? <> di <strong>{tm}</strong></> : null}, il <strong>{d}</strong>{t ? <> alle <strong>{t}</strong></> : null}.</>
    ),
    bodyUnassigned: (e, tm) => (
      <>Non sei più <strong>responsabile</strong> di <strong>{e}</strong>{tm ? <> di <strong>{tm}</strong></> : null}.</>
    ),
    ctaAssigned: "Apri l'evento",
    ctaUnassigned: "Apri l'evento",
    or: "Oppure copia questo link nel tuo browser:",
    subjectAssigned: (e) => `Sei stato assegnato come responsabile a ${e}`,
    subjectUnassigned: (e) => `Responsabilità rimossa: ${e}`,
    at: "alle",
  },
  nl: {
    brand: "Clubero",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    titleAssigned: "Je bent toegewezen aan een evenement",
    titleUnassigned: "Toewijzing verwijderd",
    bodyAssigned: (e, t, d, tm) => (
      <>Je bent toegewezen als <strong>begeleider</strong> aan <strong>{e}</strong>{tm ? <> van <strong>{tm}</strong></> : null}, op <strong>{d}</strong>{t ? <> om <strong>{t}</strong></> : null}.</>
    ),
    bodyUnassigned: (e, tm) => (
      <>Je bent niet meer <strong>begeleider</strong> van <strong>{e}</strong>{tm ? <> van <strong>{tm}</strong></> : null}.</>
    ),
    ctaAssigned: "Evenement openen",
    ctaUnassigned: "Evenement openen",
    or: "Of kopieer deze link in je browser:",
    subjectAssigned: (e) => `Je bent toegewezen als begeleider aan ${e}`,
    subjectUnassigned: (e) => `Begeleiding verwijderd: ${e}`,
    at: "om",
  },
  pt: {
    brand: "Clubero",
    hello: (n) => (n ? `Olá ${n},` : "Olá,"),
    titleAssigned: "Você foi designado a um evento",
    titleUnassigned: "Designação removida",
    bodyAssigned: (e, t, d, tm) => (
      <>Você foi designado como <strong>responsável</strong> em <strong>{e}</strong>{tm ? <> de <strong>{tm}</strong></> : null}, em <strong>{d}</strong>{t ? <> às <strong>{t}</strong></> : null}.</>
    ),
    bodyUnassigned: (e, tm) => (
      <>Você não é mais <strong>responsável</strong> por <strong>{e}</strong>{tm ? <> de <strong>{tm}</strong></> : null}.</>
    ),
    ctaAssigned: "Abrir o evento",
    ctaUnassigned: "Abrir o evento",
    or: "Ou copie este link no seu navegador:",
    subjectAssigned: (e) => `Você foi designado como responsável em ${e}`,
    subjectUnassigned: (e) => `Responsabilidade removida: ${e}`,
    at: "às",
  },
};


function pickLocale(l?: string): Locale {
  const v = (l ?? "fr").toLowerCase().slice(0, 2);
  return (["fr", "en", "de", "es", "it", "nl", "pt"] as const).includes(v as Locale)
    ? (v as Locale)
    : "fr";
}

const EventStaffAssignmentEmail = ({
  displayName,
  action,
  eventLabel,
  teamName,
  dateStr,
  timeStr,
  eventUrl,
  locale,
}: Props) => {
  const c = COPY[pickLocale(locale)];
  const isAssigned = action === "assigned";
  return (
    <EmailShell preview={isAssigned ? c.subjectAssigned(eventLabel) : c.subjectUnassigned(eventLabel)} locale={"fr"}>
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
      <Heading style={h2}>{isAssigned ? c.titleAssigned : c.titleUnassigned}</Heading>
      <Text style={text}>
        {isAssigned
          ? c.bodyAssigned(eventLabel, timeStr ?? "", dateStr, teamName)
          : c.bodyUnassigned(eventLabel, teamName ?? "")}
      </Text>
      <Button style={button} href={eventUrl}>
        {isAssigned ? c.ctaAssigned : c.ctaUnassigned}
      </Button>
      <Text style={small}>
        {c.or}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{eventUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: EventStaffAssignmentEmail,
  subject: (data) => {
    const c = COPY[pickLocale(data.locale)];
    return data.action === "assigned"
      ? c.subjectAssigned(data.eventLabel ?? "")
      : c.subjectUnassigned(data.eventLabel ?? "");
  },
  displayName: "Event staff assignment",
  previewData: {
    displayName: "Alex",
    action: "assigned",
    eventLabel: "Match vs Espanyol",
    teamName: "U15",
    dateStr: "sam. 15 mars",
    timeStr: "14:30",
    eventUrl: "https://clubero.app/events/abc",
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
