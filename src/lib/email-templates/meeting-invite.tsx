import * as React from "react";
import { Button, Column, Heading, Row, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Props {
  displayName?: string | null;
  meetingTitle: string;
  meetingStartsAt?: string | null;
  location?: string | null;
  clubName?: string | null;
  eventUrl: string;
  respondUrl?: string | null;
  locale?: Locale;
}

const COPY: Record<
  Locale,
  {
    preview: (t: string) => string;
    hello: (n?: string | null) => string;
    title: string;
    body: (t: string, c?: string | null) => React.ReactNode;
    whenLabel: string;
    whereLabel: string;
    cta: string;
    respondPrompt: string;
    btnPresent: string;
    btnUncertain: string;
    btnAbsent: string;
    foot: string;
    or: string;
    subject: (t: string) => string;
    dateLocale: string;
  }
> = {
  fr: {
    preview: (t) => `Vous êtes convoqué·e à la réunion « ${t} »`,
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: "Convocation à une réunion",
    body: (t, c) => (
      <>
        Vous êtes convoqué·e à la réunion <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organisée par <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Quand",
    whereLabel: "Où",
    cta: "Voir la réunion",
    respondPrompt: "Répondez en un clic :",
    btnPresent: "✅ Présent",
    btnUncertain: "❔ Incertain",
    btnAbsent: "❌ Absent",
    foot: "Pas besoin de vous connecter — votre réponse est enregistrée automatiquement et vous pourrez la modifier plus tard.",
    or: "Ou copiez ce lien dans votre navigateur :",
    subject: (t) => `Convocation : ${t}`,
    dateLocale: "fr-FR",
  },
  en: {
    preview: (t) => `You are invited to the meeting "${t}"`,
    hello: (n) => (n ? `Hi ${n},` : "Hello,"),
    title: "Meeting invitation",
    body: (t, c) => (
      <>
        You are invited to the meeting <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organised by <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "When",
    whereLabel: "Where",
    cta: "View meeting",
    respondPrompt: "Reply in one tap:",
    btnPresent: "✅ Present",
    btnUncertain: "❔ Uncertain",
    btnAbsent: "❌ Absent",
    foot: "No need to sign in — your response is saved automatically and you can change it later.",
    or: "Or copy this link in your browser:",
    subject: (t) => `Meeting invitation: ${t}`,
    dateLocale: "en-GB",
  },
  de: {
    preview: (t) => `Sie sind zur Besprechung „${t}" eingeladen`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Einladung zur Besprechung",
    body: (t, c) => (
      <>
        Sie sind zur Besprechung <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            von <strong>{c}</strong>
          </>
        ) : null}{" "}
        eingeladen.
      </>
    ),
    whenLabel: "Wann",
    whereLabel: "Wo",
    cta: "Besprechung ansehen",
    respondPrompt: "Antworte mit einem Klick:",
    btnPresent: "✅ Anwesend",
    btnUncertain: "❔ Vielleicht",
    btnAbsent: "❌ Abwesend",
    foot: "Kein Login nötig — deine Antwort wird automatisch gespeichert und kann später geändert werden.",
    or: "Oder kopieren Sie diesen Link in Ihren Browser:",
    subject: (t) => `Einladung: ${t}`,
    dateLocale: "de-DE",
  },
  es: {
    preview: (t) => `Estás convocado·a a la reunión «${t}»`,
    hello: (n) => (n ? `Hola ${n},` : "Hola,"),
    title: "Convocatoria a una reunión",
    body: (t, c) => (
      <>
        Estás convocado·a a la reunión <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organizada por <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Cuándo",
    whereLabel: "Dónde",
    cta: "Ver la reunión",
    respondPrompt: "Responde en un clic:",
    btnPresent: "✅ Presente",
    btnUncertain: "❔ Tal vez",
    btnAbsent: "❌ Ausente",
    foot: "No hace falta iniciar sesión — tu respuesta se guarda automáticamente y podrás modificarla más tarde.",
    or: "O copia este enlace en tu navegador:",
    subject: (t) => `Convocatoria: ${t}`,
    dateLocale: "es-ES",
  },
  it: {
    preview: (t) => `Sei convocato·a alla riunione «${t}»`,
    hello: (n) => (n ? `Ciao ${n},` : "Ciao,"),
    title: "Convocazione a una riunione",
    body: (t, c) => (
      <>
        Sei convocato·a alla riunione <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organizzata da <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Quando",
    whereLabel: "Dove",
    cta: "Vedi la riunione",
    respondPrompt: "Rispondi in un clic:",
    btnPresent: "✅ Presente",
    btnUncertain: "❔ Forse",
    btnAbsent: "❌ Assente",
    foot: "Nessun login necessario — la tua risposta viene salvata automaticamente e potrai modificarla in seguito.",
    or: "Oppure copia questo link nel tuo browser:",
    subject: (t) => `Convocazione: ${t}`,
    dateLocale: "it-IT",
  },
  nl: {
    preview: (t) => `Je bent uitgenodigd voor de vergadering "${t}"`,
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Uitnodiging voor een vergadering",
    body: (t, c) => (
      <>
        Je bent uitgenodigd voor de vergadering <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            van <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Wanneer",
    whereLabel: "Waar",
    cta: "Vergadering bekijken",
    respondPrompt: "Antwoord in één klik:",
    btnPresent: "✅ Aanwezig",
    btnUncertain: "❔ Misschien",
    btnAbsent: "❌ Afwezig",
    foot: "Geen aanmelding nodig — je antwoord wordt automatisch opgeslagen en kan later worden gewijzigd.",
    or: "Of kopieer deze link in je browser:",
    subject: (t) => `Uitnodiging: ${t}`,
    dateLocale: "nl-NL",
  },
  pt: {
    preview: (t) => `Você foi convocado·a para a reunião "${t}"`,
    hello: (n) => (n ? `Olá ${n},` : "Olá,"),
    title: "Convocação para uma reunião",
    body: (t, c) => (
      <>
        Você foi convocado·a para a reunião <strong>{t}</strong>
        {c ? (
          <>
            {" "}
            organizada por <strong>{c}</strong>
          </>
        ) : null}
        .
      </>
    ),
    whenLabel: "Quando",
    whereLabel: "Onde",
    cta: "Ver a reunião",
    respondPrompt: "Responde com um clique:",
    btnPresent: "✅ Presente",
    btnUncertain: "❔ Talvez",
    btnAbsent: "❌ Ausente",
    foot: "Não é preciso iniciar sessão — a tua resposta é guardada automaticamente e podes alterá-la mais tarde.",
    or: "Ou copie este link no seu navegador:",
    subject: (t) => `Convocação: ${t}`,
    dateLocale: "pt-PT",
  },
};

function pickLocale(l?: string): Locale {
  const v = (l ?? "fr").toLowerCase().slice(0, 2);
  return (["fr", "en", "de", "es", "it", "nl", "pt"] as const).includes(v as Locale)
    ? (v as Locale)
    : "fr";
}

function formatWhen(iso: string | null | undefined, dateLocale: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(dateLocale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

const MeetingInviteEmail = ({
  displayName,
  meetingTitle,
  meetingStartsAt,
  location,
  clubName,
  eventUrl,
  respondUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const c = COPY[l];
  const when = formatWhen(meetingStartsAt, c.dateLocale);
  return (
    <EmailShell preview={c.preview(meetingTitle)} locale={l}>
      <Heading style={h1}>{c.hello(displayName)}</Heading>
      <Heading style={h2}>{c.title}</Heading>
      <Text style={text}>{c.body(meetingTitle, clubName)}</Text>
      {when ? (
        <Text style={meta}>
          <strong>{c.whenLabel} :</strong> {when}
        </Text>
      ) : null}
      {location ? (
        <Text style={meta}>
          <strong>{c.whereLabel} :</strong> {location}
        </Text>
      ) : null}

      {respondUrl ? (
        <>
          <Text style={{ ...text, marginTop: 20 }}>{c.respondPrompt}</Text>
          <Section style={{ margin: "0 0 12px" }}>
            <Row>
              <Column style={{ width: "33%", paddingRight: 6 }}>
                <Button style={btnPresent} href={`${respondUrl}?s=present&lang=${l}`}>
                  {c.btnPresent}
                </Button>
              </Column>
              <Column style={{ width: "34%", paddingRight: 6 }}>
                <Button style={btnUncertain} href={`${respondUrl}?s=uncertain&lang=${l}`}>
                  {c.btnUncertain}
                </Button>
              </Column>
              <Column style={{ width: "33%" }}>
                <Button style={btnAbsent} href={`${respondUrl}?s=absent&lang=${l}`}>
                  {c.btnAbsent}
                </Button>
              </Column>
            </Row>
          </Section>
          <Text style={smallFoot}>{c.foot}</Text>
        </>
      ) : null}

      <Button style={button} href={eventUrl}>
        {c.cta}
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
  component: MeetingInviteEmail,
  subject: (data) => {
    const c = COPY[pickLocale(data.locale)];
    return c.subject(data.meetingTitle ?? "Réunion");
  },
  displayName: "Meeting invitation",
  previewData: {
    displayName: "Alex",
    meetingTitle: "Réunion staff",
    meetingStartsAt: new Date().toISOString(),
    location: "Salle du club",
    clubName: "FC Clubero",
    eventUrl: "https://clubero.app/events/abc",
    respondUrl: "https://clubero.app/rm/sample-token",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 8px" };
const h2 = { fontSize: "16px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const meta = { fontSize: "14px", color: "#334155", lineHeight: "1.5", margin: "0 0 8px" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "12px",
};
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
const smallFoot = { fontSize: "12px", color: "#64748b", margin: "0 0 16px", lineHeight: "1.5" };
const btnBase = {
  display: "block",
  textAlign: "center" as const,
  fontSize: "14px",
  fontWeight: "bold" as const,
  borderRadius: "10px",
  padding: "12px 4px",
  textDecoration: "none",
  width: "100%",
};
const btnPresent = { ...btnBase, backgroundColor: "#16a34a", color: "#ffffff" };
const btnUncertain = { ...btnBase, backgroundColor: "#f59e0b", color: "#ffffff" };
const btnAbsent = { ...btnBase, backgroundColor: "#dc2626", color: "#ffffff" };
